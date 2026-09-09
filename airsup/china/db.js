const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function isConfigured() {
  return Boolean(supabase);
}

function requireDb() {
  if (!supabase) {
    throw new Error('Airsup China storage is not configured.');
  }
  return supabase;
}

async function getByDomain(domain) {
  const db = requireDb();
  const value = String(domain || '').trim().toLowerCase();
  if (!value) return null;
  const { data, error } = await db.from('airsup_china_companies').select('*').ilike('domain', value).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getById(companyId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_companies').select('*').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listCompanies() {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_companies').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listLive() {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_companies')
    .select('*')
    .eq('status', 'live')
    .order('live_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function insertCompany(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_companies').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function updateCompany(companyId, patch) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_companies')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function insertToken(row) {
  const db = requireDb();
  const { error } = await db.from('airsup_china_tokens').insert(row);
  if (error) throw error;
}

async function takeToken(tokenHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  if (!data || data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  const { error: usedError } = await db
    .from('airsup_china_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('used_at', null);
  if (usedError) throw usedError;
  return data;
}

async function insertSession(row) {
  const db = requireDb();
  const { error } = await db.from('airsup_china_sessions').insert(row);
  if (error) throw error;
}

async function getSession(sessionHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_sessions').select('*').eq('session_hash', sessionHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

async function deleteSession(sessionHash) {
  const db = requireDb();
  await db.from('airsup_china_sessions').delete().eq('session_hash', sessionHash);
}

async function insertInquiry(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_inquiries').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

module.exports = {
  isConfigured,
  getByDomain,
  getById,
  listCompanies,
  listLive,
  insertCompany,
  updateCompany,
  insertToken,
  takeToken,
  insertSession,
  getSession,
  deleteSession,
  insertInquiry,
};
