// Print SQL to create the cause_graph table in Supabase
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, 'create-cause-graph-table.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

console.log('Cause graph table setup\n');
console.log('='.repeat(60));
console.log(sql);
console.log('='.repeat(60));
console.log('\nRun the SQL above in Supabase Dashboard → SQL Editor → New query → Run.\n');
