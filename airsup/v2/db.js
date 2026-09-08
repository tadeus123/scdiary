const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { sha256 } = require('./store-memory');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function isConfigured() {
  return Boolean(supabase);
}

function requireDb() {
  if (!supabase) {
    throw new Error('Airsup v2 storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return supabase;
}

function secretKey() {
  const raw = process.env.AIRSUP_SESSION_SECRET || process.env.SESSION_SECRET || 'airsup-dev-secret';
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decryptSecret(packed) {
  const [ivB, tagB, dataB] = String(packed || '').split('.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    secretKey(),
    Buffer.from(ivB, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]).toString('utf8');
}

async function upsertPerson({ googleId, email, displayName, listing }) {
  const db = requireDb();
  const google = String(googleId || '').trim();
  const mail = String(email || '').trim();
  let existing = null;
  if (google) {
    const { data, error } = await db.from('airsup_v2_people').select('*').eq('google_id', google).maybeSingle();
    if (error) throw error;
    existing = data;
  }
  if (!existing && mail) {
    const { data, error } = await db.from('airsup_v2_people').select('*').ilike('email', mail).maybeSingle();
    if (error) throw error;
    existing = data;
  }
  const row = {
    google_id: google || (existing && existing.google_id) || null,
    email: mail || (existing && existing.email) || '',
    display_name: displayName || (existing && existing.display_name) || '',
    listing: listing || (existing && existing.listing) || {},
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { data, error } = await db
      .from('airsup_v2_people')
      .update(row)
      .eq('person_id', existing.person_id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from('airsup_v2_people').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function getPerson(personId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_v2_people').select('*').eq('person_id', personId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listPeople() {
  const db = requireDb();
  const { data, error } = await db.from('airsup_v2_people').select('*');
  if (error) throw error;
  return data || [];
}

async function insertClient(client) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_v2_oauth_clients').insert(client).select('*').single();
  if (error) throw error;
  return data;
}

async function getClient(clientId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_v2_oauth_clients').select('*').eq('client_id', clientId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertCode(row) {
  const db = requireDb();
  const { error } = await db.from('airsup_v2_oauth_codes').insert(row);
  if (error) throw error;
}

async function takeCode(codeHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_v2_oauth_codes').select('*').eq('code_hash', codeHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await db.from('airsup_v2_oauth_codes').delete().eq('code_hash', codeHash);
  return data;
}

async function insertPluginToken({ tokenHash, refreshHash, personId, expiresAt }) {
  const db = requireDb();
  const { error } = await db.from('airsup_v2_plugin_tokens').insert({
    token_hash: tokenHash,
    refresh_hash: refreshHash,
    person_id: personId,
    expires_at: expiresAt,
  });
  if (error) throw error;
}

async function getPluginToken(tokenHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_v2_plugin_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

async function getGmailSend() {
  const db = requireDb();
  const { data, error } = await db.from('airsup_v2_gmail_send').select('*').eq('id', 'tademehl').maybeSingle();
  if (error) throw error;
  return data || null;
}

async function setGmailSend({ googleId, email, refreshToken }) {
  const db = requireDb();
  const row = {
    id: 'tademehl',
    google_id: googleId,
    email,
    refresh_token_enc: encryptSecret(refreshToken),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('airsup_v2_gmail_send').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return data;
}

async function insertConversation(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup_v2_conversations').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function getConversation(conversationId) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_v2_conversations')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function updateConversation(conversationId, patch, where = {}) {
  const db = requireDb();
  let query = db.from('airsup_v2_conversations').update({ ...patch, updated_at: new Date().toISOString() }).eq('conversation_id', conversationId);
  for (const [key, value] of Object.entries(where)) {
    if (value === null) query = query.is(key, null);
    else query = query.eq(key, value);
  }
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertMessage({ conversationId, fromPersonId, body }) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup_v2_messages')
    .insert({
      conversation_id: conversationId,
      from_person_id: fromPersonId,
      body,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  isConfigured,
  sha256,
  encryptSecret,
  decryptSecret,
  upsertPerson,
  getPerson,
  listPeople,
  insertClient,
  getClient,
  insertCode,
  takeCode,
  insertPluginToken,
  getPluginToken,
  getGmailSend,
  setGmailSend,
  insertConversation,
  getConversation,
  updateConversation,
  insertMessage,
};
