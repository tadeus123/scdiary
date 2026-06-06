/**
 * One-time seed for sealed time-capsule diary entries.
 *
 * Prerequisites:
 *   1. Run server/scripts/create-time-capsules-table.sql in Supabase SQL Editor
 *   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *      (service role required — time_capsules has no public RLS policies)
 *
 * Usage:
 *   node server/scripts/seed-time-capsules.js
 *
 * Writes a local backup to data/time-capsules-backup.json (gitignored).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { marked } = require('marked');
const messages = require('./time-capsules-messages');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error(
    '❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before seeding.'
  );
  console.error('   (Anon key cannot write to time_capsules — RLS blocks all public access.)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const backupPath = path.join(__dirname, '../../data/time-capsules-backup.json');

function contentToHtml(content) {
  return marked(content.replace(/\r\n/g, '\n'));
}

async function seed() {
  console.log('🔒 Seeding time capsules...');

  const { data: existing, error: checkError } = await supabase
    .from('time_capsules')
    .select('id');

  if (checkError) {
    if (/relation.*time_capsules.*does not exist/i.test(checkError.message || '')) {
      console.error('❌ Table time_capsules missing. Run create-time-capsules-table.sql first.');
    } else {
      console.error('❌ Error checking time_capsules:', checkError.message);
    }
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log(`✅ Already seeded (${existing.length} capsules). Nothing to do.`);
    return;
  }

  const rows = messages.map((msg) => ({
    id: msg.id,
    entry_id: msg.entry_id,
    content: msg.content.trim(),
    html: contentToHtml(msg.content),
    publish_at: msg.publish_at,
    published: false,
    sealed: true
  }));

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        sealed_at: new Date().toISOString(),
        capsules: rows.map(({ id, entry_id, content, html, publish_at }) => ({
          id,
          entry_id,
          publish_at,
          content,
          html
        }))
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`💾 Backup written to ${backupPath}`);

  const { data, error } = await supabase.from('time_capsules').insert(rows).select('id, publish_at');

  if (error) {
    console.error('❌ Insert failed:', error.message);
    process.exit(1);
  }

  console.log(`✅ Sealed ${data.length} time capsules:`);
  for (const row of data) {
    console.log(`   • ${row.id} → publishes ${row.publish_at}`);
  }
  console.log('\n🎉 Done. Diary app unchanged — pg_cron will publish on schedule.');
  console.log('   Keep data/time-capsules-backup.json somewhere safe (1Password, etc.).');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
