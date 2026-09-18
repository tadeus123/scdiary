/**
 * Games-only storage. Do not import server/db/supabase.js from here.
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const empty = () => ({ score: 0, wpm: 0, mistakes: 0, created_at: null });

let memory = empty();

function isConfigured() {
  return Boolean(supabase);
}

function fromRow(row) {
  if (!row) return empty();
  return {
    score: Number(row.score) || 0,
    wpm: Number(row.wpm) || 0,
    mistakes: Number(row.mistakes) || 0,
    created_at: row.created_at || row.updated_at || null,
  };
}

async function getHighscore() {
  if (!supabase) return { ...memory };
  try {
    const { data, error } = await supabase.from('games_highscore').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (!data) return empty();
    return fromRow(data);
  } catch (err) {
    console.error('Games highscore read failed:', err.message || err);
    return { ...memory };
  }
}

async function submitScore({ score, wpm, mistakes }) {
  const next = {
    score: Number(score) || 0,
    wpm: Number(wpm) || 0,
    mistakes: Number(mistakes) || 0,
  };
  const current = await getHighscore();
  if (next.score <= current.score) {
    return { updated: false, highscore: current };
  }

  const now = new Date().toISOString();
  const row = {
    id: 1,
    score: next.score,
    wpm: next.wpm,
    mistakes: next.mistakes,
    created_at: now,
    updated_at: now,
  };

  if (!supabase) {
    memory = fromRow(row);
    return { updated: true, highscore: { ...memory } };
  }

  try {
    const { data, error } = await supabase
      .from('games_highscore')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    return { updated: true, highscore: fromRow(data) };
  } catch (err) {
    console.error('Games highscore write failed:', err.message || err);
    memory = fromRow(row);
    return { updated: true, highscore: { ...memory } };
  }
}

module.exports = {
  isConfigured,
  getHighscore,
  submitScore,
};
