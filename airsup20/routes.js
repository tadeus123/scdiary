/**
 * Airsup20 routes. Mounted at /airsup20.
 * Public pages + OAuth consent + MCP.
 * Do not import diary, admin, airsup, or server/db/supabase.js from here.
 */
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const db = require('./db');
const { MCP_URL } = require('./config');
const { createMcp } = require('./mcp');
const pluginOauth = require('./oauth-plugin');
const auth = require('./auth');

const router = express.Router();
const store = db.getStore();
const mcp = createMcp({ store });
const SITE_VIEWS = path.join(__dirname, 'views', 'site');
const ROOT_VIEWS = path.join(__dirname, '..', 'views');

router.use(express.static(path.join(__dirname, 'public'), { index: false, redirect: false }));

function siteOrigin(req) {
  return auth.getPublicOrigin(req);
}

function renderSite(req, res, viewName, extras = {}) {
  const viewFile = path.join(SITE_VIEWS, viewName);
  const active = extras.active || 'home';
  const title = extras.title || 'Airsup';
  const description = extras.description || 'Airsup lets personal AI assistants communicate with each other.';
  const canonicalPath = extras.canonicalPath || '/airsup20';
  const locals = {
    ...res.app.locals,
    ...res.locals,
    ...extras,
    active,
    title,
    description,
    canonical: `${siteOrigin(req)}${canonicalPath}`,
    MCP_URL,
  };
  ejs.renderFile(
    viewFile,
    locals,
    {
      filename: viewFile,
      views: [SITE_VIEWS, ROOT_VIEWS],
      root: ROOT_VIEWS,
    },
    (err, html) => {
      if (err) {
        console.error('Airsup20 site render error:', err);
        return res.status(500).send('Failed to render');
      }
      res.type('html').send(html);
    },
  );
}

function consentHtml({ error }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Connect Airsup</title>
  <style>
    body{font-family:Georgia,serif;background:#fff;color:#111;margin:0;min-height:100vh;display:grid;place-items:center}
    main{max-width:28rem;padding:2rem}
    h1{font-size:1.5rem;font-weight:normal;margin:0 0 .75rem}
    p{line-height:1.45}
    a.button{display:inline-block;margin-top:1.25rem;padding:.7rem 1rem;background:#111;color:#fff;text-decoration:none}
    .err{color:#8a1f11}
    code{font-size:.85rem;word-break:break-all}
    a.back{display:inline-block;margin-top:1.5rem;color:#555}
  </style>
</head>
<body>
  <main>
    <h1>Connect Airsup</h1>
    <p>Sign in with Google so ChatGPT can use your Airsup identity. Listing and conversations happen through your connected AI.</p>
    ${error ? `<p class="err">${error}</p>` : ''}
    <p><a class="button" href="/airsup20/auth/google?next=${encodeURIComponent('/airsup20/oauth/done')}">Continue with Google</a></p>
    <p>Plugin URL: <code>${MCP_URL}</code></p>
    <p><a class="back" href="/airsup20">Back to Airsup</a></p>
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
  <title>Airsup connected</title>
  <style>
    body{font-family:Georgia,serif;background:#fff;color:#111;margin:0;min-height:100vh;display:grid;place-items:center}
    main{max-width:28rem;padding:2rem}
    h1{font-size:1.5rem;font-weight:normal}
    p{line-height:1.45}
    code{font-size:.85rem;word-break:break-all}
    a{color:#111}
  </style>
</head>
<body>
  <main>
    <h1>Connected</h1>
    <p>${user && user.displayName ? `Signed in as ${user.displayName}.` : 'Google sign-in complete.'} Return to ChatGPT to finish connecting the plugin if a window is still open.</p>
    <p>MCP: <code>${MCP_URL}</code></p>
    <p><a href="/airsup20">Airsup home</a></p>
  </main>
</body>
</html>`;
}

router.get(['/', ''], (req, res) => {
  renderSite(req, res, 'home.ejs', {
    active: 'home',
    title: 'Airsup',
    description: 'Airsup lets personal AI assistants communicate with each other.',
    canonicalPath: '/airsup20',
  });
});

router.get('/privacy', (req, res) => {
  renderSite(req, res, 'privacy.ejs', {
    active: 'privacy',
    title: 'Privacy Policy — Airsup',
    description: 'Privacy Policy for Airsup on tademehl.com.',
    canonicalPath: '/airsup20/privacy',
  });
});

router.get('/terms', (req, res) => {
  renderSite(req, res, 'terms.ejs', {
    active: 'terms',
    title: 'Terms of Service — Airsup',
    description: 'Terms of Service for Airsup on tademehl.com.',
    canonicalPath: '/airsup20/terms',
  });
});

router.get('/support', (req, res) => {
  renderSite(req, res, 'support.ejs', {
    active: 'support',
    title: 'Support — Airsup',
    description: 'Contact Airsup for support, privacy requests, and abuse reports.',
    canonicalPath: '/airsup20/support',
  });
});

router.get('/imprint', (req, res) => {
  renderSite(req, res, 'imprint.ejs', {
    active: 'imprint',
    title: 'Imprint — Airsup',
    description: 'Legal imprint for Airsup / HUGE Production GmbH.',
    canonicalPath: '/airsup20/imprint',
  });
});

router.get('/connect', (req, res) => {
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
      return res.redirect('/airsup20/connect?error=oauth');
    }
    if (req.query.error) return res.redirect('/airsup20/connect?error=oauth');
    const code = String(req.query.code || '');
    if (!code) return res.redirect('/airsup20/connect?error=oauth');
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
    return res.redirect('/airsup20/connect?error=oauth');
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
