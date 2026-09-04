/**
 * Airsup-only routes. Mounted at /airsup.
 * Do not import diary, admin, or server/db/supabase.js from here.
 */
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const { QUESTIONS, normalizeAnswers } = require('./questions');
const { generatePrompt, CHATGPT_SETUP_URL } = require('./prompt');
const {
  getProfile,
  upsertProfile,
  syncDirectory,
  getEndpointByGoogleId,
  isConfigured: isDbConfigured,
  listActiveEndpoints,
} = require('./db');
const { displayNameFrom } = require('./directory');
const { generateMatchCard, normalizeCard, emptyCard, publicDirectory } = require('./card');
const { buildOpenApi } = require('./openapi');
const { handleMcp, callFindPeople, callTool } = require('./mcp');
const { isOpenAiConfigured } = require('./openai');
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

function userDisplayName(user, profile) {
  return displayNameFrom({
    displayName: (profile && profile.displayName) || (user && user.displayName) || '',
    email: (user && user.email) || '',
  });
}

function directoryUrl(req) {
  return `${auth.getPublicOrigin(req)}/airsup/directory`;
}

async function loadPublicDirectory() {
  if (!isDbConfigured()) return [];
  const rows = await listActiveEndpoints();
  return publicDirectory(rows);
}

function directoryAuthorized(req) {
  const expected = process.env.AIRSUP_DIRECTORY_KEY;
  if (!expected) return true;
  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const alt = req.get('x-airsup-key') || '';
  return bearer === expected || alt === expected;
}

function setSearchCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Airsup-Key');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

router.get(['/', ''], (req, res) => {
  renderAirsup(req, res, 'index.ejs');
});

router.options('/directory.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.status(204).end();
});

router.get('/directory.json', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=60');
  try {
    const people = await loadPublicDirectory();
    res.json({
      note: 'Public Airsup AI endpoint cards only. No intimate onboarding answers. Never invent people.',
      directory: `${auth.getPublicOrigin(req)}/airsup/directory`,
      people,
    });
  } catch (error) {
    console.error('Airsup directory.json error:', error);
    res.status(500).json({ people: [], error: 'Could not load directory' });
  }
});

router.get('/directory', async (req, res) => {
  let people = [];
  try {
    people = await loadPublicDirectory();
  } catch (error) {
    console.error('Airsup directory error:', error);
  }
  renderAirsup(req, res, 'directory.ejs', { people });
});

router.get('/you', async (req, res) => {
  const user = auth.readUser(req);
  let answers = normalizeAnswers({});
  let loadError = null;
  let directoryConsent = true;
  let matchCard = emptyCard();
  let serverUpdatedAt = '';
  if (user) {
    try {
      const profile = await getProfile(user.googleId);
      if (profile) {
        answers = profile.answers;
        serverUpdatedAt = profile.updatedAt || '';
      }
      const endpoint = await getEndpointByGoogleId(user.googleId);
      if (endpoint) {
        directoryConsent = Boolean(endpoint.active && endpoint.contactable);
        matchCard = normalizeCard(endpoint.match_card);
      }
    } catch (error) {
      console.error('Airsup profile load error:', error);
      loadError = 'Could not load saved answers.';
    }
  }
  renderAirsup(req, res, 'you.ejs', {
    user,
    questions: QUESTIONS,
    answers,
    matchCard,
    directoryConsent,
    googleConfigured: auth.isGoogleConfigured(),
    oauthError: req.query.error === 'oauth' ? 'Google sign-in failed. Try again.' : null,
    loadError,
    dbConfigured: isDbConfigured(),
    matchConfigured: isOpenAiConfigured(),
    serverUpdatedAt,
  });
});

router.get('/prompt', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.redirect('/airsup/you');
  let answers = normalizeAnswers({});
  let profile = null;
  let endpointId = '';
  try {
    profile = await getProfile(user.googleId);
    if (profile) answers = profile.answers;
    const endpoint = await getEndpointByGoogleId(user.googleId);
    if (endpoint) endpointId = endpoint.endpoint_id;
  } catch (error) {
    console.error('Airsup prompt load error:', error);
  }
  const liveDirectory = directoryUrl(req);
  renderAirsup(req, res, 'prompt.ejs', {
    user,
    promptText: generatePrompt({
      questions: QUESTIONS,
      answers,
      email: user.email,
      displayName: userDisplayName(user, profile),
      endpointId,
      directoryUrl: liveDirectory,
    }),
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
        displayName: googleUser.displayName,
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
      displayName: user.displayName,
      answers: req.body && req.body.answers,
    });
    const existing = await getEndpointByGoogleId(user.googleId);
    const consentFromBody = req.body && typeof req.body.directoryConsent === 'boolean'
      ? req.body.directoryConsent
      : null;
    if (existing || consentFromBody === true) {
      await syncDirectory({
        googleId: user.googleId,
        email: user.email,
        displayName: userDisplayName(user, profile),
        answers: profile.answers,
        matchCard: req.body && req.body.matchCard,
        consent: consentFromBody === null
          ? Boolean(existing && existing.active && existing.contactable)
          : consentFromBody,
      });
    }
    res.json({ ok: true, answers: profile.answers });
  } catch (error) {
    console.error('Airsup save error:', error);
    res.status(500).json({ ok: false, error: 'Could not save' });
  }
});

router.post('/api/card/generate', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Not signed in' });
  if (!auth.allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Bad origin' });
  try {
    const card = await generateMatchCard(req.body && req.body.answers);
    res.json({ ok: true, card });
  } catch (error) {
    console.error('Airsup card generate error:', error);
    res.status(500).json({ ok: false, error: 'Could not build the public card' });
  }
});

router.post('/api/finish', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Not signed in' });
  if (!auth.allowedOrigin(req)) return res.status(403).json({ ok: false, error: 'Bad origin' });
  try {
    const consent = req.body && req.body.directoryConsent !== false;
    const profile = await upsertProfile({
      googleId: user.googleId,
      email: user.email,
      displayName: user.displayName,
      answers: req.body && req.body.answers,
    });
    let matchCard = normalizeCard(req.body && req.body.matchCard);
    if (consent && !matchCard.can_help_with.length && !matchCard.short_context) {
      matchCard = await generateMatchCard(profile.answers);
    }
    const endpoint = await syncDirectory({
      googleId: user.googleId,
      email: user.email,
      displayName: userDisplayName(user, profile),
      answers: profile.answers,
      matchCard,
      consent,
    });
    res.json({
      ok: true,
      setupUrl: CHATGPT_SETUP_URL,
      next: '/airsup/prompt',
      answers: profile.answers,
      endpoint_id: endpoint && endpoint.endpoint_id,
    });
  } catch (error) {
    console.error('Airsup finish error:', error);
    res.status(500).json({ ok: false, error: 'Could not save' });
  }
});

router.options('/api/find_people', (req, res) => {
  setSearchCors(res);
  res.status(204).end();
});

router.post('/api/find_people', async (req, res) => {
  setSearchCors(res);
  if (!directoryAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    const body = req.body || {};
    const data = await callFindPeople({
      requester_id: body.requester_id || body.exclude_endpoint_id,
      current_need: body.current_need || body.need,
      what_requester_can_offer: body.what_requester_can_offer || body.offer,
      desired_person: body.desired_person,
      maximum_results: body.maximum_results,
    });
    res.json({ ok: true, ...data });
  } catch (error) {
    console.error('Airsup find_people error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Search failed' });
  }
});

router.options('/api/search_ai_endpoints', (req, res) => {
  setSearchCors(res);
  res.status(204).end();
});

router.post('/api/search_ai_endpoints', async (req, res) => {
  setSearchCors(res);
  if (!directoryAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    const body = req.body || {};
    const data = await callFindPeople({
      requester_id: body.exclude_endpoint_id || body.requester_id,
      current_need: body.need || body.current_need,
      what_requester_can_offer: body.offer || body.what_requester_can_offer,
      desired_person: body.desired_person,
      maximum_results: body.maximum_results || 3,
    });
    res.json({ ok: true, ...data });
  } catch (error) {
    console.error('Airsup directory search error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Search failed' });
  }
});

async function handleA2aTool(req, res, name) {
  setSearchCors(res);
  if (!directoryAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    const data = await callTool(name, req.body || {});
    res.json({ ok: true, ...data });
  } catch (error) {
    console.error(`Airsup ${name} error:`, error);
    res.status(400).json({ ok: false, error: error.message || 'Failed' });
  }
}

router.options('/api/a2a/:tool', (req, res) => {
  setSearchCors(res);
  res.status(204).end();
});

router.post('/api/a2a/create_network_request', (req, res) => handleA2aTool(req, res, 'create_network_request'));
router.post('/api/a2a/validate_incoming_message', (req, res) => handleA2aTool(req, res, 'validate_incoming_message'));
router.post('/api/a2a/create_network_response', (req, res) => handleA2aTool(req, res, 'create_network_response'));
router.post('/api/a2a/record_network_response', (req, res) => handleA2aTool(req, res, 'record_network_response'));
router.post('/api/a2a/get_network_results', (req, res) => handleA2aTool(req, res, 'get_network_results'));

router.all('/mcp', handleMcp);

router.get('/openapi.json', (req, res) => {
  res.json(buildOpenApi(auth.getPublicOrigin(req)));
});

module.exports = router;
