// Create bookshelf tables in Supabase via SQL
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupTables() {
  console.log('🔧 Setting up Bookshelf tables in Supabase...\n');
  console.log('⚠️  NOTE: You need to run the SQL manually in Supabase Dashboard');
  console.log('   The anon key cannot create tables.\n');
  console.log('=' .repeat(60));
  
  const sqlPath = path.join(__dirname, 'create-books-tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  console.log('\n📋 SQL to run in Supabase Dashboard:\n');
  console.log('=' .repeat(60));
  console.log(sql);
  console.log('=' .repeat(60));
  
  console.log('\n📝 INSTRUCTIONS:\n');
  console.log('1. Go to: https://supabase.com/dashboard/project/mvtrinbmwtpniavdcspk');
  console.log('2. Click "SQL Editor" in the left sidebar');
  console.log('3. Click "New query"');
  console.log('4. Copy the SQL above and paste it');
  console.log('5. Click "Run" button');
  console.log('6. You should see "Success. No rows returned"');
  console.log('\nAfter running the SQL, run this script again to verify!\n');
}

setupTables().catch(console.error);
