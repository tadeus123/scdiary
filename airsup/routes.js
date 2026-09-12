/**
 * Airsup-only routes. Mounted at /airsup.
 * Do not import diary, admin, or server/db/supabase.js from here.
 */
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const { QUESTIONS, normalizeAnswers } = require('./questions');
const { publicDisplayName } = require('./directory');
const { MCP_URL, GMAIL_SENDER } = require('./config');
const db = require('./db');
const { createMcp } = require('./mcp');
const pluginOauth = require('./oauth-plugin');
const gmailOauth = require('./oauth-gmail-send');
const { talkPrompt, doorbellText } = require('./prompt');
const auth = require('./auth');

const router = express.Router();
const AIRSUP_VIEWS = path.join(__dirname, 'views');
const SITE_VIEWS = path.join(__dirname, '../views');
const mcp = createMcp({ store: db });

async function syncPersonFromWebsiteUser(user, profile) {
  if (!user || !db.isConfigured()) return;
  const answers = (profile && profile.answers) || normalizeAnswers({});
  const contactable = profile && typeof profile.contactable === 'boolean' ? profile.contactable : true;
  await db.upsertPerson({
    googleId: user.googleId,
    email: user.email,
    displayName: publicDisplayName({
      answers,
      displayName: (profile && profile.displayName) || user.displayName || '',
      email: user.email,
    }),
    listing: { answers, contactable },
  });
}

async function getProfile(googleId) {
  const person = await db.getPersonByGoogleId(googleId);
  if (!person) return null;
  const listing = person.listing && typeof person.listing === 'object' ? person.listing : {};
  return {
    googleId: person.google_id,
    email: person.email,
    displayName: person.display_name || '',
    answers: normalizeAnswers(listing.answers),
    updatedAt: person.updated_at || '',
    contactable: listing.contactable !== false,
    personId: person.person_id,
  };
}

function renderAirsup(req, res, viewName, extra = {}) {
  const viewFile = path.join(AIRSUP_VIEWS, viewName);
  const locals = {
    ...res.app.locals,
    ...res.locals,
    ...extra,
  };
  ejs.renderFile(
    viewFile,
    locals,
    {
      filename: viewFile,
      views: [AIRSUP_VIEWS, SITE_VIEWS],
      root: SITE_VIEWS,
    },
    (err, html) => {
      if (err) {
        console.error('Airsup render error:', err);
        return res.status(500).send('Failed to render');
      }
      res.send(html);
    }
  );
}

function userDisplayName(user, profile) {
  return publicDisplayName({
    answers: profile && profile.answers,
    displayName: (profile && profile.displayName) || (user && user.displayName) || '',
    email: (user && user.email) || '',
  });
}

router.use((req, res, next) => {
  const suffix = req.path === '/' ? '' : req.path;
  res.locals.seo = {
    title: 'Tade Mehl — airsup',
    description: 'Airsup — Tade Mehl.',
    path: `/airsup${suffix}`,
    noindex: true,
    includePersonSchema: false,
  };
  res.locals.airsupUser = auth.readUser(req);
  next();
});

router.get(['/', ''], (req, res) => {
  renderAirsup(req, res, 'index.ejs', {
    oauthError: req.query.error === 'oauth' ? 'Google sign-in failed. Try again.' : null,
  });
});

router.get('/you', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) {
    const q = req.query.error === 'oauth' ? '?error=oauth' : '';
    return res.redirect(`/airsup${q}`);
  }
  let answers = normalizeAnswers({});
  let loadError = null;
  let directoryConsent = true;
  let serverUpdatedAt = '';
  try {
    const profile = await getProfile(user.googleId);
    if (profile) {
      answers = profile.answers;
      serverUpdatedAt = profile.updatedAt || '';
      directoryConsent = profile.contactable;
    }
  } catch (error) {
    console.error('Airsup profile load error:', error);
    loadError = 'Could not load saved answers.';
  }
  renderAirsup(req, res, 'you.ejs', {
    user,
    questions: QUESTIONS,
    answers,
    directoryConsent,
    loadError,
    dbConfigured: db.isConfigured(),
    matchConfigured: true,
    serverUpdatedAt,
  });
});

router.get('/prompt', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.redirect('/airsup');
  let answers = normalizeAnswers({});
  let profile = null;
  try {
    profile = await getProfile(user.googleId);
    if (profile) answers = profile.answers;
    await syncPersonFromWebsiteUser(user, profile || { answers, displayName: user.displayName });
  } catch (error) {
    console.error('Airsup prompt load error:', error);
  }
  const mailConnected = db.isConfigured() ? Boolean(await db.getGmailSend().catch(() => null)) : false;
  renderAirsup(req, res, 'prompt.ejs', {
    user,
    mcpUrl: MCP_URL,
    promptText: talkPrompt({
      answers,
      email: user.email,
      displayName: userDisplayName(user, profile),
    }),
    doorbellText: doorbellText(),
    mailConnected,
    isSender: String(user.email || '').toLowerCase() === GMAIL_SENDER,
    mailError: req.query.error === 'mail',
    mailOk: req.query.mail === 'connected',
  });
});

router.get('/auth/google', (req, res) => {
  if (!auth.isGoogleConfigured()) {
    return renderAirsup(req, res, 'oauth-setup.ejs', {
      redirectUris: auth.redirectUris(req),
    });
  }
  const next = typeof req.query.next === 'string' ? req.query.next : '';
  const state = auth.setOauthState(req, res, { purpose: 'login', next });
  res.redirect(auth.googleAuthUrl(req, state));
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const pending = auth.takeOauthState(req, res);
    const { code, state } = req.query;
    if (!pending || !pending.nonce || !state || state !== pending.nonce || typeof code !== 'string') {
      return res.redirect('/airsup?error=oauth');
    }
    if (pending.purpose === 'gmail_send') {
      const user = auth.readUser(req);
      if (!user || String(user.email || '').toLowerCase() !== GMAIL_SENDER) {
        return res.redirect('/airsup?error=oauth');
      }
      const tokenJson = await auth.exchangeGoogleTokens(req, code);
      if (!tokenJson.refresh_token) {
        return res.redirect('/airsup/prompt?error=mail');
      }
      await db.setGmailSend({
        googleId: user.googleId,
        email: GMAIL_SENDER,
        refreshToken: tokenJson.refresh_token,
      });
      return res.redirect('/airsup/prompt?mail=connected');
    }
    const googleUser = await auth.exchangeCode(req, code);
    let answers = normalizeAnswers({});
    try {
      const existing = await getProfile(googleUser.googleId);
      if (existing) answers = existing.answers;
    } catch (error) {
      console.error('Airsup profile ensure error:', error);
    }
    try {
      await syncPersonFromWebsiteUser(googleUser, { answers, displayName: googleUser.displayName });
    } catch (error) {
      console.error('Airsup person sync error:', error);
    }
    auth.setUser(req, res, googleUser);
    return res.redirect(auth.safeAirsupPath(pending.next));
  } catch (error) {
    console.error('Airsup Google OAuth error:', error);
    res.redirect('/airsup?error=oauth');
  }
});

router.post('/auth/logout', (req, res) => {
  auth.clearUser(req, res);
  res.redirect('/airsup');
});

router.put('/api/profile', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Not signed in' });
  if (!auth.allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Bad origin' });
  try {
    const answers = normalizeAnswers(req.body && req.body.answers);
    const contactable = req.body && typeof req.body.directoryConsent === 'boolean'
      ? req.body.directoryConsent
      : true;
    await syncPersonFromWebsiteUser(user, {
      answers,
      displayName: user.displayName,
      contactable,
    });
    res.json({ ok: true, answers });
  } catch (error) {
    console.error('Airsup save error:', error);
    res.status(500).json({ ok: false, error: 'Could not save' });
  }
});

router.post('/api/finish', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Not signed in' });
  if (!auth.allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Bad origin' });
  try {
    const answers = normalizeAnswers(req.body && req.body.answers);
    const contactable = req.body && req.body.directoryConsent !== false;
    await syncPersonFromWebsiteUser(user, {
      answers,
      displayName: user.displayName,
      contactable,
    });
    res.json({
      ok: true,
      next: '/airsup/prompt',
      answers,
    });
  } catch (error) {
    console.error('Airsup finish error:', error);
    res.status(500).json({ ok: false, error: 'Could not save' });
  }
});

router.get('/mail/connect', (req, res) => gmailOauth.startConnect(req, res));

router.get('/oauth/.well-known/oauth-authorization-server', (req, res) => {
  res.json(pluginOauth.authorizationServerMetadata(req));
});
router.post('/oauth/register', (req, res) => pluginOauth.handleRegister(req, res, db));
router.options('/oauth/register', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
});
router.get('/oauth/authorize', (req, res) => pluginOauth.handleAuthorize(req, res, db));
router.post('/oauth/token', (req, res) => pluginOauth.handleToken(req, res, db));
router.options('/oauth/token', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
});

router.all('/mcp', (req, res) => mcp.handleMcp(req, res));

// AIRSUP-CHINA-BEGIN
router.get('/live-companies.json', require('./china/live-companies'));
router.use('/china', require('./china/routes'));
// AIRSUP-CHINA-END

module.exports = router;
