const { createClient } = require('@supabase/supabase-js');

let client = null;

function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return client;
}

async function listSupremeNotes() {
  const db = getClient();
  if (!db) return { success: false, error: 'not configured', notes: [] };
  const { data, error } = await db
    .from('supreme_notes')
    .select('id, author, body, created_at')
    .order('created_at', { ascending: false });
  if (error) return { success: false, error: error.message, notes: [] };
  return { success: true, notes: data || [] };
}

async function addSupremeNote(body) {
  const db = getClient();
  if (!db) return { success: false, error: 'not configured' };
  const { data, error } = await db
    .from('supreme_notes')
    .insert([{ body }])
    .select('id, author, body, created_at')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, note: data };
}

module.exports = { listSupremeNotes, addSupremeNote };
