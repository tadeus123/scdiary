/**
 * Test-only company/token/session store when Supabase is not configured.
 * Same subset of methods onboard.js needs. Live china never imports this.
 */
const crypto = require('crypto');

const companies = new Map();
const tokens = new Map();
const sessions = new Map();
const allows = new Map();

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function clone(row) {
  return row ? JSON.parse(JSON.stringify(row)) : null;
}

async function getByDomain(domain) {
  const value = String(domain || '').trim().toLowerCase();
  if (!value) return null;
  for (const row of companies.values()) {
    if (String(row.domain || '').toLowerCase() === value) return clone(row);
  }
  return null;
}

async function getById(companyId) {
  return clone(companies.get(companyId) || null);
}

async function insertCompany(row) {
  const companyId = row.company_id || id('cn');
  const now = new Date().toISOString();
  const next = {
    ...row,
    company_id: companyId,
    created_at: now,
    updated_at: now,
  };
  companies.set(companyId, next);
  return clone(next);
}

async function updateCompany(companyId, patch) {
  const prev = companies.get(companyId);
  if (!prev) throw new Error('company_not_found');
  const next = {
    ...prev,
    ...patch,
    company_id: companyId,
    updated_at: new Date().toISOString(),
  };
  companies.set(companyId, next);
  return clone(next);
}

async function insertToken(row) {
  const tokenId = row.token_id || id('tok');
  const next = { ...row, token_id: tokenId };
  tokens.set(row.token_hash, next);
  return clone(next);
}

async function getToken(tokenHash) {
  const row = tokens.get(tokenHash);
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return clone(row);
}

async function takeToken(tokenHash) {
  const row = tokens.get(tokenHash);
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  row.used_at = new Date().toISOString();
  tokens.set(tokenHash, row);
  return clone(row);
}

async function insertSession(row) {
  const sessionId = row.session_id || id('sess');
  const next = { ...row, session_id: sessionId };
  sessions.set(row.session_hash || sessionId, next);
  return clone(next);
}

async function getSession(sessionHash) {
  const row = sessions.get(sessionHash);
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return clone(row);
}

async function deleteSession(sessionHash) {
  sessions.delete(sessionHash);
  return true;
}

async function deleteSessionsForCompany(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return;
  for (const [hash, row] of sessions.entries()) {
    if (String(row.company_id || '') === id) sessions.delete(hash);
  }
}

async function getDomainAllow(domain, email) {
  const key = `${String(domain || '').toLowerCase()}::${String(email || '').toLowerCase()}`;
  return clone(allows.get(key) || null);
}

async function upsertDomainAllow({ domain, contact_email, source, note }) {
  const key = `${String(domain || '').toLowerCase()}::${String(contact_email || '').toLowerCase()}`;
  const next = {
    allow_id: id('allow'),
    domain: String(domain || '').toLowerCase(),
    contact_email: String(contact_email || '').toLowerCase(),
    source: source || 'manual',
    note: note || '',
  };
  allows.set(key, next);
  return clone(next);
}

async function touchDomainAllow(domain, email, patch) {
  const key = `${String(domain || '').toLowerCase()}::${String(email || '').toLowerCase()}`;
  const prev = allows.get(key);
  if (!prev) return null;
  const next = { ...prev, ...patch };
  allows.set(key, next);
  return clone(next);
}

function isConfigured() {
  return true;
}

function resetAll() {
  companies.clear();
  tokens.clear();
  sessions.clear();
  allows.clear();
}

module.exports = {
  isConfigured,
  getByDomain,
  getById,
  insertCompany,
  updateCompany,
  insertToken,
  getToken,
  takeToken,
  insertSession,
  getSession,
  deleteSession,
  deleteSessionsForCompany,
  getDomainAllow,
  upsertDomainAllow,
  touchDomainAllow,
  resetAll,
  _maps: { companies, tokens, sessions, allows },
};
