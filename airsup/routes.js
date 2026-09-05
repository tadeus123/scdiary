/**
 * Airsup-only routes. Mounted at /airsup.
 * Do not import diary, admin, or server/db/supabase.js from here.
 */
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const { QUESTIONS, normalizeAnswers } = require('./questions');
const { generatePrompt, DOORBELL_WORKER, CHATGPT_SETUP_URL } = require('./prompt');
const {
  getProfile,
  upsertProfile,
  syncDirectory,
  getEndpointByGoogleId,
  isConfigured: isDbConfigured,
} = require('./db');
const { publicDisplayName } = require('./directory');
const { MCP_URL } = require('./config');
const { buildOpenApi } = require('./openapi');
const { handleMcp, callFindPeople, callTool, extractHeaderToken, withAuth } = require('./mcp');
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
  return publicDisplayName({
    answers: profile && profile.answers,
    displayName: (profile && profile.displayName) || (user && user.displayName) || '',
    email: (user && user.email) || '',
  });
}

router.get(['/', ''], (req, res) => {
  renderAirsup(req, res, 'index.ejs', {
    oauthError: req.query.error === 'oauth' ? 'Google sign-in failed. Try again.' : null,
  });
});

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
    }
    const endpoint = await getEndpointByGoogleId(user.googleId);
    if (endpoint) {
      directoryConsent = Boolean(endpoint.active && endpoint.contactable);
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
    dbConfigured: isDbConfigured(),
    matchConfigured: isOpenAiConfigured(),
    serverUpdatedAt,
  });
});

router.get('/prompt', async (req, res) => {
  const user = auth.readUser(req);
  if (!user) return res.redirect('/airsup');
  let answers = normalizeAnswers({});
  let profile = null;
  let endpointId = '';
  let mcpToken = '';
  try {
    profile = await getProfile(user.googleId);
    if (profile) answers = profile.answers;
    const endpoint = await getEndpointByGoogleId(user.googleId);
    if (endpoint) {
      endpointId = endpoint.endpoint_id;
      mcpToken = endpoint.mcp_token || '';
    }
  } catch (error) {
    console.error('Airsup prompt load error:', error);
  }
  if (!endpointId || !mcpToken) return res.redirect('/airsup/you');
  renderAirsup(req, res, 'prompt.ejs', {
    user,
    mcpUrl: MCP_URL,
    chatgptSetupUrl: CHATGPT_SETUP_URL,
    promptText: generatePrompt({
      questions: QUESTIONS,
      answers,
      email: user.email,
      displayName: userDisplayName(user, profile),
      endpointId,
      mcpUrl: MCP_URL,
      mcpToken,
    }),
    doorbellText: DOORBELL_WORKER,
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
      return res.redirect('/airsup?error=oauth');
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
    const endpoint = await syncDirectory({
      googleId: user.googleId,
      email: user.email,
      displayName: userDisplayName(user, profile),
      answers: profile.answers,
      consent,
    });
    res.json({
      ok: true,
      setupUrl: CHATGPT_SETUP_URL,
      next: '/airsup/prompt',
      answers: profile.answers,
      endpoint_id: endpoint && endpoint.endpoint_id,
      token: endpoint && endpoint.mcp_token,
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
    const data = await callFindPeople(withAuth({
      requester_id: body.requester_id || body.exclude_endpoint_id,
      token: body.token,
      query: body.query || body.current_need || body.need,
      current_need: body.current_need || body.need,
      what_requester_can_offer: body.what_requester_can_offer || body.offer,
      desired_person: body.desired_person,
      maximum_results: body.maximum_results,
    }, extractHeaderToken(req)));
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
    const data = await callFindPeople(withAuth({
      requester_id: body.exclude_endpoint_id || body.requester_id,
      token: body.token,
      query: body.query || body.need || body.current_need,
      current_need: body.need || body.current_need,
      what_requester_can_offer: body.offer || body.what_requester_can_offer,
      desired_person: body.desired_person,
      maximum_results: body.maximum_results || 3,
    }, extractHeaderToken(req)));
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
    const data = await callTool(name, withAuth(req.body || {}, extractHeaderToken(req)));
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

router.options('/api/calls/:tool', (req, res) => {
  setSearchCors(res);
  res.status(204).end();
});

router.post('/api/a2a/create_network_request', (req, res) => handleA2aTool(req, res, 'create_network_request'));
router.post('/api/a2a/validate_incoming_message', (req, res) => handleA2aTool(req, res, 'validate_incoming_message'));
router.post('/api/a2a/create_network_response', (req, res) => handleA2aTool(req, res, 'create_network_response'));
router.post('/api/a2a/record_network_response', (req, res) => handleA2aTool(req, res, 'record_network_response'));
router.post('/api/a2a/get_network_results', (req, res) => handleA2aTool(req, res, 'get_network_results'));

router.post('/api/calls/prepare_call', (req, res) => handleA2aTool(req, res, 'prepare_call'));
router.post('/api/calls/confirm_call', (req, res) => handleA2aTool(req, res, 'confirm_call'));
router.post('/api/calls/start_call', (req, res) => handleA2aTool(req, res, 'start_call'));
router.post('/api/calls/join_call', (req, res) => handleA2aTool(req, res, 'join_call'));
router.post('/api/calls/session_sync', (req, res) => handleA2aTool(req, res, 'session_sync'));
router.post('/api/calls/hang_up', (req, res) => handleA2aTool(req, res, 'hang_up'));
router.post('/api/calls/list_calls', (req, res) => handleA2aTool(req, res, 'list_calls'));
router.post('/api/calls/handle_ring', (req, res) => handleA2aTool(req, res, 'handle_ring'));

router.all('/mcp', handleMcp);

router.get('/openapi.json', (req, res) => {
  res.json(buildOpenApi(auth.getPublicOrigin(req)));
});

module.exports = router;
