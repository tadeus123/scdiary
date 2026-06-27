// Verify cause_graph table exists in Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function verify() {
  const { data, error } = await supabase.from('cause_graph').select('id, updated_at').eq('id', 'main').maybeSingle();

  if (error) {
    console.error('cause_graph table not ready:', error.message);
    console.log('\nRun this SQL in Supabase Dashboard → SQL Editor:\n');
    const sqlPath = path.join(__dirname, 'create-cause-graph-table.sql');
    console.log(fs.readFileSync(sqlPath, 'utf8'));
    process.exit(1);
  }

  console.log('cause_graph table OK');
  console.log('Row id:', data?.id ?? '(none)');
  console.log('Updated at:', data?.updated_at ?? '(none)');
}

verify().catch((error) => {
  console.error(error);
  process.exit(1);
});
