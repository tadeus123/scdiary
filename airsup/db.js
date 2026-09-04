/**
 * Airsup-only Supabase access.
 * Uses airsup_* tables only. Never import server/db/supabase.js.
 * Service role is required so the public anon key cannot read profiles.
 */
const { createClient } = require('@supabase/supabase-js');
const { normalizeAnswers } = require('./questions');
const { publicFieldsFromAnswers, publicDisplayName } = require('./directory');
const { knowledgeDocument } = require('./knowledge');
const { embed, isOpenAiConfigured } = require('./openai');

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
    .select('google_id, email, display_name, answers, updated_at')
    .eq('google_id', googleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    googleId: data.google_id,
    email: data.email,
    displayName: data.display_name || '',
    answers: normalizeAnswers(data.answers),
    updatedAt: data.updated_at || '',
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

async function syncDirectory({ googleId, email, displayName, answers, consent }) {
  const existing = await getEndpointByGoogleId(googleId);
  const fields = publicFieldsFromAnswers(answers);
  const listed = Boolean(consent);
  const row = {
    google_id: googleId,
    display_name: publicDisplayName({ answers, displayName, email }),
    endpoint_email: email,
    help_with: fields.help_with,
    need_help_with: fields.need_help_with,
    desired_person: fields.desired_person,
    match_card: {},
    card_approved: listed,
    active: listed,
    contactable: listed,
    share_help: true,
    share_need: true,
    share_desired_person: true,
  };
  if (existing && existing.endpoint_id) row.endpoint_id = existing.endpoint_id;
  const saved = await upsertEndpoint(row);
  await upsertKnowledge({
    ...saved,
    answers,
  });
  return saved;
}

async function upsertKnowledge(row) {
  if (!supabase || !row || !row.endpoint_id) return null;
  const document = knowledgeDocument(row);
  let embedding = null;
  if (document && isOpenAiConfigured()) {
    try {
      embedding = await embed(document);
    } catch (error) {
      console.error('Airsup embed error:', error.message || error);
    }
  }
  const payload = {
    endpoint_id: row.endpoint_id,
    document,
    embedding,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('airsup_knowledge')
    .upsert(payload, { onConflict: 'endpoint_id' })
    .select('endpoint_id')
    .single();
  if (error) throw error;
  return data;
}

async function listKnowledge() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('airsup_knowledge')
    .select('endpoint_id, document, embedding');
  if (error) throw error;
  return data || [];
}

async function getEndpointById(endpointId) {
  if (!supabase) {
    throw new Error('Airsup storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const id = String(endpointId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('airsup_endpoints')
    .select('*')
    .eq('endpoint_id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
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
    .select('endpoint_id, google_id, display_name, endpoint_email, help_with, need_help_with, desired_person, match_card, card_approved, active, contactable, share_help, share_need, share_desired_person')
    .eq('active', true)
    .eq('contactable', true);
  if (error) throw error;
  return overlayFullNames(data || []);
}

async function overlayFullNames(rows) {
  const ids = [...new Set((rows || []).map((row) => row.google_id).filter(Boolean))];
  if (!ids.length) return rows || [];
  const { data: profiles, error } = await supabase
    .from('airsup_profiles')
    .select('google_id, answers')
    .in('google_id', ids);
  if (error) throw error;
  const byGoogleId = new Map((profiles || []).map((profile) => [profile.google_id, profile]));
  return (rows || []).map((row) => {
    const profile = byGoogleId.get(row.google_id);
    return {
      ...row,
      answers: (profile && profile.answers) || {},
      display_name: publicDisplayName({
        answers: profile && profile.answers,
        displayName: row.display_name,
        email: row.endpoint_email,
      }),
    };
  });
}

module.exports = {
  supabase,
  isConfigured,
  getProfile,
  upsertProfile,
  syncDirectory,
  getEndpointById,
  getEndpointByGoogleId,
  upsertEndpoint,
  listActiveEndpoints,
  upsertKnowledge,
  listKnowledge,
};
