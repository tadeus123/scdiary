const crypto = require('crypto');
const db = require('./db');

const COOKIE = 'airsup_china_sid';
const LANG_COOKIE = 'airsup_china_lang';
const PATH = '/airsup/china';
const SESSION_DAYS = 30;

function cookieBase(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: PATH,
    secure: req.secure || req.get('x-forwarded-proto') === 'https',
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function readLang(req) {
  const query = String((req.query && req.query.lang) || '').toLowerCase();
  if (query === 'en' || query === 'zh') return query;
  const cookie = String((req.cookies && req.cookies[LANG_COOKIE]) || '');
  if (cookie === 'en' || cookie === 'zh') return cookie;
  return 'zh';
}

function setLang(req, res, lang) {
  const value = lang === 'en' ? 'en' : 'zh';
  res.cookie(LANG_COOKIE, value, { ...cookieBase(req), httpOnly: false, maxAge: 365 * 24 * 60 * 60 * 1000 });
  return value;
}

function readSid(req) {
  return String((req.cookies && req.cookies[COOKIE]) || '');
}

async function readCompany(req) {
  const sid = readSid(req);
  if (!sid || !db.isConfigured()) return null;
  const row = await db.getSession(sha256(sid));
  if (!row) return null;
  return db.getById(row.company_id);
}

async function createSession(req, res, companyId) {
  const sid = randomToken();
  await db.insertSession({
    session_hash: sha256(sid),
    company_id: companyId,
    expires_at: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  res.cookie(COOKIE, sid, { ...cookieBase(req), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

async function clearSession(req, res) {
  const sid = readSid(req);
  if (sid && db.isConfigured()) {
    await db.deleteSession(sha256(sid)).catch(() => null);
  }
  res.clearCookie(COOKIE, cookieBase(req));
}

async function createToken(companyId, email, purpose) {
  const token = randomToken();
  await db.insertToken({
    token_hash: sha256(token),
    company_id: companyId,
    email,
    purpose: purpose || 'verify',
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
  return token;
}

module.exports = {
  PATH,
  sha256,
  randomToken,
  readLang,
  setLang,
  readCompany,
  createSession,
  clearSession,
  createToken,
};
