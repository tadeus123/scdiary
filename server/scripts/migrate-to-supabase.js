/**
 * Migration script to move entries from JSON file to Supabase
 * Run this once after setting up Supabase to migrate existing entries
 * 
 * Usage: node server/scripts/migrate-to-supabase.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const entriesPath = path.join(__dirname, '../data/entries.json');

async function migrate() {
  console.log('🔄 Starting migration...');
  
  // Read existing entries
  let entries = [];
  try {
    const data = fs.readFileSync(entriesPath, 'utf8');
    entries = JSON.parse(data);
    console.log(`📖 Found ${entries.length} entries to migrate`);
  } catch (error) {
    console.error('❌ Error reading entries.json:', error);
    process.exit(1);
  }

  if (entries.length === 0) {
    console.log('✅ No entries to migrate');
    return;
  }

  // Check if entries already exist in Supabase
  const { data: existingEntries } = await supabase
    .from('entries')
    .select('id');

  const existingIds = new Set(existingEntries?.map(e => e.id) || []);
  const entriesToMigrate = entries.filter(e => !existingIds.has(e.id));

  if (entriesToMigrate.length === 0) {
    console.log('✅ All entries already migrated');
    return;
  }

  console.log(`📝 Migrating ${entriesToMigrate.length} new entries...`);

  // Insert entries into Supabase
  const { data, error } = await supabase
    .from('entries')
    .insert(entriesToMigrate)
    .select();

  if (error) {
    console.error('❌ Error migrating entries:', error);
    process.exit(1);
  }

  console.log(`✅ Successfully migrated ${data.length} entries!`);
  console.log('🎉 Migration complete!');
}

migrate().catch(console.error);

