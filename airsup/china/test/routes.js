/**
 * /airsup/china/test — company endpoint web concept (chat feeds the web).
 * Mounted only from china/routes.js. Delete this folder to remove.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const multer = require('multer');
const session = require('../session');
const { t, otherLang } = require('../i18n');
const { companyTitle, CITIES } = require('../fields');
const { ensureDemoCompany, onboardingResetPatch } = require('../demo-company');
const db = require('../db');
const peopleAuth = require('../../auth');
const { welcomeMessage, completeTestTurn, emptyWeb } = require('./chat');
const { describeUploads } = require('./files');
const { layoutPositions, normalizeClientWeb, addCustomLink, seedFromCompany } = require('./web');
const authCodes = require('./auth-codes');
const { sendVerifyEmail } = require('../mail');
const onboard = require('./onboard');
const memoryStore = require('./memory-store');

const {
  previewWebsite,
  startSignup,
  consumeVerifyToken,
  saveInteraction,
  publishCompany,
  onboardingState,
  seedWebFromCompany,
  seedWebFromPreview,
  readTestCompany,
  openSession,
  clearTestSession,
  usingMemory,
  DEMO_DOMAIN,
  DEMO_EMAIL,
  ensureDemoAllowlist,
} = onboard;

const router = express.Router();
const VIEWS = path.join(__dirname, 'views');
const SITE_VIEWS = path.join(__dirname, '../../../views');
const TEST_CSS_PATH = path.join(__dirname, 'public/test-chat.css');
const CHINA_CSS_PATH = path.join(__dirname, '../public/china.css');

let testCssCache = null;
let chinaCssCache = null;

function readCss(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error('Airsup china test css missing:', error.message);
    return '';
  }
}

function readTestCss() {
  // Concept page: always fresh so UI iterations show up without restart
  return readCss(TEST_CSS_PATH);
}

function readChinaCss() {
  if (chinaCssCache !== null) return chinaCssCache;
  chinaCssCache = readCss(CHINA_CSS_PATH);
  return chinaCssCache;
}

router.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  redirect: false,
  maxAge: '1h',
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 5 },
});

function langFrom(req, res) {
  const lang = session.readLang(req);
  const asked = String((req.query && req.query.lang) || '').toLowerCase();
  if (asked === 'en' || asked === 'zh') return session.setLang(req, res, asked);
  return lang;
}

function companySummary(company, lang) {
  if (!company) return null;
  return {
    domain: company.domain || '',
    status: company.status || '',
    name: companyTitle(company, lang),
    email: company.contact_email || '',
    city: company.city || '',
    contact: company.contact_name || '',
  };
}

function jsonError(res, lang, status, errorKey) {
  const key = errorKey || 'err_db';
  const TEST_COPY = {
    err_publish_quality: lang === 'en'
      ? 'Add WeChat and a sample lead you stand behind before publishing.'
      : '上线前请填写微信号和你能承诺的样品交期。',
    err_rate: lang === 'en'
      ? 'Please wait about 2 minutes before requesting another email.'
      : '请约 2 分钟后再请求邮件。',
  };
  const message = TEST_COPY[key] || t(lang, key);
  return res.status(status).json({
    ok: false,
    error: message,
    errorKey: key,
  });
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
    here: '/airsup/china/test',
    landing: false,
    quietChrome: true,
    chinaCss: readChinaCss(),
    testCss: readTestCss(),
    ...extra,
  };
  ejs.renderFile(
    viewFile,
    locals,
    {
      filename: viewFile,
      views: [VIEWS, path.join(__dirname, '../views'), SITE_VIEWS],
      root: SITE_VIEWS,
    },
    (err, html) => {
      if (err) {
        console.error('Airsup china test render error:', err);
        return res.status(500).send('Failed to render test concept');
      }
      res.send(html);
    }
  );
}

function parseHistory(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-40).map((row) => ({
      role: row && row.role === 'assistant' ? 'assistant' : 'user',
      content: String((row && row.content) || '').slice(0, 6000),
    })).filter((row) => row.content);
  } catch {
    return [];
  }
}

function parseWeb(raw, lang) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeClientWeb(parsed, lang);
  } catch {
    return emptyWeb(lang);
  }
}

async function ensureTestDemoAllowlist() {
  if (usingMemory()) {
    return memoryStore.upsertDomainAllow({
      domain: DEMO_DOMAIN,
      contact_email: DEMO_EMAIL,
      source: 'manual',
      note: 'Airsup demo onboarding mailbox (memory)',
    });
  }
  return ensureDemoAllowlist();
}

async function resetDemoPending(lang, req, res) {
  await ensureTestDemoAllowlist();
  const patch = {
    ...onboardingResetPatch(),
    locale: lang === 'en' ? 'en' : 'zh',
  };
  let company = null;
  if (usingMemory()) {
    const existing = await memoryStore.getByDomain(DEMO_DOMAIN);
    if (existing) {
      if (typeof memoryStore.deleteSessionsForCompany === 'function') {
        await memoryStore.deleteSessionsForCompany(existing.company_id).catch(() => null);
      }
      company = await memoryStore.updateCompany(existing.company_id, patch);
    } else {
      company = await memoryStore.insertCompany({
        domain: DEMO_DOMAIN,
        ...patch,
      });
    }
  } else {
    try {
      company = await ensureDemoCompany({ forceLive: true });
      if (company && typeof db.deleteSessionsForCompany === 'function') {
        await db.deleteSessionsForCompany(company.company_id).catch(() => null);
      }
      company = await db.updateCompany(company.company_id, patch);
    } catch (error) {
      console.error('Airsup china test demo reset skipped:', error.message);
      company = null;
    }
  }
  // Drop this browser's cookie so SSR/API do not keep a stale logged-in company.
  if (req && res) {
    try {
      await clearTestSession(req, res);
    } catch {
      /* ignore */
    }
  }
  return company;
}

router.get(['/', ''], async (req, res) => {
  const lang = langFrom(req, res);
  res.set('Cache-Control', 'private, no-store');
  res.locals.seo = {
    title: lang === 'en' ? 'Airsup test — company endpoint web' : 'Airsup 测试 — 公司端点网',
    description: lang === 'en'
      ? 'Isolated concept: grow your ChatGPT endpoint web by dumping real factory material. Live product unchanged.'
      : '独立概念：往端点网里丢真材料，看着它变亮。不影响正式产品。',
    path: '/airsup/china/test',
    noindex: true,
    includePersonSchema: false,
    ogLocale: lang === 'en' ? 'en_US' : 'zh_CN',
    ogImage: '/og-image.png',
  };

  let company = null;
  try {
    company = await readTestCompany(req);
  } catch {
    company = null;
  }

  const onboardState = onboardingState(company, lang);
  let initial = emptyWeb(lang);
  if (company) {
    try {
      initial = seedWebFromCompany(company, lang).web || initial;
    } catch {
      initial = seedFromCompany(emptyWeb(lang), company, lang).web;
    }
  }

  const demoMode = String(req.query.demo || '') === '1';
  const autoDemo = String(req.query.auto || '') === '1';

  return render(req, res, 'chat.ejs', {
    lang,
    company,
    companyLabel: company ? companyTitle(company, lang) : '',
    welcome: welcomeMessage(lang),
    loggedIn: Boolean(company),
    usingMemory: usingMemory(),
    onboard: onboardState,
    cities: CITIES,
    initialWeb: initial,
    layoutPositions: layoutPositions(),
    demoMode,
    autoDemo,
  });
});

router.post('/api/onboard/preview', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return jsonError(res, langFrom(req, res), 403, 'err_origin');
  }
  const lang = langFrom(req, res);
  const website = String((req.body && req.body.website) || '').trim();
  if (!website) {
    return jsonError(res, lang, 400, 'err_website');
  }
  try {
    const preview = await previewWebsite(website, lang);
    if (!preview || !preview.ok) {
      return res.status(400).json({
        ok: false,
        preview: null,
        web: null,
        error: t(lang, (preview && preview.error) || 'err_website'),
        errorKey: (preview && preview.error) || 'err_website',
      });
    }
    let web = null;
    try {
      web = seedWebFromPreview(preview, lang).web;
    } catch {
      web = null;
    }
    return res.json({ ok: true, preview, web, error: null });
  } catch (error) {
    console.error('Airsup china test onboard preview error:', error);
    return jsonError(res, lang, 500, 'err_db');
  }
});

router.post('/api/onboard/start', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return jsonError(res, langFrom(req, res), 403, 'err_origin');
  }
  const lang = langFrom(req, res);
  const website = String((req.body && req.body.website) || '').trim();
  const email = String((req.body && req.body.email) || '').trim();
  const contact = String((req.body && req.body.contact) || '').trim();
  const city = String((req.body && req.body.city) || 'shenzhen');
  try {
    const result = await startSignup({
      website,
      email,
      contact,
      city,
      lang,
      source: 'test_web',
      publicOrigin: peopleAuth.getPublicOrigin(req),
    });
    if (!result.ok) {
      return jsonError(res, lang, 400, result.errorKey || 'err_db');
    }
    const state = onboardingState(result.company, lang);
    let web = null;
    try {
      web = seedWebFromCompany(result.company, lang).web;
    } catch {
      web = null;
    }
    return res.json({
      ok: true,
      company: companySummary(result.company, lang),
      state,
      verifyPath: result.verifyPath,
      demo: Boolean(result.demo),
      token: result.demo ? result.token : undefined,
      web,
      error: null,
    });
  } catch (error) {
    console.error('Airsup china test onboard start error:', error);
    return jsonError(res, lang, 500, 'err_db');
  }
});

router.get('/verify', async (req, res) => {
  const lang = langFrom(req, res);
  const token = String(req.query.token || '').trim();
  const auto = String(req.query.auto || '') === '1';
  if (!token) {
    return res.redirect('/airsup/china/test?err=token');
  }
  try {
    const result = await consumeVerifyToken(token);
    if (!result.ok || !result.company) {
      return res.redirect(`/airsup/china/test?err=${encodeURIComponent(result.errorKey || 'err_token')}`);
    }
    await openSession(req, res, result.company.company_id);
    return res.redirect('/airsup/china/test?ok=verified' + (auto ? '&auto=1' : ''));
  } catch (error) {
    console.error('Airsup china test verify error:', error);
    return res.redirect(`/airsup/china/test?err=${encodeURIComponent('err_db')}`);
  }
});

router.post('/api/onboard/fields', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return jsonError(res, langFrom(req, res), 403, 'err_origin');
  }
  const lang = langFrom(req, res);
  try {
    const company = await readTestCompany(req);
    if (!company) {
      return jsonError(res, lang, 401, 'err_token');
    }
    const body = (req.body && typeof req.body === 'object') ? { ...req.body } : {};
    if (body.wechat !== undefined && body.contact_wechat === undefined) {
      body.contact_wechat = body.wechat;
    }
    const next = await saveInteraction(company, body, lang);
    const state = onboardingState(next, lang);
    let web = null;
    try {
      web = seedWebFromCompany(next, lang).web;
    } catch {
      web = null;
    }
    return res.json({
      ok: true,
      company: companySummary(next, lang),
      state,
      web,
      error: null,
    });
  } catch (error) {
    console.error('Airsup china test onboard fields error:', error);
    return jsonError(res, lang, 500, 'err_db');
  }
});

router.post('/api/onboard/publish', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return jsonError(res, langFrom(req, res), 403, 'err_origin');
  }
  const lang = langFrom(req, res);
  try {
    const company = await readTestCompany(req);
    if (!company) {
      return jsonError(res, lang, 401, 'err_token');
    }
    const result = await publishCompany(company);
    if (!result.ok) {
      return jsonError(res, lang, 400, result.errorKey || 'err_publish');
    }
    const state = onboardingState(result.company, lang);
    let web = null;
    try {
      web = seedWebFromCompany(result.company, lang).web;
    } catch {
      web = null;
    }
    return res.json({
      ok: true,
      company: companySummary(result.company, lang),
      state,
      web,
      error: null,
    });
  } catch (error) {
    console.error('Airsup china test onboard publish error:', error);
    return jsonError(res, lang, 500, 'err_db');
  }
});

router.get('/api/onboard/state', async (req, res) => {
  const lang = langFrom(req, res);
  try {
    const company = await readTestCompany(req);
    const state = onboardingState(company, lang);
    let web = null;
    if (company) {
      try {
        web = seedWebFromCompany(company, lang).web;
      } catch {
        web = null;
      }
    }
    return res.json({
      ok: true,
      company: companySummary(company, lang),
      state,
      web,
      loggedIn: Boolean(company),
      usingMemory: usingMemory(),
    });
  } catch (error) {
    console.error('Airsup china test onboard state error:', error);
    return jsonError(res, lang, 500, 'err_db');
  }
});

router.post('/api/onboard/demo', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return jsonError(res, langFrom(req, res), 403, 'err_origin');
  }
  const lang = langFrom(req, res);
  try {
    await resetDemoPending(lang, req, res);
    // Do not openSession until verify — demo UX returns verifyPath for one-click verify.
    const result = await startSignup({
      website: `https://${DEMO_DOMAIN}`,
      email: DEMO_EMAIL,
      contact: 'Tade',
      city: 'shenzhen',
      lang,
      source: 'demo',
      publicOrigin: peopleAuth.getPublicOrigin(req),
    });
    if (!result.ok) {
      return jsonError(res, lang, 400, result.errorKey || 'err_db');
    }
    const state = onboardingState(result.company, lang);
    let web = null;
    let preview = null;
    try {
      web = seedWebFromCompany(result.company, lang).web;
    } catch {
      web = null;
    }
    try {
      preview = await previewWebsite(`https://${DEMO_DOMAIN}`, lang);
      if (preview && !preview.ok) preview = null;
    } catch {
      preview = null;
    }
    return res.json({
      ok: true,
      company: companySummary(result.company, lang),
      state,
      verifyPath: result.verifyPath,
      demo: true,
      token: result.token,
      web,
      preview,
      error: null,
    });
  } catch (error) {
    console.error('Airsup china test onboard demo error:', error);
    return jsonError(res, lang, 500, 'err_db');
  }
});

router.get('/api/state', async (req, res) => {
  const lang = langFrom(req, res);
  let company = null;
  try {
    company = await readTestCompany(req);
  } catch {
    company = null;
  }
  let web = emptyWeb(lang);
  if (company) {
    try {
      web = seedWebFromCompany(company, lang).web || web;
    } catch {
      try {
        web = seedFromCompany(emptyWeb(lang), company, lang).web;
      } catch {
        web = emptyWeb(lang);
      }
    }
  }
  return res.json({
    concept: true,
    lang,
    loggedIn: Boolean(company),
    usingMemory: usingMemory(),
    company: companySummary(company, lang),
    onboard: onboardingState(company, lang),
    welcome: welcomeMessage(lang),
    web,
    layout: layoutPositions(),
    note: 'Company web is the main surface; chat feeds it. Client persists web + transcript.',
  });
});

router.post('/api/chat', (req, res) => {
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? 'file_too_large' : 'upload_failed',
      });
    }
    if (!peopleAuth.allowedOrigin(req)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const lang = langFrom(req, res);
    const message = String((req.body && req.body.message) || '').trim();
    const history = parseHistory(req.body && req.body.history);
    const web = parseWeb(req.body && req.body.web, lang);
    const files = describeUploads(req.files || []);

    if (!message && !files.length) {
      return res.status(400).json({ error: 'empty' });
    }

    let company = null;
    try {
      company = await readTestCompany(req);
    } catch {
      company = null;
    }

    try {
      const result = await completeTestTurn({
        lang,
        message,
        history,
        files,
        company,
        web,
      });
      return res.json({
        reply: result.reply,
        files,
        used_model: result.used_model,
        compressed: Boolean(result.summary),
        web: result.web,
        signals: result.signals,
      });
    } catch (error) {
      console.error('Airsup china test chat error:', error);
      return res.status(500).json({ error: 'chat_failed' });
    }
  });
});

router.post('/api/login-demo', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    await ensureTestDemoAllowlist();
    let company;
    if (usingMemory()) {
      const existing = await memoryStore.getByDomain(DEMO_DOMAIN);
      if (existing && existing.status === 'live') {
        company = existing;
      } else {
        await resetDemoPending(langFrom(req, res), req, res);
        const started = await startSignup({
          website: `https://${DEMO_DOMAIN}`,
          email: DEMO_EMAIL,
          contact: 'Tade',
          city: 'shenzhen',
          lang: langFrom(req, res),
          source: 'demo',
          publicOrigin: peopleAuth.getPublicOrigin(req),
        });
        if (!started.ok) {
          return res.status(500).json({ error: 'login_failed' });
        }
        const verified = await consumeVerifyToken(started.token);
        if (!verified.ok || !verified.company) {
          return res.status(500).json({ error: 'login_failed' });
        }
        const withFields = await saveInteraction(verified.company, {
          contact_wechat: 'airsup_demo_tade',
          sample_lead: 'samples in 3 days',
          flexibility: 'normal',
          contact_name: 'Tade',
        }, langFrom(req, res));
        const published = await publishCompany(withFields);
        if (!published.ok) {
          return res.status(500).json({ error: 'login_failed' });
        }
        company = published.company;
      }
    } else {
      if (!db.isConfigured()) {
        return res.status(503).json({ error: 'storage_unavailable' });
      }
      company = await ensureDemoCompany({ forceLive: true });
    }
    await openSession(req, res, company.company_id);
    const lang = langFrom(req, res);
    const seeded = seedWebFromCompany(company, lang);
    return res.json({
      ok: true,
      company: {
        domain: company.domain,
        name: companyTitle(company, lang),
        status: company.status,
      },
      web: seeded.web,
      seeded: seeded.added,
    });
  } catch (error) {
    console.error('Airsup china test demo login error:', error);
    return res.status(500).json({ error: 'login_failed' });
  }
});

router.post('/api/login/request', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const lang = langFrom(req, res);
  const email = authCodes.normalizeEmail(req.body && req.body.email);
  if (!authCodes.looksLikeEmail(email)) {
    return res.status(400).json({ error: 'bad_email' });
  }
  const code = authCodes.issueCode(email);
  let mailed = false;
  try {
    await sendVerifyEmail({
      lang,
      to: email,
      link: `${req.protocol}://${req.get('host')}/airsup/china/test#code=${code}`,
      contactName: '',
    });
    mailed = true;
  } catch (error) {
    console.error('Airsup china test login code mail skipped:', error.message);
  }
  // Concept surface: always return code so the flow is tryable without mail.
  return res.json({ ok: true, mailed, devCode: code });
});

router.post('/api/login/verify', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const lang = langFrom(req, res);
  const email = authCodes.normalizeEmail(req.body && req.body.email);
  const code = String((req.body && req.body.code) || '').trim();
  if (!authCodes.looksLikeEmail(email) || !authCodes.verifyCode(email, code)) {
    return res.status(401).json({ error: 'bad_code' });
  }
  try {
    await ensureTestDemoAllowlist();
    const domain = email.split('@')[1] || '';
    let company = null;
    const storeApi = usingMemory() ? memoryStore : db;
    if (!usingMemory() && !db.isConfigured()) {
      return res.status(503).json({ error: 'storage_unavailable' });
    }
    try {
      company = domain ? await storeApi.getByDomain(domain) : null;
    } catch {
      company = null;
    }
    if (!company) {
      if (usingMemory()) {
        // Fall back to a published demo company in memory so login is tryable offline.
        const demoLogin = await (async () => {
          const existing = await memoryStore.getByDomain(DEMO_DOMAIN);
          if (existing && existing.status === 'live') return existing;
          await resetDemoPending(lang, req, res);
          const started = await startSignup({
            website: `https://${DEMO_DOMAIN}`,
            email: DEMO_EMAIL,
            contact: 'Tade',
            city: 'shenzhen',
            lang,
            source: 'demo',
            publicOrigin: peopleAuth.getPublicOrigin(req),
          });
          if (!started.ok) return null;
          const verified = await consumeVerifyToken(started.token);
          if (!verified.ok) return null;
          const withFields = await saveInteraction(verified.company, {
            contact_wechat: 'airsup_demo_tade',
            sample_lead: 'samples in 3 days',
            flexibility: 'normal',
            contact_name: 'Tade',
          }, lang);
          const published = await publishCompany(withFields);
          return published.ok ? published.company : null;
        })();
        company = demoLogin;
      } else {
        company = await ensureDemoCompany({ forceLive: true });
      }
    }
    if (!company) {
      return res.status(500).json({ error: 'login_failed' });
    }
    await openSession(req, res, company.company_id);
    const seeded = seedWebFromCompany(company, lang);
    return res.json({
      ok: true,
      company: {
        domain: company.domain,
        name: companyTitle(company, lang),
        status: company.status,
        email,
      },
      web: seeded.web,
      seeded: seeded.added,
    });
  } catch (error) {
    console.error('Airsup china test login verify error:', error);
    return res.status(500).json({ error: 'login_failed' });
  }
});

router.post('/api/logout', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    await clearTestSession(req, res);
  } catch (error) {
    console.error('Airsup china test logout error:', error);
  }
  return res.json({ ok: true });
});

router.post('/api/link', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const lang = langFrom(req, res);
  const from = String((req.body && req.body.from) || '').trim();
  const to = String((req.body && req.body.to) || '').trim();
  const web = parseWeb(req.body && req.body.web, lang);
  const result = addCustomLink(web, from, to);
  if (!result.ok) {
    return res.status(400).json({ error: result.reason || 'link_failed', web: result.web });
  }
  return res.json({ ok: true, web: result.web });
});

module.exports = router;
