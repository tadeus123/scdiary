/**
 * Airsup China company onboarding. Mounted at /airsup/china.
 * Isolated from people Airsup. Delete this folder to remove the company flow.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const db = require('./db');
const session = require('./session');
const { t, otherLang } = require('./i18n');
const { emailAllowedForSite, normalizeDomain, emailParts } = require('./domain');
const { genericDemo } = require('./demo');
const { buildPreview, companyDraftFromPreview } = require('./site-preview');
const {
  NICHES,
  CITIES,
  PROCESSES,
  MATERIALS,
  FINISHES,
  CERTS,
  ACTIONS,
  DEFAULT_ACTIONS,
  FLEX,
  CONTACT_SLOTS,
  normalizeProfile,
  normalizeActions,
  normalizeNiche,
  canPublish,
  buyerTestPrompt,
  endpointRecord,
  listingText,
  companyTitle,
  fillEmptyCompany,
  enrichmentGaps,
  gapWhy,
  operatorListingSummary,
  formatLiveAt,
} = require('./fields');
const { confirmChecklist } = require('./enrich');
const { proofPayload, industryPeers, formatChartDay, liveRoster } = require('./proof');
const { sendVerifyEmail } = require('./mail');
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
    ogImage: '/og-image.png',
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
    return res.redirect('/airsup/china/setup');
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
  const counts = await proof();
  const peers = industryPeers(counts.recent, { niche: built.niche, domain: built.domain });
  return render(req, res, 'preview.ejs', {
    proof: counts,
    form: { ...nextForm, website: nextForm.website || built.website, city: nextForm.city || built.cityId || 'shenzhen' },
    error: error || null,
    cities: CITIES,
    source: source || 'web',
    preview: built,
    peers,
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
  return renderPreview(req, res, { website, source });
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
    if (company && tooSoon(company)) return fail('err_rate');
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

function claimCapabilities(company) {
  const profile = normalizeProfile(company && company.profile);
  const parts = [];
  if (profile.processes.length) {
    parts.push(profile.processes.join(', '));
  }
  if (company && company.context) parts.push(String(company.context).slice(0, 160));
  return parts.filter(Boolean).join(' · ');
}

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
      capabilities: claimCapabilities(company),
      listingPreview: listingText(company),
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
      // Mark that claim confirm happened so /verify may auto-publish once.
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
    const row = await db.takeToken(session.sha256(token));
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
    if (fresh && fresh.status === 'pending') {
      fresh = await applySiteDraft(fresh, company.website || company.domain, lang) || fresh;
    } else if (fresh && fresh.status === 'verified') {
      fresh = await applySiteDraft(fresh, company.website || company.domain, lang) || fresh;
    }
    const profile = normalizeProfile(fresh && fresh.profile);
    const claimReady = Boolean(profile.claim_ready);
    const outreachSource = ['outreach', 'manual'].includes(String((fresh && fresh.source) || ''));
    // Auto-publish only after claim confirm + verify (not on login, not for paused re-login).
    if (
      fresh
      && row.purpose === 'verify'
      && claimReady
      && outreachSource
      && canPublish(fresh)
      && fresh.status === 'verified'
      && !fresh.live_at
    ) {
      fresh = await db.updateCompany(fresh.company_id, {
        status: 'live',
        live_at: new Date().toISOString(),
        verified_at: fresh.verified_at || new Date().toISOString(),
        profile: { ...profile, claim_ready: false },
      });
      try {
        await db.touchDomainAllow(fresh.domain, fresh.contact_email, {
          published_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Airsup china allow publish touch skipped:', error.message);
      }
      return res.redirect('/airsup/china/setup?ok=live');
    }
    return res.redirect('/airsup/china/setup');
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

function readSetup(body, company) {
  const prev = normalizeProfile(company && company.profile);
  const contacts = [0, 1, 2, 3].map((index) => ({
    role: index === 0 ? 'ceo' : 'sales',
    name: body[`contact_name_${index}`],
    wechat: body[`contact_wechat_${index}`],
  }));
  const profile = normalizeProfile({
    year_founded: body.year_founded,
    employees: body.employees,
    address: body.address,
    export_markets: body.export_markets,
    other_city: body.other_city,
    processes: [].concat(body.processes || []),
    materials: [].concat(body.materials || []),
    finishing: [].concat(body.finishing || []),
    certifications: [].concat(body.certifications || []),
    machines: body.machines,
    tolerance: body.tolerance,
    max_workpiece: body.max_workpiece,
    moq: body.moq,
    lead_time: body.lead_time,
    shipping: body.shipping,
    sample_lead: body.sample_lead,
    holidays: body.holidays,
    flexibility: body.flexibility,
    contacts,
    site_notes: prev.site_notes,
  });
  return {
    company_name: String(body.company_name || '').trim(),
    company_name_en: String(body.company_name_en || '').trim(),
    city: String(body.city || '').trim(),
    niche: normalizeNiche(body.niche),
    contact_name: String(body.contact_name || '').trim(),
    context: String(body.context || '').trim(),
    goal: String(body.goal || '').trim(),
    actions: normalizeActions([].concat(body.actions || DEFAULT_ACTIONS)),
    profile,
  };
}

async function showLive(req, res, company) {
  const lang = langFrom(req, res);
  const record = endpointRecord(company);
  return render(req, res, 'live.ejs', {
    proof: await proof(),
    company,
    companyTitle: companyTitle(company, lang),
    operatorSummary: operatorListingSummary(company, lang),
    liveAtLabel: formatLiveAt(company.live_at, lang),
    listingPreview: listingText(company),
    buyerPrompt: buyerTestPrompt(company),
    endpointPreview: record,
    enrichmentGaps: enrichmentGaps(company),
    gapWhy: (gap) => gapWhy(gap, lang),
    headerLive: true,
  });
}

async function showSetup(req, res, { company, error, saved, paused }) {
  const lang = langFrom(req, res);
  const checklist = confirmChecklist(company);
  const profile = normalizeProfile(company.profile);
  const siteOpen = !canPublish(company)
    || (!profile.processes.length && !profile.materials.length && !String(company.context || '').trim());
  return render(req, res, 'setup.ejs', {
    proof: await proof(),
    company,
    profile,
    actions: normalizeActions(company.actions),
    catalogs: { NICHES, CITIES, PROCESSES, MATERIALS, FINISHES, CERTS, ACTIONS, FLEX, CONTACT_SLOTS },
    error: error || null,
    saved: Boolean(saved),
    paused: Boolean(paused),
    enrichmentGaps: enrichmentGaps(company),
    confirmChecklist: checklist,
    gapWhy: (gap) => gapWhy(gap, lang),
    siteOpen,
    headerLive: company.status === 'live',
  });
}

router.get('/setup', async (req, res) => {
  const company = await requireCompany(req, res);
  if (!company) return;
  const wantEdit = req.query.edit === '1' || req.query.error === 'publish' || req.query.saved === '1' || req.query.paused === '1';
  if (company.status === 'live' && !wantEdit) {
    return showLive(req, res, company);
  }
  if (req.query.ok === 'live' && company.status === 'live') {
    return showLive(req, res, company);
  }
  return showSetup(req, res, {
    company,
    error: req.query.error === 'publish' ? t(langFrom(req, res), 'err_publish') : null,
    saved: req.query.saved === '1',
    paused: req.query.paused === '1',
  });
});

router.post('/setup', async (req, res) => {
  const lang = langFrom(req, res);
  if (!peopleAuth.allowedOrigin(req)) return res.redirect('/airsup/china');
  const company = await requireCompany(req, res);
  if (!company) return;
  const patch = readSetup(req.body || {}, company);
  const next = { ...company, ...patch };
  try {
    await db.updateCompany(company.company_id, patch);
    if (company.status === 'live') {
      return res.redirect('/airsup/china/setup?edit=1&saved=1');
    }
    return res.redirect('/airsup/china/setup?saved=1');
  } catch (error) {
    console.error('Airsup china setup error:', error);
    return showSetup(req, res, { company: next, error: t(lang, 'err_db') });
  }
});

router.post('/publish', async (req, res) => {
  const lang = langFrom(req, res);
  if (!peopleAuth.allowedOrigin(req)) return res.redirect('/airsup/china');
  const company = await requireCompany(req, res);
  if (!company) return;
  const patch = readSetup(req.body || {}, company);
  const next = { ...company, ...patch };
  try {
    if (!canPublish(next)) {
      await db.updateCompany(company.company_id, patch);
      return res.redirect('/airsup/china/setup?error=publish');
    }
    await db.updateCompany(company.company_id, {
      ...patch,
      status: 'live',
      live_at: company.live_at || new Date().toISOString(),
      verified_at: company.verified_at || new Date().toISOString(),
    });
    try {
      await db.touchDomainAllow(company.domain, next.contact_email || company.contact_email, {
        published_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Airsup china allow publish touch skipped:', error.message);
    }
    return res.redirect('/airsup/china/setup?ok=live');
  } catch (error) {
    console.error('Airsup china publish error:', error);
    return showSetup(req, res, {
      company: next,
      error: canPublish(next) ? t(lang, 'err_db') : t(lang, 'err_publish'),
    });
  }
});

router.post('/pause', async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) return res.redirect('/airsup/china');
  const company = await requireCompany(req, res);
  if (!company) return;
  try {
    if (company.status === 'live') {
      await db.updateCompany(company.company_id, { status: 'verified' });
    }
    return res.redirect('/airsup/china/setup?paused=1');
  } catch (error) {
    console.error('Airsup china pause error:', error);
    return res.redirect('/airsup/china/setup');
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

module.exports = router;
