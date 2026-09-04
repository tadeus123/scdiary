/**
 * Airsup-only routes. Mounted at /airsup.
 * Do not import diary, admin, or server/db/supabase.js from here.
 */
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const { QUESTIONS, normalizeAnswers } = require('./questions');
const { generatePrompt, CHATGPT_SETUP_URL, CHATGPT_APP_URL } = require('./prompt');
const { getProfile, upsertProfile, isConfigured: isDbConfigured } = require('./db');
const auth = require('./auth');

const router = express.Router();
const AIRSUP_VIEWS = path.join(__dirname, 'views');
const SITE_VIEWS = path.join(__dirname, '../views');

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

router.get(['/', ''], (req, res) => {
  renderAirsup(req, res, 'index.ejs');
});

router.get('/you', async (req, res) => {
  const user = auth.readUser(req);
  let answers = normalizeAnswers({});
  let loadError = null;
  if (user) {
    try {
      const profile = await getProfile(user.googleId);
      if (profile) answers = profile.answers;
    } catch (error) {
      console.error('Airsup profile load error:', error);
      loadError = 'Could not load saved answers.';
    }
  }
  renderAirsup(req, res, 'you.ejs', {
    user,
    questions: QUESTIONS,
    answers,
    googleConfigured: auth.isGoogleConfigured(),
    oauthError: req.query.error === 'oauth' ? 'Google sign-in failed. Try again.' : null,
    loadError,
    dbConfigured: isDbConfigured(),
  });
});

router.get('/prompt', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.redirect('/airsup/you');
  let answers = normalizeAnswers({});
  try {
    const profile = await getProfile(user.googleId);
    if (profile) answers = profile.answers;
  } catch (error) {
    console.error('Airsup prompt load error:', error);
  }
  renderAirsup(req, res, 'prompt.ejs', {
    user,
    promptText: generatePrompt(QUESTIONS, answers, user.email),
    chatgptUrl: CHATGPT_APP_URL,
  });
});

router.get('/auth/google', (req, res) => {
  if (!auth.isGoogleConfigured()) {
    return renderAirsup(req, res, 'oauth-setup.ejs', {
      redirectUris: auth.redirectUris(req),
    });
  }
  const state = auth.setOauthState(req, res);
  res.redirect(auth.googleAuthUrl(req, state));
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const expected = auth.takeOauthState(req, res);
    const { code, state } = req.query;
    if (!expected || !state || state !== expected || typeof code !== 'string') {
      return res.redirect('/airsup/you?error=oauth');
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
      await upsertProfile({
        googleId: googleUser.googleId,
        email: googleUser.email,
        answers,
      });
    } catch (error) {
      console.error('Airsup profile create error:', error);
    }
    auth.setUser(req, res, googleUser);
    res.redirect('/airsup/you');
  } catch (error) {
    console.error('Airsup Google OAuth error:', error);
    res.redirect('/airsup/you?error=oauth');
  }
});

router.post('/auth/logout', (req, res) => {
  auth.clearUser(req, res);
  res.redirect('/airsup/you');
});

router.put('/api/profile', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Not signed in' });
  if (!auth.allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Bad origin' });
  try {
    const profile = await upsertProfile({
      googleId: user.googleId,
      email: user.email,
      answers: req.body && req.body.answers,
    });
    res.json({ ok: true, answers: profile.answers });
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
    const profile = await upsertProfile({
      googleId: user.googleId,
      email: user.email,
      answers: req.body && req.body.answers,
    });
    res.json({
      ok: true,
      setupUrl: CHATGPT_SETUP_URL,
      next: '/airsup/prompt',
      answers: profile.answers,
    });
  } catch (error) {
    console.error('Airsup finish error:', error);
    res.status(500).json({ ok: false, error: 'Could not save' });
  }
});

module.exports = router;
