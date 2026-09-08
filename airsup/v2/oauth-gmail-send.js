const { GMAIL_SENDER, GMAIL_SEND_SCOPE } = require('./config');
const { publicOrigin } = require('./mcp');
const websiteAuth = require('../auth');
const db = require('./db');

function mailCallback(req) {
  return `${publicOrigin(req)}/airsup/v2/mail/google/callback`;
}

function mailAuthUrl(req, state) {
  const params = new URLSearchParams({
    client_id: process.env.AIRSUP_GOOGLE_CLIENT_ID,
    redirect_uri: mailCallback(req),
    response_type: 'code',
    scope: GMAIL_SEND_SCOPE,
    state,
    prompt: 'consent',
    access_type: 'offline',
    include_granted_scopes: 'false',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function startConnect(req, res) {
  const user = websiteAuth.readUser(req);
  if (!user) return res.redirect('/airsup');
  if (String(user.email || '').toLowerCase() !== GMAIL_SENDER) {
    return res.status(403).send('Wake mail can only be connected as tademehl@gmail.com.');
  }
  const state = websiteAuth.setOauthState(req, res);
  return res.redirect(mailAuthUrl(req, state));
}

async function handleCallback(req, res, store) {
  const user = websiteAuth.readUser(req);
  if (!user || String(user.email || '').toLowerCase() !== GMAIL_SENDER) {
    return res.redirect('/airsup?error=oauth');
  }
  const expected = websiteAuth.takeOauthState(req, res);
  const { code, state } = req.query;
  if (!expected || !state || state !== expected || typeof code !== 'string') {
    return res.redirect('/airsup/v2/prompt?error=mail');
  }
  const body = new URLSearchParams({
    code,
    client_id: process.env.AIRSUP_GOOGLE_CLIENT_ID,
    client_secret: process.env.AIRSUP_GOOGLE_CLIENT_SECRET,
    redirect_uri: mailCallback(req),
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.refresh_token) {
    console.error('Airsup v2 gmail.send token error:', tokenJson);
    return res.redirect('/airsup/v2/prompt?error=mail');
  }
  await store.setGmailSend({
    googleId: user.googleId,
    email: GMAIL_SENDER,
    refreshToken: tokenJson.refresh_token,
  });
  return res.redirect('/airsup/v2/prompt?mail=connected');
}

function mailRedirectUris(req) {
  const origin = publicOrigin(req);
  return [
    `${origin}/airsup/v2/mail/google/callback`,
    'http://localhost:3000/airsup/v2/mail/google/callback',
    'https://www.tademehl.com/airsup/v2/mail/google/callback',
    'https://tademehl.com/airsup/v2/mail/google/callback',
  ].filter((uri, i, all) => all.indexOf(uri) === i);
}

function pluginRedirectUris(req) {
  const origin = publicOrigin(req);
  return [
    `${origin}/airsup/v2/oauth/google/callback`,
    'http://localhost:3000/airsup/v2/oauth/google/callback',
    'https://www.tademehl.com/airsup/v2/oauth/google/callback',
    'https://tademehl.com/airsup/v2/oauth/google/callback',
  ].filter((uri, i, all) => all.indexOf(uri) === i);
}

module.exports = {
  startConnect,
  handleCallback,
  mailCallback,
  mailRedirectUris,
  pluginRedirectUris,
  GMAIL_SEND_SCOPE,
};
