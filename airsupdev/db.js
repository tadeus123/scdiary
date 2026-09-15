const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function isConfigured() {
  return Boolean(supabase);
}

function requireDb() {
  if (!supabase) throw new Error('Airsupdev storage is not configured.');
  return supabase;
}

async function upsertUser({ googleId, email, displayName, picture, locale, googleProfile }) {
  const db = requireDb();
  const now = new Date().toISOString();
  const { data: existing, error: findError } = await db
    .from('airsupdev_users')
    .select('*')
    .eq('google_id', String(googleId))
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    const { data, error } = await db
      .from('airsupdev_users')
      .update({
        email: String(email || '').toLowerCase(),
        display_name: String(displayName || ''),
        picture: String(picture || ''),
        locale: String(locale || ''),
        google_profile: googleProfile && typeof googleProfile === 'object' ? googleProfile : {},
        updated_at: now,
      })
      .eq('user_id', existing.user_id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db
    .from('airsupdev_users')
    .insert({
      google_id: String(googleId),
      email: String(email || '').toLowerCase(),
      display_name: String(displayName || ''),
      picture: String(picture || ''),
      locale: String(locale || ''),
      google_profile: googleProfile && typeof googleProfile === 'object' ? googleProfile : {},
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function getUser(userId) {
  const db = requireDb();
  const { data, error } = await db.from('airsupdev_users').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertClient(client) {
  const db = requireDb();
  const { data, error } = await db.from('airsupdev_oauth_clients').insert(client).select('*').single();
  if (error) throw error;
  return data;
}

async function getClient(clientId) {
  const db = requireDb();
  const { data, error } = await db.from('airsupdev_oauth_clients').select('*').eq('client_id', clientId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertCode(row) {
  const db = requireDb();
  const { data, error } = await db.from('airsupdev_oauth_codes').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function takeCode(codeHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsupdev_oauth_codes').select('*').eq('code_hash', codeHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await db.from('airsupdev_oauth_codes').delete().eq('code_hash', codeHash);
  return data;
}

async function insertPluginToken({ tokenHash, refreshHash, userId, expiresAt }) {
  const db = requireDb();
  const { data, error } = await db.from('airsupdev_plugin_tokens').insert({
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
  const { data, error } = await db.from('airsupdev_plugin_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

async function takeRefreshToken(refreshHash) {
  const db = requireDb();
  const { data, error } = await db.from('airsupdev_plugin_tokens').select('*').eq('refresh_hash', refreshHash).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await db.from('airsupdev_plugin_tokens').delete().eq('token_hash', data.token_hash);
  return data;
}

function getStore() {
  return {
    isConfigured,
    upsertUser,
    getUser,
    insertClient,
    getClient,
    insertCode,
    takeCode,
    insertPluginToken,
    getPluginToken,
    takeRefreshToken,
  };
}

module.exports = {
  isConfigured,
  getStore,
  upsertUser,
  getUser,
  insertClient,
  getClient,
  insertCode,
  takeCode,
  insertPluginToken,
  getPluginToken,
  takeRefreshToken,
};
