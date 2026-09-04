/**
 * Airsup-only Supabase access.
 * Uses airsup_* tables only. Never import server/db/supabase.js.
 * Service role is required so the public anon key cannot read profiles.
 */
const { createClient } = require('@supabase/supabase-js');
const { normalizeAnswers } = require('./questions');

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
    .select('google_id, email, answers')
    .eq('google_id', googleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    googleId: data.google_id,
    email: data.email,
    answers: normalizeAnswers(data.answers),
  };
}

async function upsertProfile({ googleId, email, answers }) {
  if (!supabase) {
    throw new Error('Airsup storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const row = {
    google_id: googleId,
    email,
    answers: normalizeAnswers(answers),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('airsup_profiles')
    .upsert(row, { onConflict: 'google_id' })
    .select('google_id, email, answers')
    .single();
  if (error) throw error;
  return {
    googleId: data.google_id,
    email: data.email,
    answers: normalizeAnswers(data.answers),
  };
}

module.exports = {
  supabase,
  isConfigured,
  getProfile,
  upsertProfile,
};
