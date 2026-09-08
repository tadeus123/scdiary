const path = require('path');
const express = require('express');
const ejs = require('ejs');
const { QUESTIONS, normalizeAnswers } = require('../questions');
const websiteAuth = require('../auth');
const websiteDb = require('../db');
const { publicDisplayName } = require('../directory');
const { MCP_URL, GMAIL_SENDER } = require('./config');
const db = require('./db');
const { createMcp } = require('./mcp');
const pluginOauth = require('./oauth-plugin');
const gmailOauth = require('./oauth-gmail-send');
const { talkPrompt, doorbellText } = require('./prompt');
const { listingText } = require('./listing');

const router = express.Router();
const AIRSUP_VIEWS = path.join(__dirname, '../views');
const SITE_VIEWS = path.join(__dirname, '../../views');
const V2_VIEWS = path.join(__dirname, 'views');
const mcp = createMcp({ store: db });

function render(req, res, viewName, extra = {}, viewsDir = V2_VIEWS) {
  const viewFile = path.join(viewsDir, viewName);
  ejs.renderFile(
    viewFile,
    {
      ...res.app.locals,
      ...res.locals,
      ...extra,
    },
    {
      filename: viewFile,
      views: [viewsDir, AIRSUP_VIEWS, SITE_VIEWS],
      root: SITE_VIEWS,
    },
    (err, html) => {
      if (err) {
        console.error('Airsup v2 render error:', err);
        return res.status(500).send('Failed to render');
      }
      res.send(html);
    }
  );
}

async function syncPersonFromWebsiteUser(user, profile) {
  if (!user || !db.isConfigured()) return;
  const answers = (profile && profile.answers) || normalizeAnswers({});
  await db.upsertPerson({
    googleId: user.googleId,
    email: user.email,
    displayName: publicDisplayName({
      answers,
      displayName: (profile && profile.displayName) || user.displayName || '',
      email: user.email,
    }),
    listing: { answers },
  });
}

router.use((req, res, next) => {
  res.locals.airsupUser = websiteAuth.readUser(req);
  next();
});

router.get('/v2/prompt', async (req, res) => {
  const user = websiteAuth.readUser(req);
  if (!user) return res.redirect('/airsup');
  let answers = normalizeAnswers({});
  let profile = null;
  try {
    profile = await websiteDb.getProfile(user.googleId);
    if (profile) answers = profile.answers;
    await syncPersonFromWebsiteUser(user, profile);
  } catch (error) {
    console.error('Airsup v2 prompt load error:', error);
  }
  const mailConnected = db.isConfigured() ? Boolean(await db.getGmailSend().catch(() => null)) : false;
  render(req, res, 'prompt.ejs', {
    user,
    mcpUrl: MCP_URL,
    promptText: talkPrompt({
      answers,
      email: user.email,
      displayName: publicDisplayName({
        answers,
        displayName: (profile && profile.displayName) || user.displayName || '',
        email: user.email,
      }),
    }),
    doorbellText: doorbellText(),
    mailConnected,
    isSender: String(user.email || '').toLowerCase() === GMAIL_SENDER,
    mailError: req.query.error === 'mail',
    mailOk: req.query.mail === 'connected',
    listingPreview: listingText({
      answers,
      displayName: user.displayName,
      email: user.email,
    }),
    questions: QUESTIONS,
  });
});

router.get('/v2/mail/connect', (req, res) => gmailOauth.startConnect(req, res));
router.get('/v2/mail/google/callback', (req, res) => gmailOauth.handleCallback(req, res, db));

router.get('/v2/oauth/.well-known/oauth-authorization-server', (req, res) => {
  res.json(pluginOauth.authorizationServerMetadata(req));
});
router.post('/v2/oauth/register', (req, res) => pluginOauth.handleRegister(req, res, db));
router.options('/v2/oauth/register', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
});
router.get('/v2/oauth/authorize', (req, res) => pluginOauth.handleAuthorize(req, res, db));
router.get('/v2/oauth/google/callback', (req, res) => pluginOauth.handleGoogleCallback(req, res, db));
router.post('/v2/oauth/token', (req, res) => pluginOauth.handleToken(req, res, db));
router.options('/v2/oauth/token', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
});

router.all('/v2/mcp', (req, res) => mcp.handleMcp(req, res));

module.exports = {
  router,
  syncPersonFromWebsiteUser,
};
