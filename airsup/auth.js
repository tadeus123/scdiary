const crypto = require('crypto');

const COOKIE_USER = 'airsup_user';
const COOKIE_STATE = 'airsup_oauth_state';
const COOKIE_PATH = '/airsup';
const SESSION_DAYS = 30;

function secret() {
  return process.env.AIRSUP_SESSION_SECRET || process.env.SESSION_SECRET || 'airsup-dev-secret';
}

function isGoogleConfigured() {
  return Boolean(process.env.AIRSUP_GOOGLE_CLIENT_ID && process.env.AIRSUP_GOOGLE_CLIENT_SECRET);
}

function cookieBase(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: COOKIE_PATH,
    secure: req.secure || req.get('x-forwarded-proto') === 'https',
  };
}

function sign(value) {
  const payload = Buffer.from(value, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function unsign(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function getPublicOrigin(req) {
  const fromEnv = process.env.AIRSUP_PUBLIC_ORIGIN;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}`;
}

function callbackUrl(req) {
  return `${getPublicOrigin(req)}/airsup/auth/google/callback`;
}

function redirectUris(req) {
  const origin = getPublicOrigin(req);
  return [
    `${origin}/airsup/auth/google/callback`,
    'http://localhost:3000/airsup/auth/google/callback',
    'https://www.tademehl.com/airsup/auth/google/callback',
    'https://tademehl.com/airsup/auth/google/callback',
  ].filter((uri, i, all) => all.indexOf(uri) === i);
}

function readUser(req) {
  const raw = unsign(req.cookies && req.cookies[COOKIE_USER]);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    if (!user || !user.googleId || !user.email) return null;
    return user;
  } catch {
    return null;
  }
}

function setUser(req, res, user) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE_USER, sign(JSON.stringify({
    googleId: user.googleId,
    email: user.email,
  })), { ...cookieBase(req), maxAge });
}

function clearUser(req, res) {
  res.clearCookie(COOKIE_USER, cookieBase(req));
}

function setOauthState(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(COOKIE_STATE, sign(state), { ...cookieBase(req), maxAge: 10 * 60 * 1000 });
  return state;
}

function takeOauthState(req, res) {
  const expected = unsign(req.cookies && req.cookies[COOKIE_STATE]);
  res.clearCookie(COOKIE_STATE, cookieBase(req));
  return expected;
}

function googleAuthUrl(req, state) {
  const params = new URLSearchParams({
    client_id: process.env.AIRSUP_GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(req, code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.AIRSUP_GOOGLE_CLIENT_ID,
    client_secret: process.env.AIRSUP_GOOGLE_CLIENT_SECRET,
    redirect_uri: callbackUrl(req),
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    const err = new Error(tokenJson.error_description || tokenJson.error || 'Google token exchange failed');
    err.detail = tokenJson;
    throw err;
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
  };
}

function allowedOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === getPublicOrigin(req);
  } catch {
    return false;
  }
}

module.exports = {
  COOKIE_PATH,
  isGoogleConfigured,
  getPublicOrigin,
  callbackUrl,
  redirectUris,
  readUser,
  setUser,
  clearUser,
  setOauthState,
  takeOauthState,
  googleAuthUrl,
  exchangeCode,
  allowedOrigin,
};
