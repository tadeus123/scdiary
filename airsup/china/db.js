const { createClient } = require('@supabase/supabase-js');

const DEFAULT_CHINA_SUPABASE_URL = 'https://wttyutffpgazxgwjzyuw.supabase.co';
const supabaseUrl = String(process.env.AIRSUP_CHINA_SUPABASE_URL || DEFAULT_CHINA_SUPABASE_URL).trim();
const supabaseKey = String(
  process.env.AIRSUP_CHINA_SERVICE_ROLE_KEY
  || process.env.AIRSUP_CHINA_SERVICE_KEY
  || ''
).trim();
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function opsOrigin() {
  return String(
    process.env.AIRSUP_CHINA_OPS_ORIGIN
    || process.env.AIRSUP_CHINA_PUBLIC_ORIGIN
    || 'https://www.airsup.co'
  ).replace(/\/$/, '');
}

function opsSecret() {
  return String(
    process.env.AIRSUP_CHINA_OPS_SECRET
    || process.env.AIRSUP_SESSION_SECRET
    || process.env.SESSION_SECRET
    || ''
  ).trim();
}

function isConfigured() {
  return Boolean(supabase) || Boolean(opsSecret());
}

async function viaOps(method, args) {
  const secret = opsSecret();
  if (!secret) throw new Error('Airsup China storage is not configured.');
  const res = await fetch(`${opsOrigin()}/api/ops/china-db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ method, args }),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.ok === false) {
    throw new Error((json && json.error) || `china_ops_${res.status}`);
  }
  return json.result;
}

function wrap(name, fn) {
  return async (...args) => {
    if (supabase) return fn(...args);
    return viaOps(name, args);
  };
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

async function getByContactEmail(email) {
  const db = requireDb();
  const value = String(email || '').trim().toLowerCase();
  if (!value) return null;
  const { data, error } = await db
    .from('airsup_china_companies')
    .select('*')
    .ilike('contact_email', value)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
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

/** Lean columns for landing proof counts / live roster (avoid pulling full profiles). */
async function listCompaniesProof() {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_companies')
    .select('company_name,company_name_en,domain,website,niche,city,status,verified_at,live_at,created_at')
    .order('created_at', { ascending: false });
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
  const { visibleLiveRows } = require('./public-roster');
  return visibleLiveRows(data || []);
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
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('airsup_china_tokens')
    .update({ used_at: now })
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listTokensForCompany(companyId) {
  const db = requireDb();
  if (!companyId) return [];
  const { data, error } = await db
    .from('airsup_china_tokens')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return data || [];
}

async function listInquiriesForCompany(companyId) {
  const db = requireDb();
  if (!companyId) return [];
  const { data, error } = await db
    .from('airsup_china_inquiries')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return data || [];
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

async function deleteSessionsForCompany(companyId) {
  const db = requireDb();
  const id = String(companyId || '').trim();
  if (!id) return;
  await db.from('airsup_china_sessions').delete().eq('company_id', id);
}

async function insertInquiry(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_inquiries').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function insertThread(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_threads').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function getThread(conversationId) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_threads')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findOpenThread(companyId, callerPersonId) {
  const db = requireDb();
  if (!companyId || !callerPersonId) return null;
  const { data, error } = await db
    .from('airsup_china_threads')
    .select('*')
    .eq('company_id', companyId)
    .eq('caller_person_id', callerPersonId)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

async function listThreadsForCaller(callerPersonId) {
  const db = requireDb();
  if (!callerPersonId) return [];
  const { data, error } = await db
    .from('airsup_china_threads')
    .select('*')
    .eq('caller_person_id', callerPersonId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function updateThread(conversationId, patch) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_threads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function insertMessage(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_messages').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function listMessages(conversationId) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getToken(tokenHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  if (!data || data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

async function getDomainAllow(domain, email) {
  const db = requireDb();
  const domainValue = String(domain || '').trim().toLowerCase();
  const emailValue = String(email || '').trim().toLowerCase();
  if (!domainValue || !emailValue) return null;
  const { data, error } = await db
    .from('airsup_china_domain_allows')
    .select('*')
    .eq('domain', domainValue)
    .eq('contact_email', emailValue)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertDomainAllow({ domain, contact_email, source, note }) {
  const db = requireDb();
  const domainValue = String(domain || '').trim().toLowerCase();
  const emailValue = String(contact_email || '').trim().toLowerCase();
  const sourceValue = ['outreach', 'manual', 'site'].includes(source) ? source : 'outreach';
  if (!domainValue || !emailValue) throw new Error('domain and contact_email required');
  const existing = await getDomainAllow(domainValue, emailValue);
  if (existing) {
    const { data, error } = await db
      .from('airsup_china_domain_allows')
      .update({
        source: sourceValue,
        note: note != null ? String(note) : existing.note,
      })
      .eq('allow_id', existing.allow_id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db
    .from('airsup_china_domain_allows')
    .insert({
      domain: domainValue,
      contact_email: emailValue,
      source: sourceValue,
      note: String(note || ''),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function touchDomainAllow(domain, email, patch) {
  const row = await getDomainAllow(domain, email);
  if (!row) return null;
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_domain_allows')
    .update(patch)
    .eq('allow_id', row.allow_id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listDomainAllows() {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_domain_allows')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function insertFunnelEvent(row) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_funnel_events')
    .insert({
      company_id: row.company_id,
      event: String(row.event || '').slice(0, 80),
      detail: String(row.detail || '').slice(0, 500),
      at: row.at || new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listFunnelEvents(companyId) {
  const db = requireDb();
  if (!companyId) return [];
  const { data, error } = await db
    .from('airsup_china_funnel_events')
    .select('*')
    .eq('company_id', companyId)
    .order('at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function insertSource(row) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_sources')
    .insert({
      company_id: row.company_id,
      source_type: String(row.source_type || 'profile_backfill').slice(0, 40),
      source_reference: String(row.source_reference || '').slice(0, 400),
      visibility: ['buyer', 'ops', 'private'].includes(row.visibility) ? row.visibility : 'ops',
      note: String(row.note || '').slice(0, 500),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listSources(companyId) {
  const db = requireDb();
  if (!companyId) return [];
  const { data, error } = await db
    .from('airsup_china_sources')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw error;
  return data || [];
}

async function insertFact(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_china_facts').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function insertFacts(rows) {
  const db = requireDb();
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return [];
  const { data, error } = await db.from('airsup_china_facts').insert(list).select('fact_id');
  if (error) throw error;
  return data || [];
}

async function expireFact(factId) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_china_facts')
    .update({ valid_until: new Date().toISOString() })
    .eq('fact_id', factId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listFacts(companyId) {
  const db = requireDb();
  if (!companyId) return [];
  const { data, error } = await db
    .from('airsup_china_facts')
    .select('*')
    .eq('company_id', companyId)
    .order('first_seen_at', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data || [];
}

module.exports = {
  isConfigured,
  requireDb,
  getByDomain: wrap('getByDomain', getByDomain),
  getByContactEmail: wrap('getByContactEmail', getByContactEmail),
  getById: wrap('getById', getById),
  listCompanies: wrap('listCompanies', listCompanies),
  listCompaniesProof: wrap('listCompaniesProof', listCompaniesProof),
  listLive: wrap('listLive', listLive),
  insertCompany: wrap('insertCompany', insertCompany),
  updateCompany: wrap('updateCompany', updateCompany),
  insertToken: wrap('insertToken', insertToken),
  takeToken: wrap('takeToken', takeToken),
  getToken: wrap('getToken', getToken),
  listTokensForCompany: wrap('listTokensForCompany', listTokensForCompany),
  listInquiriesForCompany: wrap('listInquiriesForCompany', listInquiriesForCompany),
  insertSession: wrap('insertSession', insertSession),
  getSession: wrap('getSession', getSession),
  deleteSession: wrap('deleteSession', deleteSession),
  deleteSessionsForCompany: wrap('deleteSessionsForCompany', deleteSessionsForCompany),
  insertInquiry: wrap('insertInquiry', insertInquiry),
  insertThread: wrap('insertThread', insertThread),
  getThread: wrap('getThread', getThread),
  findOpenThread: wrap('findOpenThread', findOpenThread),
  listThreadsForCaller: wrap('listThreadsForCaller', listThreadsForCaller),
  updateThread: wrap('updateThread', updateThread),
  insertMessage: wrap('insertMessage', insertMessage),
  listMessages: wrap('listMessages', listMessages),
  getDomainAllow: wrap('getDomainAllow', getDomainAllow),
  upsertDomainAllow: wrap('upsertDomainAllow', upsertDomainAllow),
  touchDomainAllow: wrap('touchDomainAllow', touchDomainAllow),
  listDomainAllows: wrap('listDomainAllows', listDomainAllows),
  insertFunnelEvent: wrap('insertFunnelEvent', insertFunnelEvent),
  listFunnelEvents: wrap('listFunnelEvents', listFunnelEvents),
  insertSource: wrap('insertSource', insertSource),
  listSources: wrap('listSources', listSources),
  insertFact: wrap('insertFact', insertFact),
  insertFacts: wrap('insertFacts', insertFacts),
  expireFact: wrap('expireFact', expireFact),
  listFacts: wrap('listFacts', listFacts),
};
