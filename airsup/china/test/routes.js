/**
 * /airsup/dashboard — supplier board (was /airsup/china/test).
 * Mounted from airsup/routes.js; /airsup/china/test redirects here.
 * Delete airsup/china/test/ to remove.
 */
const DASHBOARD_BASE = '/airsup/dashboard';
const fs = require('fs');
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const multer = require('multer');
const session = require('../session');
const { t, otherLang } = require('../i18n');
const { companyTitle, CITIES, interactionReady } = require('../fields');
const db = require('../db');
const peopleAuth = require('../../auth');
const { welcomeMessage, completeTestTurn, emptyWeb } = require('./chat');
const { describeUploads } = require('./files');
const { layoutPositions, normalizeClientWeb, addCustomLink, seedFromCompany, applyDump } = require('./web');
const authCodes = require('./auth-codes');
const { sendLoginCodeEmail } = require('../mail');
const onboard = require('./onboard');
const memoryStore = require('./memory-store');
const { computeBoard, applyContextUpload } = require('./board');
const quotations = require('../quotations');

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
  limits: { fileSize: 4 * 1024 * 1024, files: 8 },
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
    unknown_company: lang === 'en'
      ? 'No factory is registered for that email. Fill the website form on the homepage first.'
      : '该邮箱没有对应工厂。请先在首页填写官网加入。',
    bad_code: lang === 'en' ? 'Invalid or expired code.' : '验证码无效或已过期。',
    bad_email: lang === 'en' ? 'Enter a valid work email.' : '请输入有效的工作邮箱。',
    mail_failed: lang === 'en' ? 'Could not send the login code. Try again.' : '验证码发送失败，请重试。',
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
    here: DASHBOARD_BASE,
    dashboardBase: DASHBOARD_BASE,
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
        console.error('Airsup dashboard render error:', err);
        return res.status(500).send('Failed to render dashboard');
      }
      res.send(html);
    }
  );
}

/** Match existing company by contact email, else by email domain. No demo fallback. */
async function findCompanyForLogin(email) {
  const storeApi = usingMemory() ? memoryStore : db;
  if (!usingMemory() && !db.isConfigured()) return { error: 'storage_unavailable' };
  try {
    if (typeof storeApi.getByContactEmail === 'function') {
      const byEmail = await storeApi.getByContactEmail(email);
      if (byEmail) return { company: byEmail };
    }
  } catch {
    /* fall through */
  }
  const domain = String(email.split('@')[1] || '').trim().toLowerCase();
  if (!domain) return { company: null };
  try {
    const byDomain = await storeApi.getByDomain(domain);
    return { company: byDomain || null };
  } catch {
    return { company: null };
  }
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

router.get(['/', ''], async (req, res) => {
  const lang = langFrom(req, res);
  res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');

  res.locals.seo = {
    title: lang === 'en' ? 'Airsup test — supplier board' : 'Airsup 测试 — 供应商看板',
    description: lang === 'en'
      ? 'Isolated supplier board: conversation rate, interactions, customers, revenue. Live product unchanged.'
      : '独立供应商看板：转化率、互动、客户、收入。不影响正式产品。',
    path: '/airsup/dashboard',
    noindex: true,
    includePersonSchema: false,
    ogLocale: lang === 'en' ? 'en_US' : 'zh_CN',
    ogImage: '/airsup-og.png',
  };

  let company = null;
  try {
    company = await readTestCompany(req);
  } catch {
    company = null;
  }

  if (!company) {
    return res.redirect('/airsup/china');
  }
  if (company.status !== 'live' && !interactionReady(company)) {
    return res.redirect('/airsup/china/onboard');
  }

  const onboardState = company.status === 'live'
    ? { ...onboardingState(company, lang), step: 'live' }
    : onboardingState(company, lang);
  let initial = emptyWeb(lang);
  try {
    initial = seedWebFromCompany(company, lang).web || initial;
  } catch {
    initial = seedFromCompany(emptyWeb(lang), company, lang).web;
  }

  const board = computeBoard(company, initial);

  return render(req, res, 'chat.ejs', {
    lang,
    company,
    companyLabel: companyTitle(company, lang),
    welcome: welcomeMessage(lang),
    loggedIn: true,
    usingMemory: usingMemory(),
    onboard: onboardState,
    cities: CITIES,
    initialWeb: initial,
    layoutPositions: layoutPositions(),
    demoMode: false,
    autoDemo: false,
    board,
    boardFirst: true,
    quotationMeta: quotations.listMeta(company),
    headerLive: company.status === 'live',
    quotesFocus: String(req.query.quotes || '') === '1',
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
      web,
      error: null,
    });
  } catch (error) {
    console.error('Airsup china test onboard start error:', error);
    return jsonError(res, lang, 500, 'err_db');
  }
});

router.get('/verify', (req, res) => {
  const token = String(req.query.token || '').trim();
  const qs = new URLSearchParams();
  if (token) qs.set('token', token);
  const next = String(req.query.next || '').trim();
  if (next) qs.set('next', next);
  const suffix = qs.toString();
  return res.redirect(`/airsup/china/verify${suffix ? `?${suffix}` : ''}`);
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
      board: computeBoard(result.company, web),
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

router.post('/api/onboard/demo', (req, res) => {
  return res.status(410).json({ error: 'gone' });
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
      // Persist uploaded file metadata for the dashboard list (does not change conversation rate).
      if (company && company.status === 'live' && files.length) {
        try {
          const profile = applyContextUpload(company, files);
          const storeApi = usingMemory() ? memoryStore : db;
          company = await storeApi.updateCompany(company.company_id, { profile });
        } catch (error) {
          console.error('Airsup china test board context bump skipped:', error.message);
        }
      }

      const result = await completeTestTurn({
        lang,
        message,
        history,
        files,
        company,
        web,
      });
      const board = company ? computeBoard(company, result.web) : null;
      return res.json({
        reply: result.reply,
        files,
        used_model: result.used_model,
        compressed: Boolean(result.summary),
        web: result.web,
        signals: result.signals,
        board,
      });
    } catch (error) {
      console.error('Airsup china test chat error:', error);
      return res.status(500).json({ error: 'chat_failed' });
    }
  });
});

router.get('/api/board', async (req, res) => {
  const lang = langFrom(req, res);
  try {
    const company = await readTestCompany(req);
    if (!company) {
      // Board-first shell: zeros until login (do not force onboarding).
      return res.json({
        ok: true,
        board: computeBoard(null, emptyWeb(lang)),
        company: null,
        state: onboardingState(null, lang),
        loggedIn: false,
      });
    }
    let web = emptyWeb(lang);
    try {
      web = seedWebFromCompany(company, lang).web || web;
    } catch {
      /* keep empty */
    }
    if (req.query.web) {
      try {
        web = parseWeb(req.query.web, lang);
      } catch {
        /* keep seed */
      }
    }
    return res.json({
      ok: true,
      board: computeBoard(company, web),
      company: companySummary(company, lang),
      state: onboardingState(company, lang),
      loggedIn: true,
    });
  } catch (error) {
    console.error('Airsup china test board error:', error);
    return res.status(500).json({ ok: false, error: 'board_failed' });
  }
});

router.post('/api/board/context', (req, res) => {
  upload.array('files', 8)(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        ok: false,
        error: tooBig ? 'file_too_large' : 'upload_failed',
      });
    }
    if (!peopleAuth.allowedOrigin(req)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    const lang = langFrom(req, res);
    const note = String((req.body && req.body.message) || '').trim();
    const files = describeUploads(req.files || []);
    let clientWeb = null;
    try {
      clientWeb = parseWeb(req.body && req.body.web, lang);
    } catch {
      clientWeb = null;
    }

    if (!note && !files.length) {
      return res.status(400).json({ ok: false, error: 'empty' });
    }

    try {
      let company = await readTestCompany(req);
      if (!company) {
        return res.status(401).json({ ok: false, error: 'login_required' });
      }
      if (company.status !== 'live') {
        return res.status(400).json({ ok: false, error: 'not_live' });
      }

      const profile = applyContextUpload(company, files.length ? files : [{ size: note.length }]);
      const storeApi = usingMemory() ? memoryStore : db;
      company = await storeApi.updateCompany(company.company_id, { profile });

      const seeded = seedWebFromCompany(company, lang).web || emptyWeb(lang);
      const hasClientNodes = clientWeb
        && clientWeb.nodes
        && typeof clientWeb.nodes === 'object'
        && Object.keys(clientWeb.nodes).length > 0;
      const baseWeb = hasClientNodes ? clientWeb : seeded;
      const dumped = applyDump(baseWeb, {
        message: note || files.map((f) => f.name).join(' '),
        files,
        lang,
      });
      const board = computeBoard(company, dumped.web);

      return res.json({
        ok: true,
        board,
        web: dumped.web,
        files,
        company: companySummary(company, lang),
      });
    } catch (error) {
      console.error('Airsup china test board context error:', error);
      return res.status(500).json({ ok: false, error: 'upload_failed' });
    }
  });
});

router.post('/api/login-demo', (req, res) => {
  return res.status(410).json({ error: 'gone' });
});

router.post('/api/login/request', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const lang = langFrom(req, res);
  const email = authCodes.normalizeEmail(req.body && req.body.email);
  if (!authCodes.looksLikeEmail(email)) {
    return jsonError(res, lang, 400, 'bad_email');
  }
  const found = await findCompanyForLogin(email);
  if (found.error === 'storage_unavailable') {
    return res.status(503).json({ ok: false, error: 'storage_unavailable' });
  }
  if (!found.company) {
    return jsonError(res, lang, 404, 'unknown_company');
  }
  const code = authCodes.issueCode(email);
  try {
    await sendLoginCodeEmail({
      lang,
      to: email,
      code,
      contactName: found.company.contact_name || '',
    });
  } catch (error) {
    console.error('Airsup dashboard login code mail failed:', error.message);
    return jsonError(res, lang, 502, 'mail_failed');
  }
  return res.json({ ok: true, mailed: true });
});

router.post('/api/login/verify', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const lang = langFrom(req, res);
  const email = authCodes.normalizeEmail(req.body && req.body.email);
  const code = String((req.body && req.body.code) || '').trim();
  if (!authCodes.looksLikeEmail(email)) {
    return jsonError(res, lang, 400, 'bad_email');
  }
  if (!authCodes.verifyCode(email, code)) {
    return jsonError(res, lang, 401, 'bad_code');
  }
  try {
    const found = await findCompanyForLogin(email);
    if (found.error === 'storage_unavailable') {
      return res.status(503).json({ ok: false, error: 'storage_unavailable' });
    }
    const company = found.company;
    if (!company) {
      return jsonError(res, lang, 404, 'unknown_company');
    }
    await openSession(req, res, company.company_id);
    const seeded = seedWebFromCompany(company, lang);
    return res.json({
      ok: true,
      redirect: DASHBOARD_BASE,
      company: {
        domain: company.domain,
        name: companyTitle(company, lang),
        status: company.status,
        email,
      },
      web: seeded.web,
      seeded: seeded.added,
      board: computeBoard(company),
    });
  } catch (error) {
    console.error('Airsup dashboard login verify error:', error);
    return res.status(500).json({ ok: false, error: 'login_failed' });
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
