const crypto = require('crypto');
const {
  googleClientId,
  googleClientSecret,
  sessionSecret,
  publicOriginFromEnv,
  demoUsername,
  demoPassword,
} = require('./config');

const COOKIE_USER = 'airsup20_user';
const COOKIE_STATE = 'airsup20_oauth_state';
const COOKIE_PATH = '/airsup20';
const SESSION_DAYS = 30;

function secret() {
  return sessionSecret();
}

function isGoogleConfigured() {
  return Boolean(googleClientId() && googleClientSecret());
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
  const fromEnv = publicOriginFromEnv();
  if (fromEnv) return fromEnv;
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}`;
}

function callbackUrl(req) {
  return `${getPublicOrigin(req)}/airsup20/auth/google/callback`;
}

function readUser(req) {
  const raw = unsign(req.cookies && req.cookies[COOKIE_USER]);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    if (!user || !user.googleId || !user.email) return null;
    return {
      googleId: user.googleId,
      email: user.email,
      displayName: user.displayName || '',
      picture: user.picture || '',
      locale: user.locale || '',
    };
  } catch {
    return null;
  }
}

function setUser(req, res, user) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE_USER, sign(JSON.stringify({
    googleId: user.googleId,
    email: user.email,
    displayName: user.displayName || '',
    picture: user.picture || '',
    locale: user.locale || '',
  })), { ...cookieBase(req), maxAge });
}

function clearUser(req, res) {
  res.clearCookie(COOKIE_USER, cookieBase(req));
}

function setOauthState(req, res, extra = {}) {
  const nonce = crypto.randomBytes(16).toString('hex');
  res.cookie(COOKIE_STATE, sign(JSON.stringify({
    nonce,
    next: extra.next || '',
  })), { ...cookieBase(req), maxAge: 10 * 60 * 1000 });
  return nonce;
}

function takeOauthState(req, res) {
  const expected = unsign(req.cookies && req.cookies[COOKIE_STATE]);
  res.clearCookie(COOKIE_STATE, cookieBase(req));
  if (!expected) return null;
  try {
    const parsed = JSON.parse(expected);
    if (parsed && parsed.nonce) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function googleAuthUrl(req, state) {
  const params = new URLSearchParams({
    client_id: googleClientId(),
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
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
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
    displayName: userJson.name ? String(userJson.name) : '',
    picture: userJson.picture ? String(userJson.picture) : '',
    locale: userJson.locale ? String(userJson.locale) : '',
    googleProfile: {
      id: userJson.id,
      email: userJson.email,
      verified_email: userJson.verified_email,
      name: userJson.name || '',
      given_name: userJson.given_name || '',
      family_name: userJson.family_name || '',
      picture: userJson.picture || '',
      locale: userJson.locale || '',
    },
  };
}

function safeNext(next) {
  const path = String(next || '');
  if (!path.startsWith('/airsup20')) return '/airsup20/oauth/done';
  if (path.startsWith('//')) return '/airsup20/oauth/done';
  // Keep OAuth return targets inside airsup20; default to done page.
  return path || '/airsup20/oauth/done';
}

function isDemoLoginEnabled() {
  return Boolean(demoPassword());
}

function demoUserProfile() {
  return {
    googleId: 'airsup20-demo-reviewer',
    email: 'airsup-reviewer@demo.tademehl.com',
    displayName: 'Airsup Reviewer',
    picture: '',
    locale: 'en',
    googleProfile: {
      id: 'airsup20-demo-reviewer',
      email: 'airsup-reviewer@demo.tademehl.com',
      name: 'Airsup Reviewer',
      demo: true,
    },
  };
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyDemoCredentials(username, password) {
  if (!isDemoLoginEnabled()) return false;
  const userOk = timingSafeEqualString(String(username || '').trim(), demoUsername());
  const passOk = timingSafeEqualString(String(password || ''), demoPassword());
  return userOk && passOk;
}

module.exports = {
  COOKIE_PATH,
  isGoogleConfigured,
  getPublicOrigin,
  callbackUrl,
  readUser,
  setUser,
  clearUser,
  setOauthState,
  takeOauthState,
  googleAuthUrl,
  exchangeCode,
  safeNext,
  isDemoLoginEnabled,
  demoUserProfile,
  verifyDemoCredentials,
};
