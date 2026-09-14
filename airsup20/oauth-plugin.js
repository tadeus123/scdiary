const crypto = require('crypto');
const { MCP_URL, PLUGIN_SCOPE, sessionSecret } = require('./config');
const { sha256, randomToken } = require('./util');
const auth = require('./auth');

const ACCESS_DAYS = 30;
const CODE_MINUTES = 10;

function publicOrigin(req) {
  return auth.getPublicOrigin(req);
}

function pluginAuthorizeUrl(req) {
  return `${publicOrigin(req)}/airsup20/oauth/authorize`;
}

function authorizationServerMetadata(req) {
  const issuer = `${publicOrigin(req)}/airsup20/oauth`;
  return {
    issuer,
    authorization_endpoint: pluginAuthorizeUrl(req),
    token_endpoint: `${publicOrigin(req)}/airsup20/oauth/token`,
    registration_endpoint: `${publicOrigin(req)}/airsup20/oauth/register`,
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
    authorization_servers: [`${publicOrigin(req)}/airsup20/oauth`],
    bearer_methods_supported: ['header'],
    scopes_supported: [PLUGIN_SCOPE],
  };
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

async function issueTokens(store, userId) {
  const access = randomToken('as_', 24);
  const refresh = randomToken('rf_', 24);
  const expiresAt = new Date(Date.now() + ACCESS_DAYS * 86400000).toISOString();
  await store.insertPluginToken({
    tokenHash: sha256(access),
    refreshHash: sha256(refresh),
    userId,
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

async function finishAuthorize(req, res, store, pending, googleUser) {
  const user = await store.upsertUser({
    googleId: googleUser.googleId,
    email: googleUser.email,
    displayName: googleUser.displayName || '',
    picture: googleUser.picture || '',
    locale: googleUser.locale || '',
    googleProfile: googleUser.googleProfile || {},
  });
  const code = randomToken('cd_', 16);
  await store.insertCode({
    code_hash: sha256(code),
    client_id: pending.client_id,
    user_id: user.user_id,
    redirect_uri: pending.redirect_uri,
    code_challenge: pending.code_challenge,
    expires_at: new Date(Date.now() + CODE_MINUTES * 60000).toISOString(),
  });
  const next = new URL(pending.redirect_uri);
  next.searchParams.set('code', code);
  if (pending.state) next.searchParams.set('state', pending.state);
  return res.redirect(next.toString());
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

  const websiteUser = auth.readUser(req);
  // Already signed in (Google or demo reviewer) — finish without another Google hop.
  if (websiteUser && websiteUser.googleId) {
    return finishAuthorize(req, res, store, pending, websiteUser);
  }

  const params = new URLSearchParams();
  Object.keys(req.query || {}).forEach((key) => {
    const value = req.query[key];
    if (value == null) return;
    params.set(key, String(value));
  });
  const next = `/airsup20/oauth/authorize?${params.toString()}`;
  // Connect page supports Google and password demo login for OpenAI reviewers.
  return res.redirect(`/airsup20/connect?next=${encodeURIComponent(next)}`);
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
    const tokens = await issueTokens(store, row.user_id);
    return res.json(tokens);
  }
  if (grant === 'refresh_token') {
    const refresh = String(body.refresh_token || '');
    if (!refresh) return res.status(400).json({ error: 'invalid_grant' });
    const row = await store.takeRefreshToken(sha256(refresh));
    if (!row) return res.status(400).json({ error: 'invalid_grant' });
    const tokens = await issueTokens(store, row.user_id);
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
  handleToken,
  handleRegister,
  issueTokens,
  sessionSecret,
};
