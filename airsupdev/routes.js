/**
 * Airsupdev routes. Mounted at /airsupdev.
 * Ops MCP + Google OAuth (allowlisted emails only).
 */
const express = require('express');
const { createMcp } = require('./mcp');
const pluginOauth = require('./oauth-plugin');
const auth = require('./auth');
const db = require('./db');
const { allowedEmails } = require('./config');

const router = express.Router();
const store = db.getStore();
const mcp = createMcp({ store });

function connectHtml({ error, next }) {
  const nextPath = auth.safeNext(next);
  const googleHref = `/airsupdev/auth/google?next=${encodeURIComponent(nextPath)}`;
  let message = 'Sign in with Google to connect ChatGPT to Airsupdev (China ops MCP).';
  if (error === 'oauth') message = 'Google sign-in failed. Try again.';
  if (error === 'forbidden') {
    message = 'This MCP is private. Only allowlisted Google accounts can connect.';
  }
  if (error === 'google') message = 'Google OAuth is not configured on the server.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Airsupdev connect</title>
  <style>
    body { font-family: Georgia, serif; max-width: 28rem; margin: 3rem auto; padding: 0 1.2rem; color: #1f1a16; background: #f7f2ea; }
    a.button { display: inline-block; margin-top: 1rem; padding: .7rem 1rem; background: #6f1b27; color: #f7f2ea; text-decoration: none; }
    .muted { color: #6a645c; font-size: .92rem; line-height: 1.45; }
  </style>
</head>
<body>
  <h1>Airsupdev</h1>
  <p>${message}</p>
  <p class="muted">Only allowlisted accounts can use tools. Current allowlist is configured on the server.</p>
  <p><a class="button" href="${googleHref}">Continue with Google</a></p>
</body>
</html>`;
}

router.get('/connect', (req, res) => {
  res.type('html').send(connectHtml({
    error: String(req.query.error || ''),
    next: req.query.next,
  }));
});

router.get('/auth/google', (req, res) => {
  if (!auth.isGoogleConfigured()) {
    return res.redirect('/airsupdev/connect?error=google');
  }
  const next = auth.safeNext(req.query.next);
  const nonce = auth.setOauthState(req, res, { next });
  return res.redirect(auth.googleAuthUrl(req, nonce));
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const state = auth.takeOauthState(req, res);
    if (!state || !state.nonce || String(req.query.state || '') !== state.nonce) {
      return res.redirect('/airsupdev/connect?error=oauth');
    }
    if (req.query.error) return res.redirect('/airsupdev/connect?error=oauth');
    const code = String(req.query.code || '');
    if (!code) return res.redirect('/airsupdev/connect?error=oauth');
    const googleUser = await auth.exchangeCode(req, code);
    if (!auth.isEmailAllowed(googleUser.email)) {
      return res.redirect('/airsupdev/connect?error=forbidden');
    }
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
    console.error('Airsupdev Google callback error:', error);
    return res.redirect('/airsupdev/connect?error=oauth');
  }
});

router.get('/oauth/done', (req, res) => {
  res.type('html').send(`<!doctype html><html><body style="font-family:Georgia,serif;padding:2rem">
    <h1>Airsupdev connected</h1>
    <p>You can close this tab and return to ChatGPT.</p>
  </body></html>`);
});

router.get('/oauth/.well-known/oauth-authorization-server', (req, res) => {
  res.json(pluginOauth.authorizationServerMetadata(req));
});
router.post('/oauth/register', (req, res) => pluginOauth.handleRegister(req, res, store));
router.get('/oauth/authorize', (req, res) => pluginOauth.handleAuthorize(req, res, store));
router.post('/oauth/token', (req, res) => pluginOauth.handleToken(req, res, store));

router.all('/mcp', mcp.handleMcp);

router.get('/whoami', (req, res) => {
  const user = auth.readUser(req);
  res.json({
    signed_in: Boolean(user),
    email: user ? user.email : null,
    allowlisted: user ? auth.isEmailAllowed(user.email) : false,
    allowed_count: allowedEmails().length,
  });
});

module.exports = router;
