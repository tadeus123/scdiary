/**
 * Setup script for Supabase
 * Creates the table and migrates existing entries
 * 
 * Usage: node server/scripts/setup-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function showCreateTableSQL() {
  console.log('📋 SQL to create the table:\n');
  
  const createTableSQL = `CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp DESC);

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON entries;
CREATE POLICY "Allow public read access" ON entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON entries;
CREATE POLICY "Allow all operations" ON entries
  FOR ALL USING (true);`;

  console.log(createTableSQL);
  console.log('\n📝 Please copy the SQL above and run it in Supabase SQL Editor');
  console.log('   Go to: https://supabase.com/dashboard/project/mvtrinbmwtpniavdcspk/sql\n');
  
  return false;
}

async function migrateEntries() {
  console.log('\n🔄 Migrating entries...');
  
  const entriesPath = path.join(__dirname, '../../data/entries.json');
  let entries = [];
  
  try {
    const data = fs.readFileSync(entriesPath, 'utf8');
    entries = JSON.parse(data);
    console.log(`📖 Found ${entries.length} entries to migrate`);
  } catch (error) {
    console.log('⚠️  No entries.json found or empty - skipping migration');
    return;
  }

  if (entries.length === 0) {
    console.log('✅ No entries to migrate');
    return;
  }

  // Check existing entries
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

  const { data, error } = await supabase
    .from('entries')
    .insert(entriesToMigrate)
    .select();

  if (error) {
    console.error('❌ Error migrating entries:', error);
    console.log('\n⚠️  Make sure the table exists first!');
    return;
  }

  console.log(`✅ Successfully migrated ${data.length} entries!`);
}

async function testConnection() {
  console.log('🔌 Testing Supabase connection...');
  
  try {
    const { data, error } = await supabase.from('entries').select('count').limit(1);
    
    if (error && error.code === '42P01') {
      console.log('⚠️  Table does not exist yet. Will create it...');
      return false;
    }
    
    if (error) {
      console.error('❌ Connection error:', error.message);
      return false;
    }
    
    console.log('✅ Connection successful!');
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    return false;
  }
}

async function setup() {
  console.log('🚀 Setting up Supabase for digital diary...\n');
  
  const connected = await testConnection();
  
  if (!connected) {
    showCreateTableSQL();
    console.log('⏳ Waiting for you to create the table...');
    console.log('   After creating the table, press Enter to continue migration.');
    return;
  }
  
  await migrateEntries();
  
  console.log('\n🎉 Setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Add SUPABASE_URL and SUPABASE_ANON_KEY to Vercel environment variables');
  console.log('2. Redeploy your Vercel project');
  console.log('3. Test creating a new entry on your live site');
}

setup().catch(console.error);

