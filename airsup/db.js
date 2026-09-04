/**
 * Airsup-only Supabase access.
 * Uses airsup_* tables only. Never import server/db/supabase.js.
 * Service role is required so the public anon key cannot read profiles.
 */
const { createClient } = require('@supabase/supabase-js');
const { normalizeAnswers } = require('./questions');
const { publicFieldsFromAnswers, displayNameFrom } = require('./directory');
const { normalizeCard } = require('./card');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

function isConfigured() {
  return Boolean(supabase);
}

async function getProfile(googleId) {
  if (!supabase) {
    throw new Error('Airsup storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const { data, error } = await supabase
    .from('airsup_profiles')
    .select('google_id, email, display_name, answers')
    .eq('google_id', googleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    googleId: data.google_id,
    email: data.email,
    displayName: data.display_name || '',
    answers: normalizeAnswers(data.answers),
  };
}

async function upsertProfile({ googleId, email, displayName, answers }) {
  if (!supabase) {
    throw new Error('Airsup storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const row = {
    google_id: googleId,
    email,
    display_name: displayName || '',
    answers: normalizeAnswers(answers),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('airsup_profiles')
    .upsert(row, { onConflict: 'google_id' })
    .select('google_id, email, display_name, answers')
    .single();
  if (error) throw error;
  return {
    googleId: data.google_id,
    email: data.email,
    displayName: data.display_name || '',
    answers: normalizeAnswers(data.answers),
  };
}

async function syncDirectory({ googleId, email, displayName, answers, consent, matchCard }) {
  const existing = await getEndpointByGoogleId(googleId);
  const fields = publicFieldsFromAnswers(answers);
  const card = normalizeCard(matchCard);
  const listed = Boolean(consent);
  const approved = listed && Boolean(
    card.can_help_with.length ||
    card.wants_help_with.length ||
    card.people_they_want_to_meet.length ||
    card.short_context
  );
  const row = {
    google_id: googleId,
    display_name: displayNameFrom({ displayName, email }),
    endpoint_email: email,
    help_with: fields.help_with,
    need_help_with: fields.need_help_with,
    desired_person: fields.desired_person,
    match_card: card,
    card_approved: approved,
    active: listed,
    contactable: listed,
    share_help: true,
    share_need: true,
    share_desired_person: true,
  };
  if (existing && existing.endpoint_id) row.endpoint_id = existing.endpoint_id;
  return upsertEndpoint(row);
}

async function getEndpointByGoogleId(googleId) {
  if (!supabase) {
    throw new Error('Airsup storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const { data, error } = await supabase
    .from('airsup_endpoints')
    .select('*')
    .eq('google_id', googleId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertEndpoint(row) {
  if (!supabase) {
    throw new Error('Airsup storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const payload = {
    ...row,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('airsup_endpoints')
    .upsert(payload, { onConflict: 'google_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listActiveEndpoints() {
  if (!supabase) {
    throw new Error('Airsup storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const { data, error } = await supabase
    .from('airsup_endpoints')
    .select('endpoint_id, display_name, endpoint_email, help_with, need_help_with, desired_person, match_card, card_approved, active, contactable, share_help, share_need, share_desired_person')
    .eq('active', true)
    .eq('contactable', true)
    .eq('card_approved', true);
  if (error) throw error;
  return data || [];
}

module.exports = {
  supabase,
  isConfigured,
  getProfile,
  upsertProfile,
  syncDirectory,
  getEndpointByGoogleId,
  upsertEndpoint,
  listActiveEndpoints,
};
