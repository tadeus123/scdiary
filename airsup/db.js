/**
 * Airsup-only Supabase access.
 * Use airsup_* tables only. Never import server/db/supabase.js.
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

function isConfigured() {
  return Boolean(supabase);
}

module.exports = {
  supabase,
  isConfigured,
};
