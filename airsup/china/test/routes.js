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
const { companyTitle } = require('../fields');
const { ensureDemoCompany, ensureDemoAllowlist } = require('../demo-company');
const db = require('../db');
const peopleAuth = require('../../auth');
const { welcomeMessage, completeTestTurn, emptyWeb } = require('./chat');
const { describeUploads } = require('./files');
const { layoutPositions, normalizeClientWeb } = require('./web');

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
  if (testCssCache !== null) return testCssCache;
  testCssCache = readCss(TEST_CSS_PATH);
  return testCssCache;
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
    company = await session.readCompany(req);
  } catch {
    company = null;
  }

  return render(req, res, 'chat.ejs', {
    lang,
    company,
    companyLabel: company ? companyTitle(company, lang) : '',
    welcome: welcomeMessage(lang),
    loggedIn: Boolean(company),
    initialWeb: emptyWeb(lang),
    layoutPositions: layoutPositions(),
  });
});

router.get('/api/state', async (req, res) => {
  const lang = langFrom(req, res);
  let company = null;
  try {
    company = await session.readCompany(req);
  } catch {
    company = null;
  }
  return res.json({
    concept: true,
    lang,
    loggedIn: Boolean(company),
    company: company ? {
      domain: company.domain,
      status: company.status,
      name: companyTitle(company, lang),
      email: company.contact_email || '',
    } : null,
    welcome: welcomeMessage(lang),
    web: emptyWeb(lang),
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
      company = await session.readCompany(req);
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
  if (!db.isConfigured()) {
    return res.status(503).json({ error: 'storage_unavailable' });
  }
  try {
    await ensureDemoAllowlist();
    const company = await ensureDemoCompany({ forceLive: true });
    await session.createSession(req, res, company.company_id);
    return res.json({
      ok: true,
      company: {
        domain: company.domain,
        name: companyTitle(company, langFrom(req, res)),
        status: company.status,
      },
    });
  } catch (error) {
    console.error('Airsup china test demo login error:', error);
    return res.status(500).json({ error: 'login_failed' });
  }
});

router.post('/api/logout', express.json(), async (req, res) => {
  if (!peopleAuth.allowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    await session.clearSession(req, res);
  } catch (error) {
    console.error('Airsup china test logout error:', error);
  }
  return res.json({ ok: true });
});

module.exports = router;
