/**
 * Airsup20 routes. Mounted at /airsup20.
 * No product website — OAuth consent + MCP only.
 * Do not import diary, admin, airsup, or server/db/supabase.js from here.
 */
const express = require('express');
const db = require('./db');
const { MCP_URL } = require('./config');
const { createMcp } = require('./mcp');
const pluginOauth = require('./oauth-plugin');
const auth = require('./auth');

const router = express.Router();
const store = db.getStore();
const mcp = createMcp({ store });

function consentHtml({ error }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Airsup20 connect</title>
  <style>
    body{font-family:Georgia,serif;background:#111;color:#f4f0e8;margin:0;min-height:100vh;display:grid;place-items:center}
    main{max-width:28rem;padding:2rem}
    h1{font-size:1.5rem;font-weight:normal;margin:0 0 .75rem}
    p{line-height:1.45;opacity:.9}
    a.button{display:inline-block;margin-top:1.25rem;padding:.7rem 1rem;background:#f4f0e8;color:#111;text-decoration:none}
    .err{color:#f5a89a}
    code{font-size:.85rem}
  </style>
</head>
<body>
  <main>
    <h1>Connect Airsup20</h1>
    <p>Sign in with Google so ChatGPT can use your Airsup20 identity, listing, and endpoint. There is no dashboard — everything else happens in ChatGPT.</p>
    ${error ? `<p class="err">${error}</p>` : ''}
    <p><a class="button" href="/airsup20/auth/google?next=${encodeURIComponent('/airsup20/oauth/done')}">Continue with Google</a></p>
    <p>Plugin URL: <code>${MCP_URL}</code></p>
  </main>
</body>
</html>`;
}

function doneHtml(user) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Airsup20 connected</title>
  <style>
    body{font-family:Georgia,serif;background:#111;color:#f4f0e8;margin:0;min-height:100vh;display:grid;place-items:center}
    main{max-width:28rem;padding:2rem}
    h1{font-size:1.5rem;font-weight:normal}
    p{line-height:1.45;opacity:.9}
    code{font-size:.85rem}
  </style>
</head>
<body>
  <main>
    <h1>Connected</h1>
    <p>${user && user.displayName ? `Signed in as ${user.displayName}.` : 'Google sign-in complete.'} Return to ChatGPT to finish connecting the plugin if a window is still open.</p>
    <p>MCP: <code>${MCP_URL}</code></p>
  </main>
</body>
</html>`;
}

router.get(['/', ''], (req, res) => {
  res.set('X-Robots-Tag', 'noindex');
  res.type('html').send(consentHtml({
    error: req.query.error === 'oauth' ? 'Google sign-in failed. Try again.' : '',
  }));
});

router.get('/oauth/done', (req, res) => {
  res.set('X-Robots-Tag', 'noindex');
  res.type('html').send(doneHtml(auth.readUser(req)));
});

router.get('/auth/google', (req, res) => {
  if (!auth.isGoogleConfigured()) {
    return res.status(503).send('Google OAuth is not configured for Airsup20.');
  }
  const next = auth.safeNext(req.query.next);
  const nonce = auth.setOauthState(req, res, { next });
  return res.redirect(auth.googleAuthUrl(req, nonce));
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const state = auth.takeOauthState(req, res);
    if (!state || !state.nonce || String(req.query.state || '') !== state.nonce) {
      return res.redirect('/airsup20?error=oauth');
    }
    if (req.query.error) return res.redirect('/airsup20?error=oauth');
    const code = String(req.query.code || '');
    if (!code) return res.redirect('/airsup20?error=oauth');
    const googleUser = await auth.exchangeCode(req, code);
    auth.setUser(req, res, googleUser);
    await store.upsertUser({
      googleId: googleUser.googleId,
      email: googleUser.email,
      displayName: googleUser.displayName,
      picture: googleUser.picture,
      locale: googleUser.locale,
      googleProfile: googleUser.googleProfile,
    });
    return res.redirect(auth.safeNext(state.next));
  } catch (error) {
    console.error('Airsup20 Google callback error:', error);
    return res.redirect('/airsup20?error=oauth');
  }
});

router.post('/auth/logout', (req, res) => {
  auth.clearUser(req, res);
  res.redirect('/airsup20');
});

router.get('/oauth/.well-known/oauth-authorization-server', (req, res) => {
  res.json(pluginOauth.authorizationServerMetadata(req));
});

router.post('/oauth/register', (req, res) => pluginOauth.handleRegister(req, res, store));
router.get('/oauth/authorize', (req, res) => pluginOauth.handleAuthorize(req, res, store));
router.post('/oauth/token', (req, res) => pluginOauth.handleToken(req, res, store));

router.all('/mcp', (req, res) => mcp.handleMcp(req, res));

module.exports = router;
module.exports.pluginOauth = pluginOauth;
module.exports.mcp = mcp;
