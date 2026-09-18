/**
 * In-memory email + 6-digit code login for /airsup/china/test only.
 */
const crypto = require('crypto');

const TTL_MS = 10 * 60 * 1000;
/** @type {Map<string, { code: string, exp: number }>} */
const pending = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function issueCode(email) {
  const key = normalizeEmail(email);
  const code = String(100000 + (crypto.randomBytes(3).readUIntBE(0, 3) % 900000));
  pending.set(key, { code, exp: Date.now() + TTL_MS });
  return code;
}

function verifyCode(email, code) {
  const key = normalizeEmail(email);
  const row = pending.get(key);
  if (!row) return false;
  if (Date.now() > row.exp) {
    pending.delete(key);
    return false;
  }
  const ok = String(code || '').trim() === row.code;
  if (ok) pending.delete(key);
  return ok;
}

function peekCode(email) {
  const row = pending.get(normalizeEmail(email));
  return row && Date.now() <= row.exp ? row.code : null;
}

module.exports = {
  looksLikeEmail,
  normalizeEmail,
  issueCode,
  verifyCode,
  peekCode,
  TTL_MS,
};
