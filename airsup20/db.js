const { createClient } = require('@supabase/supabase-js');
const { sha256, listingTextBlob, nowIso } = require('./util');
const { createMemoryStore } = require('./store-memory');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function isConfigured() {
  return Boolean(supabase);
}

function requireDb() {
  if (!supabase) {
    throw new Error('Airsup20 storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return supabase;
}

async function upsertUser({ googleId, email, displayName, picture, locale, googleProfile }) {
  const db = requireDb();
  const google = String(googleId || '').trim();
  const mail = String(email || '').trim();
  let existing = null;
  if (google) {
    const { data, error } = await db.from('airsup20_users').select('*').eq('google_id', google).maybeSingle();
    if (error) throw error;
    existing = data;
  }
  if (!existing && mail) {
    const { data, error } = await db.from('airsup20_users').select('*').ilike('email', mail).maybeSingle();
    if (error) throw error;
    existing = data;
  }
  const row = {
    google_id: google || (existing && existing.google_id) || null,
    email: mail || (existing && existing.email) || '',
    display_name: displayName || (existing && existing.display_name) || '',
    picture: picture != null ? String(picture) : (existing && existing.picture) || '',
    locale: locale != null ? String(locale) : (existing && existing.locale) || '',
    google_profile: googleProfile || (existing && existing.google_profile) || {},
    updated_at: nowIso(),
  };
  let user;
  if (existing) {
    const { data, error } = await db.from('airsup20_users').update(row).eq('user_id', existing.user_id).select('*').single();
    if (error) throw error;
    user = data;
  } else {
    const { data, error } = await db.from('airsup20_users').insert(row).select('*').single();
    if (error) throw error;
    user = data;
  }
  const listing = await getListing(user.user_id);
  if (!listing) {
    await upsertListing(user.user_id, { body: {}, media: [] });
  }
  return user;
}

async function getUser(userId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_users').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getUserByGoogleId(googleId) {
  const db = requireDb();
  const id = String(googleId || '').trim();
  if (!id) return null;
  const { data, error } = await db.from('airsup20_users').select('*').eq('google_id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function markOnboarded(userId) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup20_users')
    .update({ onboarded_at: nowIso(), updated_at: nowIso() })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listUsers() {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_users').select('*');
  if (error) throw error;
  return data || [];
}

async function getListing(userId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_listings').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertListing(userId, { body, media, merge }) {
  const db = requireDb();
  const prev = await getListing(userId);
  const nextBody = merge && body && typeof body === 'object'
    ? { ...((prev && prev.body) || {}), ...body }
    : (body != null ? body : (prev && prev.body) || {});
  const nextMedia = Array.isArray(media) ? media : ((prev && prev.media) || []);
  const row = {
    user_id: userId,
    body: nextBody && typeof nextBody === 'object' ? nextBody : { note: String(nextBody || '') },
    media: nextMedia,
    text_blob: listingTextBlob(nextBody, nextMedia),
    updated_at: nowIso(),
  };
  const { data, error } = await db.from('airsup20_listings').upsert(row, { onConflict: 'user_id' }).select('*').single();
  if (error) throw error;
  return data;
}

async function listFacts(userId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_facts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function insertFact(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_facts').insert({
    user_id: row.user_id,
    statement: String(row.statement || ''),
    confidence: Number(row.confidence != null ? row.confidence : 0.5),
    source: String(row.source || 'inferred'),
    visibility: String(row.visibility || 'endpoint_visible'),
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function listIntents(userId, { activeOnly } = {}) {
  const db = requireDb();
  let q = db.from('airsup20_intents').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
  if (activeOnly) q = q.in('status', ['active', 'considering', 'committed']);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function insertIntent(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_intents').insert({
    user_id: row.user_id,
    type: String(row.type || 'WANT'),
    object: String(row.object || ''),
    status: String(row.status || 'active'),
    strength: Number(row.strength != null ? row.strength : 0.5),
    confidence: Number(row.confidence != null ? row.confidence : 0.5),
    time_horizon: String(row.time_horizon || ''),
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    visibility: String(row.visibility || 'anonymously_matchable'),
    source: String(row.source || 'inferred'),
    last_evidence_at: row.last_evidence_at || nowIso(),
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function insertIntentEvidence(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_intent_evidence').insert({
    intent_id: row.intent_id,
    conversation_id: row.conversation_id || null,
    message_id: row.message_id || null,
    evidence_text: String(row.evidence_text || ''),
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function insertRawEvent({ userId, kind, payload }) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_raw_events').insert({
    user_id: userId || null,
    kind: String(kind || ''),
    payload: payload && typeof payload === 'object' ? payload : {},
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function searchCandidates({ callerUserId, query, limit }) {
  const db = requireDb();
  const q = String(query || '').trim();
  const max = Math.min(Math.max(Number(limit) || 8, 1), 20);
  if (!q) return [];
  const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1).slice(0, 12);
  const { data: listingRows, error: listingError } = await db
    .from('airsup20_listings')
    .select('user_id, body, text_blob, media, updated_at')
    .neq('user_id', callerUserId)
    .limit(200);
  if (listingError) throw listingError;
  const { data: intentRows, error: intentError } = await db
    .from('airsup20_intents')
    .select('*')
    .neq('user_id', callerUserId)
    .in('status', ['active', 'considering', 'committed'])
    .limit(400);
  if (intentError) throw intentError;
  const userIds = new Set([
    ...(listingRows || []).map((r) => r.user_id),
    ...(intentRows || []).map((r) => r.user_id),
  ]);
  if (!userIds.size) return [];
  const { data: userRows, error: userError } = await db
    .from('airsup20_users')
    .select('*')
    .in('user_id', [...userIds]);
  if (userError) throw userError;
  const usersById = new Map((userRows || []).map((u) => [u.user_id, u]));
  const listingsById = new Map((listingRows || []).map((l) => [l.user_id, l]));
  const intentsByUser = new Map();
  for (const intent of intentRows || []) {
    if (!intentsByUser.has(intent.user_id)) intentsByUser.set(intent.user_id, []);
    intentsByUser.get(intent.user_id).push(intent);
  }
  const scored = [];
  for (const userId of userIds) {
    if (userId === callerUserId) continue;
    const user = usersById.get(userId);
    if (!user) continue;
    const listing = listingsById.get(userId) || null;
    const userIntents = intentsByUser.get(userId) || [];
    const hay = [
      user.display_name,
      listing && listing.text_blob,
      ...userIntents.map((i) => `${i.type} ${i.object}`),
    ].join('\n').toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (hay.includes(token)) score += 1;
    }
    if (score > 0) {
      scored.push({ user, listing, intents: userIntents, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max);
}

async function insertConversation(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_conversations').insert({
    initiator_id: row.initiator_id,
    recipient_id: row.recipient_id,
    goal: String(row.goal || ''),
    summary: String(row.summary || ''),
    status: 'open',
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function getConversation(conversationId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_conversations').select('*').eq('conversation_id', conversationId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function updateConversation(conversationId, patch) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup20_conversations')
    .update({ ...patch, updated_at: nowIso() })
    .eq('conversation_id', conversationId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function insertMessage(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_messages').insert({
    conversation_id: row.conversation_id,
    from_role: String(row.from_role || 'system'),
    from_user_id: row.from_user_id || null,
    body: String(row.body || ''),
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function listMessages(conversationId) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup20_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function insertInboxItem(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_inbox_items').insert({
    user_id: row.user_id,
    from_user_id: row.from_user_id || null,
    conversation_id: row.conversation_id || null,
    reason: String(row.reason || ''),
    summary: String(row.summary || ''),
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    status: String(row.status || 'unread'),
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function listInbox(userId, { status, limit } = {}) {
  const db = requireDb();
  const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
  let q = db.from('airsup20_inbox_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(max);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function updateInboxItem(itemId, userId, patch) {
  const db = requireDb();
  const { data, error } = await db
    .from('airsup20_inbox_items')
    .update(patch)
    .eq('item_id', itemId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertClient(client) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_oauth_clients').insert(client).select('*').single();
  if (error) throw error;
  return data;
}

async function getClient(clientId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_oauth_clients').select('*').eq('client_id', clientId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertCode(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_oauth_codes').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function takeCode(codeHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_oauth_codes').select('*').eq('code_hash', codeHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await db.from('airsup20_oauth_codes').delete().eq('code_hash', codeHash);
  return data;
}

async function insertPluginToken({ tokenHash, refreshHash, userId, expiresAt }) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_plugin_tokens').insert({
    token_hash: tokenHash,
    refresh_hash: refreshHash,
    user_id: userId,
    expires_at: expiresAt,
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function getPluginToken(tokenHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_plugin_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

async function takeRefreshToken(refreshHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_plugin_tokens').select('*').eq('refresh_hash', refreshHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await db.from('airsup20_plugin_tokens').delete().eq('token_hash', data.token_hash);
  return data;
}

async function insertTrace(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_traces').insert({
    trace_id: row.trace_id,
    user_id: row.user_id || null,
    tool_name: String(row.tool_name || ''),
    status: String(row.status || 'running'),
    started_at: row.started_at || nowIso(),
    ended_at: row.ended_at || null,
    duration_ms: row.duration_ms != null ? row.duration_ms : null,
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function updateTrace(traceId, patch) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_traces').update(patch).eq('trace_id', traceId).select('*').single();
  if (error) throw error;
  return data;
}

async function getTrace(traceId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_traces').select('*').eq('trace_id', traceId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listTraces(userId, { limit } = {}) {
  const db = requireDb();
  const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
  let q = db.from('airsup20_traces').select('*').order('started_at', { ascending: false }).limit(max);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function insertSpan(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_spans').insert({
    span_id: row.span_id,
    trace_id: row.trace_id,
    parent_span_id: row.parent_span_id || null,
    name: String(row.name || ''),
    started_at: row.started_at || nowIso(),
    ended_at: row.ended_at || null,
    duration_ms: row.duration_ms != null ? row.duration_ms : null,
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
    error: row.error || null,
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function updateSpan(spanId, patch) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_spans').update(patch).eq('span_id', spanId).select('*').single();
  if (error) throw error;
  return data;
}

async function listSpans(traceId) {
  const db = requireDb();
  const { data, error } = await db.from('airsup20_spans').select('*').eq('trace_id', traceId).order('started_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

const supabaseStore = {
  isConfigured,
  upsertUser,
  getUser,
  getUserByGoogleId,
  markOnboarded,
  listUsers,
  getListing,
  upsertListing,
  listFacts,
  insertFact,
  listIntents,
  insertIntent,
  insertIntentEvidence,
  insertRawEvent,
  searchCandidates,
  insertConversation,
  getConversation,
  updateConversation,
  insertMessage,
  listMessages,
  insertInboxItem,
  listInbox,
  updateInboxItem,
  insertClient,
  getClient,
  insertCode,
  takeCode,
  insertPluginToken,
  getPluginToken,
  takeRefreshToken,
  insertTrace,
  updateTrace,
  getTrace,
  listTraces,
  insertSpan,
  updateSpan,
  listSpans,
  sha256,
};

function getStore() {
  if (isConfigured()) return supabaseStore;
  if (!getStore._memory) getStore._memory = createMemoryStore();
  return getStore._memory;
}

module.exports = {
  ...supabaseStore,
  getStore,
  createMemoryStore,
  sha256,
};
