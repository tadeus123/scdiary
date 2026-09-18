/**
 * Airsup China company onboarding. Mounted at /airsup/china.
 * Isolated from people Airsup. Delete this folder to remove the company flow.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const multer = require('multer');
const db = require('./db');
const session = require('./session');
const { t, otherLang } = require('./i18n');
const { emailAllowedForSite, normalizeDomain, emailParts } = require('./domain');
const { buildPreview, companyDraftFromPreview } = require('./site-preview');
const quotations = require('./quotations');
const {
  CITIES,
  CONTACT_SLOTS,
  normalizeProfile,
  interactionReady,
  afterVerifyNext,
  companyTitle,
  fillEmptyCompany,
} = require('./fields');
const { proofPayload, formatChartDay, liveRoster } = require('./proof');
const { sendVerifyEmail } = require('./mail');
const { sendForDomain } = require('./send-quotes-invite');
const { saveInteraction, publishCompany } = require('./test/onboard');
const peopleAuth = require('../auth');
const handleLiveCompanies = require('./live-companies');

const router = express.Router();
const VIEWS = path.join(__dirname, 'views');
const SITE_VIEWS = path.join(__dirname, '../../views');
const CHINA_CSS_PATH = path.join(__dirname, 'public/china.css');
let chinaCssCache = null;

function readChinaCss() {
  if (chinaCssCache !== null) return chinaCssCache;
  try {
    chinaCssCache = fs.readFileSync(CHINA_CSS_PATH, 'utf8');
    return chinaCssCache;
  } catch (error) {
    console.error('Airsup china css missing:', error.message);
    return '';
  }
}

router.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  redirect: false,
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (/\.(mp4|webm|jpe?g|png|gif|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  },
}));

function publicOrigin(req) {
  return peopleAuth.getPublicOrigin(req);
}

function isOpenAiFetcher(req) {
  const ua = String(req.get('user-agent') || '').toLowerCase();
  return /gptbot|chatgpt-user|oai-searchbot|oai-adsbot|openai/.test(ua);
}

function langFrom(req, res) {
  const lang = session.readLang(req);
  // Do not force a cookie on every hit — ChatGPT / OpenAI fetchers often refuse Set-Cookie pages.
  if (isOpenAiFetcher(req)) return lang;
  const asked = String((req.query && req.query.lang) || '').toLowerCase();
  if (asked === 'en' || asked === 'zh') return session.setLang(req, res, asked);
  return lang;
}

let proofCache = { at: 0, data: proofPayload([]) };

async function proof() {
  const now = Date.now();
  if (now - proofCache.at < 60 * 1000) return proofCache.data;
  if (!db.isConfigured()) return proofCache.data;
  try {
    const data = await Promise.race([
      db.listCompaniesProof().then(proofPayload),
      new Promise((_, reject) => setTimeout(() => reject(new Error('proof timeout')), 1800)),
    ]);
    proofCache = { at: now, data };
    return data;
  } catch (error) {
    if (error && error.message !== 'proof timeout') {
      console.error('Airsup china proof error:', error);
    }
    proofCache = { at: now, data: proofCache.data };
    return proofCache.data;
  }
}

function render(req, res, viewName, extra = {}) {
  const lang = extra.lang || langFrom(req, res);
  const viewFile = path.join(VIEWS, viewName);
  const locals = {
    ...res.app.locals,
    ...res.locals,
    lang,
    otherLang: otherLang(lang),
    t: (key) => t(lang, key),
    formatChartDay: (day) => formatChartDay(day, lang),
    here: `/airsup/china${req.path === '/' ? '' : req.path}`,
    landing: extra.landing !== undefined ? extra.landing : viewName === 'home.ejs',
    chinaCss: readChinaCss(),
    proofLine: extra.proof && (lang === 'en' ? extra.proof.line_en : extra.proof.line_zh),
    ...extra,
  };
  ejs.renderFile(
    viewFile,
    locals,
    {
      filename: viewFile,
      views: [VIEWS, SITE_VIEWS],
      root: SITE_VIEWS,
    },
    (err, html) => {
      if (err) {
        console.error('Airsup china render error:', err);
        return res.status(500).send('Failed to render');
      }
      res.send(html);
    }
  );
}

function setSeo(req, res, { title, description, noindex }) {
  const suffix = req.path === '/' ? '' : req.path;
  res.locals.seo = {
    title,
    description,
    path: `/airsup/china${suffix === '/china' ? '' : suffix}`,
    noindex: noindex !== false,
    includePersonSchema: false,
    ogLocale: (res.locals.lang === 'en' ? 'en_US' : 'zh_CN'),
    ogImage: '/airsup-og.png',
  };
}

function isMachinePath(pathname) {
  const path = String(pathname || '');
  return path.startsWith('/api/') || path === '/live.json' || path === '/live-companies.json';
}

function isPublicMarketingPath(pathname) {
  const path = String(pathname || '');
  return path === '/' || path === '' || path === '/preview';
}

router.use(async (req, res, next) => {
  const lang = langFrom(req, res);
  res.locals.lang = lang;
  res.set('Content-Language', lang === 'en' ? 'en' : 'zh-CN');
  if ((req.method === 'GET' || req.method === 'HEAD') && !isMachinePath(req.path)) {
    // Landing and preview must stay public so ChatGPT / OpenAI fetchers can read them.
    res.set('Cache-Control', isPublicMarketingPath(req.path) ? 'public, max-age=60' : 'private, max-age=60');
  }
  setSeo(req, res, {
    title: t(lang, 'title_home'),
    description: t(lang, 'desc_home'),
    noindex: req.path !== '/' && req.path !== '',
  });
  next();
});

function formFromCompany(company) {
  return {
    website: (company && company.website) || '',
    email: (company && company.contact_email) || '',
    contact: (company && company.contact_name) || '',
    city: (company && company.city) || 'shenzhen',
  };
}

async function applySiteDraft(company, website, lang) {
  if (!company || company.status === 'live') return company;
  try {
    const built = await buildPreview(website || company.website || company.domain, lang);
    if (!built.ok) return company;
    const draft = built.draft || companyDraftFromPreview(built);
    const next = fillEmptyCompany(company, draft);
    if (!String(next.goal || '').trim()) {
      next.goal = lang === 'en'
        ? 'Win qualified export RFQs from buyers who find us in ChatGPT.'
        : '让欧美采购通过 ChatGPT 找到我们并收到可报价的询盘。';
    }
    return db.updateCompany(company.company_id, {
      company_name: next.company_name,
      company_name_en: next.company_name_en,
      city: next.city,
      niche: next.niche,
      context: next.context,
      goal: next.goal,
      profile: next.profile,
    });
  } catch (error) {
    console.error('Airsup china scrape draft skipped:', error.message);
    return company;
  }
}

function tooSoon(company) {
  if (!company || !company.last_email_at) return false;
  return Date.now() - new Date(company.last_email_at).getTime() < 2 * 60 * 1000;
}

router.get(['/', ''], async (req, res) => {
  const company = session.readSid(req)
    ? await session.readCompany(req).catch(() => null)
    : null;
  if (company && (company.status === 'verified' || company.status === 'live')) {
    return res.redirect(afterVerifyNext(company));
  }
  render(req, res, 'home.ejs', {
    proof: await proof(),
    form: formFromCompany(company),
    error: null,
    cities: CITIES,
    source: String(req.query.ref || 'web').slice(0, 40),
  });
});

router.get('/privacy', async (req, res) => {
  setSeo(req, res, {
    title: t(langFrom(req, res), 'privacy_page_title'),
    description: t(langFrom(req, res), 'privacy_who_d'),
    noindex: false,
  });
  render(req, res, 'privacy.ejs', {
    proof: await proof(),
    landing: false,
    quietChrome: true,
  });
});

router.get('/lang/:code', (req, res) => {
  const lang = session.setLang(req, res, req.params.code);
  const next = String(req.query.next || '/airsup/china');
  const safe = next.startsWith('/airsup/china') && !next.startsWith('//') ? next : '/airsup/china';
  const url = new URL(safe, 'https://www.tademehl.com');
  url.searchParams.set('lang', lang);
  res.redirect(url.pathname + url.search);
});

async function renderPreview(req, res, { website, form, error, source }) {
  const lang = langFrom(req, res);
  const built = await buildPreview(website, lang);
  if (!built.ok) {
    return render(req, res, 'home.ejs', {
      proof: await proof(),
      form: { website: website || '', email: '', contact: '', city: 'shenzhen' },
      error: t(lang, built.error || 'err_website'),
      cities: CITIES,
      source: source || 'web',
    });
  }
  const nextForm = form || { website: built.website, email: '', contact: '', city: built.cityId || 'shenzhen' };
  return render(req, res, 'preview.ejs', {
    proof: await proof(),
    form: { ...nextForm, website: nextForm.website || built.website, city: nextForm.city || built.cityId || 'shenzhen' },
    error: error || null,
    source: source || 'web',
    preview: built,
    here: `/airsup/china/preview?w=${encodeURIComponent(built.domain)}`,
  });
}

router.post('/preview', async (req, res) => {
  const requestedLang = String((req.body && req.body.locale) || '');
  if (requestedLang === 'en' || requestedLang === 'zh') session.setLang(req, res, requestedLang);
  const website = String((req.body && req.body.website) || '');
  const source = String((req.body && req.body.source) || 'web').slice(0, 40);
  if (!peopleAuth.allowedOrigin(req)) {
    return renderPreview(req, res, { website, error: t(langFrom(req, res), 'err_origin'), source });
  }
  const built = await buildPreview(website, langFrom(req, res));
  if (!built.ok) {
    return renderPreview(req, res, { website, error: t(langFrom(req, res), built.error || 'err_website'), source });
  }
  return res.redirect(`/airsup/china/preview?w=${encodeURIComponent(built.domain)}&ref=${encodeURIComponent(source)}`);
});

router.get('/preview', async (req, res) => {
  const website = String(req.query.w || req.query.website || '');
  if (!website) return res.redirect('/airsup/china');
  const source = String(req.query.ref || 'web').slice(0, 40);
  const email = String(req.query.email || '').trim();
  const form = email
    ? { website, email, contact: '', city: 'shenzhen' }
    : undefined;
  return renderPreview(req, res, { website, source, form });
});

router.post('/start', async (req, res) => {
  const requestedLang = String((req.body && req.body.locale) || '');
  const lang = requestedLang === 'en' || requestedLang === 'zh'
    ? session.setLang(req, res, requestedLang)
    : langFrom(req, res);
  const website = String((req.body && req.body.website) || '');
  const email = String((req.body && req.body.email) || '');
  const contact = String((req.body && req.body.contact) || '').trim();
  const city = String((req.body && req.body.city) || 'shenzhen');
  const form = { website, email, contact, city };
  const source = String((req.body && req.body.source) || 'web').slice(0, 40);
  const fail = (errorKey) => renderPreview(req, res, {
    website,
    form,
    error: t(lang, errorKey),
    source,
  });
  if (!peopleAuth.allowedOrigin(req)) return fail('err_origin');
  let siteEmails = [];
  try {
    const built = await buildPreview(website, lang);
    if (built.ok && Array.isArray(built.siteEmails)) siteEmails = built.siteEmails;
  } catch (error) {
    console.error('Airsup china site email scrape skipped:', error.message);
  }
  let matched = emailAllowedForSite({ website, email, siteEmails });
  if (!matched.ok && matched.error === 'mismatch' && db.isConfigured()) {
    try {
      const site = normalizeDomain(website);
      const parts = emailParts(email);
      const allow = parts ? await db.getDomainAllow(site, parts.email) : null;
      if (allow && parts) {
        matched = {
          ok: true,
          domain: site,
          website: `https://${site}`,
          email: parts.email,
          reason: allow.source || 'outreach',
        };
      }
    } catch (error) {
      console.error('Airsup china allowlist check skipped:', error.message);
    }
  }
  if (!matched.ok) return fail(`err_${matched.error}`);
  if (!db.isConfigured()) return fail('err_db');
  try {
    // Only persist outreach/manual allow rows. Site-contact is re-checked via scrape each time.
    if (matched.reason === 'outreach' || matched.reason === 'manual') {
      await db.upsertDomainAllow({
        domain: matched.domain,
        contact_email: matched.email,
        source: matched.reason,
        note: '',
      }).catch((error) => console.error('Airsup china allow upsert skipped:', error.message));
    }
    let company = await db.getByDomain(matched.domain);
    if (company && tooSoon(company)) {
      return fail('err_rate');
    }
    if (!company) {
      company = await db.insertCompany({
        domain: matched.domain,
        website: matched.website,
        contact_email: matched.email,
        contact_name: contact,
        city: CITIES.some((item) => item.id === city) ? city : 'shenzhen',
        locale: lang,
        niche: 'cnc',
        status: 'pending',
        source,
      });
    } else if (company.status === 'pending') {
      const existingEmail = String(company.contact_email || '').toLowerCase();
      if (existingEmail && existingEmail !== matched.email) {
        return fail('err_taken');
      }
      company = await db.updateCompany(company.company_id, {
        website: matched.website,
        contact_email: matched.email,
        contact_name: contact || company.contact_name,
        city: CITIES.some((item) => item.id === city) ? city : company.city,
        locale: lang,
        source: company.source,
      });
    } else if (matched.email !== String(company.contact_email || '').toLowerCase()) {
      return fail('err_taken');
    }
    if (company.status === 'pending') {
      company = await applySiteDraft(company, matched.website, lang);
    }
    const purpose = company.status === 'pending' ? 'verify' : 'login';
    const token = await session.createToken(company.company_id, matched.email, purpose);
    const link = `${publicOrigin(req)}/airsup/china/verify?token=${token}`;
    await sendVerifyEmail({
      lang,
      to: matched.email,
      link,
      contactName: contact || company.contact_name,
    });
    await db.updateCompany(company.company_id, { last_email_at: new Date().toISOString() });
    return res.redirect(`/airsup/china/check?email=${encodeURIComponent(matched.email)}`);
  } catch (error) {
    console.error('Airsup china start error:', error);
    return fail(error.code === 'mail' ? 'err_mail' : 'err_db');
  }
});

router.get('/check', async (req, res) => {
  render(req, res, 'check.ejs', {
    proof: await proof(),
    email: String(req.query.email || ''),
  });
});

router.get('/claim', async (req, res) => {
  const lang = langFrom(req, res);
  const token = String(req.query.token || '');
  const fail = async (errorKey) => render(req, res, 'home.ejs', {
    proof: await proof(),
    form: formFromCompany(null),
    error: t(lang, errorKey),
    cities: CITIES,
  });
  if (!token || !db.isConfigured()) return fail('err_claim');
  try {
    const row = await db.getToken(session.sha256(token));
    if (!row || row.purpose !== 'claim') return fail('err_claim');
    const company = await db.getById(row.company_id);
    if (!company) return fail('err_claim');
    // Read-only view: do not scrape/write on GET (bots/prefetch).
    try {
      await db.touchDomainAllow(company.domain, row.email || company.contact_email, {
        claim_opened_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Airsup china claim open touch skipped:', error.message);
    }
    return render(req, res, 'claim.ejs', {
      proof: await proof(),
      company,
      companyTitle: companyTitle(company, lang),
      token,
      error: null,
    });
  } catch (error) {
    console.error('Airsup china claim error:', error);
    return fail('err_db');
  }
});

router.post('/claim/confirm', async (req, res) => {
  const lang = langFrom(req, res);
  const token = String((req.body && req.body.token) || '');
  const fail = async (errorKey) => render(req, res, 'home.ejs', {
    proof: await proof(),
    form: formFromCompany(null),
    error: t(lang, errorKey),
    cities: CITIES,
  });
  if (!peopleAuth.allowedOrigin(req)) return fail('err_origin');
  if (!token || !db.isConfigured()) return fail('err_claim');
  try {
    const peek = await db.getToken(session.sha256(token));
    if (!peek || peek.purpose !== 'claim') return fail('err_claim');
    const row = await db.takeToken(session.sha256(token));
    if (!row || row.purpose !== 'claim') return fail('err_claim');
    let company = await db.getById(row.company_id);
    if (!company) return fail('err_claim');
    const email = String(row.email || company.contact_email || '').toLowerCase();
    if (company.status === 'live') {
      // Live: session via verify only; do not change contact_email here.
    } else {
    company = await db.updateCompany(company.company_id, {
      contact_email: email,
      // Claim confirm only mails a verify link. Live happens after WeChat + how-you-work.
      source: company.source === 'web' ? 'outreach' : company.source,
      profile: normalizeProfile({
        ...normalizeProfile(company.profile),
        claim_ready: true,
      }),
    });
    }
    company = await applySiteDraft(company, company.website || company.domain, lang) || company;
    const verifyToken = await session.createToken(company.company_id, email, 'verify');
    const link = `${publicOrigin(req)}/airsup/china/verify?token=${verifyToken}`;
    await sendVerifyEmail({
      lang,
      to: email,
      link,
      contactName: company.contact_name,
    });
    await db.updateCompany(company.company_id, { last_email_at: new Date().toISOString() });
    return res.redirect(`/airsup/china/check?email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error('Airsup china claim confirm error:', error);
    return fail(error.code === 'mail' ? 'err_mail' : 'err_db');
  }
});

router.get('/verify', async (req, res) => {
  const lang = langFrom(req, res);
  const token = String(req.query.token || '');
  if (!token || !db.isConfigured()) {
    return render(req, res, 'home.ejs', {
      proof: await proof(),
      form: formFromCompany(null),
      error: t(lang, 'err_token'),
      cities: CITIES,
    });
  }
  try {
    const peek = await db.getToken(session.sha256(token));
    if (!peek || (peek.purpose !== 'verify' && peek.purpose !== 'login')) {
      return render(req, res, 'home.ejs', {
        proof: await proof(),
        form: formFromCompany(null),
        error: t(lang, 'err_token'),
        cities: CITIES,
      });
    }
    // Login links stay reusable until expiry so WeChat/email link-preview does not burn them.
    // Verify / claim tokens stay one-shot.
    let row = peek;
    if (peek.purpose === 'verify') {
      row = await db.takeToken(session.sha256(token));
      if (!row || row.purpose !== 'verify') {
        return render(req, res, 'home.ejs', {
          proof: await proof(),
          form: formFromCompany(null),
          error: t(lang, 'err_token'),
          cities: CITIES,
        });
      }
    }
    if (!row || (row.purpose !== 'verify' && row.purpose !== 'login')) {
      return render(req, res, 'home.ejs', {
        proof: await proof(),
        form: formFromCompany(null),
        error: t(lang, 'err_token'),
        cities: CITIES,
      });
    }
    const company = await db.getById(row.company_id);
    if (!company) {
      return render(req, res, 'home.ejs', {
        proof: await proof(),
        form: formFromCompany(null),
        error: t(lang, 'err_token'),
        cities: CITIES,
      });
    }
    const patch = {};
    if (company.status === 'pending') {
      patch.contact_email = row.email || company.contact_email;
      patch.status = 'verified';
      patch.verified_at = new Date().toISOString();
    } else if (company.status === 'verified' && row.email) {
      // Keep mailbox aligned only while not live.
      patch.contact_email = row.email;
    }
    // Never change contact_email or status for live (pause stays paused until explicit publish).
    if (Object.keys(patch).length) {
      await db.updateCompany(company.company_id, patch);
    }
    await session.createSession(req, res, company.company_id);
    let fresh = await db.getById(company.company_id);
    if (fresh && (fresh.status === 'pending' || fresh.status === 'verified')) {
      fresh = await applySiteDraft(fresh, company.website || company.domain, lang) || fresh;
    }
    return res.redirect(afterVerifyNext(fresh, req.query.next));
  } catch (error) {
    console.error('Airsup china verify error:', error);
    return render(req, res, 'home.ejs', {
      proof: await proof(),
      form: formFromCompany(null),
      error: t(lang, 'err_db'),
      cities: CITIES,
    });
  }
});

async function requireCompany(req, res) {
  const company = await session.readCompany(req);
  if (!company) {
    res.redirect('/airsup/china');
    return null;
  }
  return company;
}

async function requireCompanyApi(req, res) {
  const company = await session.readCompany(req);
  if (!company) {
    res.status(401).json({ error: 'auth_required' });
    return null;
  }
  return company;
}

const quoteUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: quotations.MAX_BYTES, files: 1 },
});

async function showOnboard(req, res, { company, error }) {
  const profile = normalizeProfile(company.profile);
  return render(req, res, 'onboard.ejs', {
    proof: await proof(),
    company,
    profile,
    catalogs: { CONTACT_SLOTS },
    error: error || null,
    askTolerance: !String(profile.tolerance || '').trim(),
    askMoq: !String(profile.moq || '').trim(),
    headerLive: company.status === 'live',
  });
}

router.get('/onboard', async (req, res) => {
  const company = await requireCompany(req, res);
  if (!company) return;
  if (company.status === 'live' || interactionReady(company)) {
    return res.redirect('/airsup/dashboard');
  }
  return showOnboard(req, res, { company, error: null });
});

router.post('/onboard', async (req, res) => {
  const lang = langFrom(req, res);
  if (!peopleAuth.allowedOrigin(req)) return res.redirect('/airsup/china');
  const company = await requireCompany(req, res);
  if (!company) return;
  try {
    const saved = await saveInteraction(company, req.body || {}, lang);
    if (saved.status === 'live') {
      return res.redirect('/airsup/dashboard');
    }
    if (!interactionReady(saved)) {
      return showOnboard(req, res, {
        company: saved,
        error: t(lang, 'err_publish_quality'),
      });
    }
    const published = await publishCompany(saved);
    if (published.ok || published.errorKey === 'err_publish') {
      return res.redirect('/airsup/dashboard');
    }
    return showOnboard(req, res, {
      company: published.company || saved,
      error: t(lang, published.errorKey || 'err_db'),
    });
  } catch (error) {
    console.error('Airsup china onboard error:', error);
    return showOnboard(req, res, { company, error: t(lang, 'err_db') });
  }
});

router.get('/setup', async (req, res) => {
  const company = await requireCompany(req, res);
  if (!company) return;
  return res.redirect(afterVerifyNext(company));
});

router.post('/setup', async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) return res.redirect('/airsup/china');
  return res.redirect('/airsup/china/onboard');
});

router.post('/publish', async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) return res.redirect('/airsup/china');
  return res.redirect('/airsup/china/onboard');
});

router.get('/quotes', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (token && db.isConfigured()) {
    return res.redirect(`/airsup/china/verify?token=${encodeURIComponent(token)}&next=quotes`);
  }
  const company = await requireCompany(req, res);
  if (!company) return;
  return res.redirect('/airsup/dashboard?quotes=1');
});

router.get(['/demo', '/demo/onboarding', '/api/demo'], (req, res) => {
  return res.redirect('/airsup/china');
});

router.post('/pause', async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) return res.redirect('/airsup/china');
  const company = await requireCompany(req, res);
  if (!company) return;
  try {
    if (company.status === 'live') {
      await db.updateCompany(company.company_id, { status: 'verified' });
    }
    return res.redirect('/airsup/dashboard');
  } catch (error) {
    console.error('Airsup china pause error:', error);
    return res.redirect('/airsup/dashboard');
  }
});

router.post('/logout', async (req, res) => {
  await session.clearSession(req, res);
  res.redirect('/airsup/china');
});

router.get('/api/proof', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(await proof());
});

function sendLiveRoster(res, rows) {
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.json(liveRoster(rows));
}

router.get('/live-companies.json', handleLiveCompanies);

router.get(['/live.json', '/api/live'], async (req, res) => {
  if (!db.isConfigured()) return sendLiveRoster(res, []);
  try {
    return sendLiveRoster(res, await db.listLive());
  } catch (error) {
    console.error('Airsup china live roster error:', error);
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    return res.status(503).json({
      error: 'unavailable',
      meaning: 'published_live_endpoint',
      live: null,
      factories: [],
    });
  }
});

router.get('/api/registry', async (req, res) => {
  if (!db.isConfigured()) return res.json({ suppliers: [], proof: proofPayload([]) });
  try {
    const { publicRecord } = require('./fields');
    const rows = await db.listLive();
    res.json({
      region: 'Shenzhen / Dongguan',
      suppliers: rows.map(publicRecord),
      proof: proofPayload(await db.listCompanies()),
    });
  } catch (error) {
    console.error('Airsup china registry error:', error);
    res.status(500).json({ error: 'unavailable' });
  }
});

router.get('/api/endpoint/:id', async (req, res) => {
  if (!db.isConfigured()) return res.status(404).json({ error: 'not_found' });
  try {
    const { endpointRecord } = require('./fields');
    const company = await db.getById(req.params.id);
    if (!company || company.status !== 'live') return res.status(404).json({ error: 'not_found' });
    res.json(endpointRecord(company));
  } catch (error) {
    console.error('Airsup china endpoint error:', error);
    res.status(500).json({ error: 'unavailable' });
  }
});

router.get('/api/quotations', async (req, res) => {
  const company = await requireCompanyApi(req, res);
  if (!company) return;
  return res.json(quotations.listMeta(company));
});

router.post('/api/quotations', (req, res) => {
  quoteUpload.single('file')(req, res, async (multerErr) => {
    if (multerErr) {
      const tooBig = multerErr.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        error: tooBig ? 'file_too_large' : 'upload_failed',
        detail: multerErr.message,
      });
    }
    if (!peopleAuth.allowedOrigin(req)) return res.status(403).json({ error: 'forbidden' });
    const company = await requireCompanyApi(req, res);
    if (!company) return;
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    try {
      const result = await quotations.uploadAndExtract(company, req.file);
      return res.json(result.meta);
    } catch (error) {
      const code = error && error.code;
      if (code === 'unsupported_file' || code === 'too_many_files' || code === 'file_too_large') {
        return res.status(400).json({ error: code });
      }
      console.error('Airsup china quotation upload error:', error);
      return res.status(500).json({
        error: code === 'storage_failed' ? 'storage_failed' : 'unavailable',
        detail: String((error && error.message) || '').slice(0, 200),
      });
    }
  });
});

router.delete('/api/quotations/:docId', async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) return res.status(403).json({ error: 'forbidden' });
  const company = await requireCompanyApi(req, res);
  if (!company) return;
  try {
    const result = await quotations.deleteDocument(company, req.params.docId);
    return res.json(result.meta);
  } catch (error) {
    if (error && error.code === 'not_found') return res.status(404).json({ error: 'not_found' });
    console.error('Airsup china quotation delete error:', error);
    return res.status(500).json({ error: 'unavailable' });
  }
});

router.post('/api/quotations/approve', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) return res.status(403).json({ error: 'forbidden' });
  const company = await requireCompanyApi(req, res);
  if (!company) return;
  try {
    const enabled = Boolean(req.body && (req.body.endpoint_use === true || req.body.endpoint_use === 'true' || req.body.endpoint_use === 1));
    const result = await quotations.setEndpointUse(company, enabled);
    return res.json(result.meta);
  } catch (error) {
    console.error('Airsup china quotation approve error:', error);
    return res.status(500).json({ error: 'unavailable' });
  }
});

router.post('/api/ops/send-quotes-invite', express.json(), async (req, res) => {
  const key = String(req.get('x-airsup-ops') || (req.body && req.body.key) || '').trim();
  const expected = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!expected || key !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!db.isConfigured()) return res.status(503).json({ error: 'unavailable' });
  const domains = [].concat((req.body && req.body.domains) || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!domains.length) return res.status(400).json({ error: 'domains_required' });
  const sent = [];
  const failed = [];
  for (const domain of domains) {
    try {
      sent.push(await sendForDomain(domain));
    } catch (error) {
      console.error('Airsup china quotes invite failed:', domain, error.message);
      failed.push({ domain, error: error.message || 'send_failed' });
    }
  }
  return res.json({ sent, failed });
});

// AIRSUP-CHINA-TEST-BEGIN — legacy path; board now lives at /airsup/dashboard
router.use('/test', (req, res) => {
  const suffix = req.url === '/' ? '' : req.url;
  const target = `/airsup/dashboard${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  return res.redirect(302, target);
});
// AIRSUP-CHINA-TEST-END

module.exports = router;
