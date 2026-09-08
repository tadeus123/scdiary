const crypto = require('crypto');
const { MCP_URL, PLUGIN_SCOPE } = require('./config');
const { sha256, randomToken } = require('./store-memory');
const websiteAuth = require('../auth');

const ACCESS_DAYS = 30;
const CODE_MINUTES = 10;

function publicOrigin(req) {
  const fromEnv = process.env.AIRSUP_PUBLIC_ORIGIN;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const proto = (req.get && req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get && req.get('x-forwarded-host') || req.get('host') || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}`;
}

function pluginAuthorizeUrl(req) {
  return `${publicOrigin(req)}/airsup/v2/oauth/authorize`;
}

function pluginTokenUrl(req) {
  return `${publicOrigin(req)}/airsup/v2/oauth/token`;
}

function pluginRegisterUrl(req) {
  return `${publicOrigin(req)}/airsup/v2/oauth/register`;
}

function pluginGoogleCallback(req) {
  return `${publicOrigin(req)}/airsup/v2/oauth/google/callback`;
}

function authorizationServerMetadata(req) {
  const issuer = `${publicOrigin(req)}/airsup/v2/oauth`;
  return {
    issuer,
    authorization_endpoint: pluginAuthorizeUrl(req),
    token_endpoint: pluginTokenUrl(req),
    registration_endpoint: pluginRegisterUrl(req),
    scopes_supported: [PLUGIN_SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  };
}

function protectedResourceMetadata(req) {
  return {
    resource: MCP_URL,
    authorization_servers: [`${publicOrigin(req)}/airsup/v2/oauth`],
    bearer_methods_supported: ['header'],
    scopes_supported: [PLUGIN_SCOPE],
  };
}

function packState(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AIRSUP_SESSION_SECRET || process.env.SESSION_SECRET || 'airsup-dev-secret').update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function unpackState(raw) {
  if (!raw || !String(raw).includes('.')) return null;
  const [payload, sig] = String(raw).split('.');
  const expected = crypto.createHmac('sha256', process.env.AIRSUP_SESSION_SECRET || process.env.SESSION_SECRET || 'airsup-dev-secret').update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function googlePluginAuthUrl(req, state) {
  const params = new URLSearchParams({
    client_id: process.env.AIRSUP_GOOGLE_CLIENT_ID,
    redirect_uri: pluginGoogleCallback(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function redirectAllowed(client, redirectUri) {
  const uris = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
  return uris.includes(redirectUri);
}

async function registerClient(store, body) {
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!redirectUris.length) {
    const err = new Error('redirect_uris required');
    err.statusCode = 400;
    throw err;
  }
  const clientId = randomToken('cli_', 16);
  await store.insertClient({
    client_id: clientId,
    client_secret_hash: null,
    redirect_uris: redirectUris,
    client_name: String(body.client_name || 'ChatGPT'),
  });
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

async function issueTokens(store, personId) {
  const access = randomToken('as_', 24);
  const refresh = randomToken('rf_', 24);
  const expiresAt = new Date(Date.now() + ACCESS_DAYS * 86400000).toISOString();
  await store.insertPluginToken({
    tokenHash: sha256(access),
    refreshHash: sha256(refresh),
    personId,
    expiresAt,
  });
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: 'bearer',
    expires_in: ACCESS_DAYS * 86400,
    scope: PLUGIN_SCOPE,
  };
}

function pkceS256(verifier) {
  return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

async function handleAuthorize(req, res, store) {
  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: method,
    state,
    response_type: responseType,
  } = req.query;
  if (responseType !== 'code' || !clientId || !redirectUri || !challenge) {
    return res.status(400).send('invalid_request');
  }
  if (method && method !== 'S256') return res.status(400).send('code_challenge_method must be S256');
  const client = await store.getClient(clientId);
  if (!client || !redirectAllowed(client, String(redirectUri))) return res.status(400).send('invalid_client');

  const pending = {
    client_id: String(clientId),
    redirect_uri: String(redirectUri),
    code_challenge: String(challenge),
    state: state ? String(state) : '',
  };

  const websiteUser = websiteAuth.readUser(req);
  if (websiteUser && websiteUser.googleId) {
    return finishAuthorize(req, res, store, pending, websiteUser);
  }
  const packed = packState(pending);
  return res.redirect(googlePluginAuthUrl(req, packed));
}

async function finishAuthorize(req, res, store, pending, googleUser) {
  const person = await store.upsertPerson({
    googleId: googleUser.googleId,
    email: googleUser.email,
    displayName: googleUser.displayName || '',
  });
  const code = randomToken('cd_', 16);
  await store.insertCode({
    code_hash: sha256(code),
    client_id: pending.client_id,
    person_id: person.person_id,
    redirect_uri: pending.redirect_uri,
    code_challenge: pending.code_challenge,
    expires_at: new Date(Date.now() + CODE_MINUTES * 60000).toISOString(),
  });
  const next = new URL(pending.redirect_uri);
  next.searchParams.set('code', code);
  if (pending.state) next.searchParams.set('state', pending.state);
  return res.redirect(next.toString());
}

async function handleGoogleCallback(req, res, store) {
  const packed = String(req.query.state || '');
  const pending = unpackState(packed);
  const code = req.query.code;
  if (!pending || typeof code !== 'string') return res.redirect('/airsup?error=oauth');
  try {
    const googleUser = await exchangeGoogle(req, code, pluginGoogleCallback(req));
    return finishAuthorize(req, res, store, pending, googleUser);
  } catch (error) {
    console.error('Airsup v2 plugin Google OAuth error:', error);
    return res.redirect('/airsup?error=oauth');
  }
}

async function exchangeGoogle(req, code, redirectUri) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.AIRSUP_GOOGLE_CLIENT_ID,
    client_secret: process.env.AIRSUP_GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || 'Google token exchange failed');
  }
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = await userRes.json();
  if (!userRes.ok || !userJson.id || !userJson.email) {
    throw new Error('Google did not return an email address');
  }
  return {
    googleId: String(userJson.id),
    email: String(userJson.email),
    displayName: userJson.name ? String(userJson.name) : '',
  };
}

async function handleToken(req, res, store) {
  res.set('Access-Control-Allow-Origin', '*');
  const body = req.body || {};
  const grant = String(body.grant_type || '');
  if (grant === 'authorization_code') {
    const code = String(body.code || '');
    const verifier = String(body.code_verifier || '');
    const redirectUri = String(body.redirect_uri || '');
    const row = await store.takeCode(sha256(code));
    if (!row) return res.status(400).json({ error: 'invalid_grant' });
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'invalid_grant' });
    if (row.redirect_uri !== redirectUri) return res.status(400).json({ error: 'invalid_grant' });
    if (pkceS256(verifier) !== row.code_challenge) return res.status(400).json({ error: 'invalid_grant' });
    const tokens = await issueTokens(store, row.person_id);
    return res.json(tokens);
  }
  return res.status(400).json({ error: 'unsupported_grant_type' });
}

async function handleRegister(req, res, store) {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const created = await registerClient(store, req.body || {});
    return res.status(201).json(created);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message || 'invalid_client_metadata' });
  }
}

module.exports = {
  authorizationServerMetadata,
  protectedResourceMetadata,
  handleAuthorize,
  handleGoogleCallback,
  handleToken,
  handleRegister,
  pluginGoogleCallback,
  pluginAuthorizeUrl,
  pluginTokenUrl,
  pluginRegisterUrl,
  packState,
  unpackState,
  issueTokens,
};
