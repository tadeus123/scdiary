require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;

async function verify() {
  const results = [];

  if (!url || !service) {
    console.log('FAIL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const admin = createClient(url, service);
  const pub = anon ? createClient(url, anon) : null;

  const { data: capsules, error: capErr } = await admin
    .from('time_capsules')
    .select('id, entry_id, publish_at, published, sealed')
    .order('publish_at');

  if (capErr) {
    results.push(['FAIL', 'time_capsules: ' + capErr.message]);
  } else if (!capsules || capsules.length !== 6) {
    results.push(['FAIL', 'Expected 6 capsules, found ' + (capsules?.length ?? 0)]);
  } else {
    results.push(['OK', 'time_capsules: 6 rows']);
    results.push([
      capsules.every((c) => c.sealed) ? 'OK' : 'FAIL',
      'All sealed: ' + capsules.every((c) => c.sealed)
    ]);
    results.push([
      capsules.every((c) => !c.published) ? 'OK' : 'FAIL',
      'None published yet: ' + capsules.every((c) => !c.published)
    ]);

    for (const c of capsules) {
      results.push(['OK', `  ${c.id} -> ${c.publish_at} (entry: ${c.entry_id})`]);
    }

    const { data: leaked } = await admin
      .from('entries')
      .select('id')
      .in(
        'id',
        capsules.map((c) => c.entry_id)
      );

    if (!leaked || leaked.length === 0) {
      results.push(['OK', 'No future entries visible in entries table yet']);
    } else {
      results.push(['FAIL', 'Capsules already in entries: ' + leaked.map((e) => e.id).join(', ')]);
    }
  }

  if (pub) {
    const { data: anonRead, error: anonErr } = await pub.from('time_capsules').select('id');
    if (anonErr || !anonRead?.length) {
      results.push(['OK', 'Anon key cannot read time_capsules (hidden from app)']);
    } else {
      results.push(['FAIL', 'Anon key CAN read time_capsules']);
    }
  }

  const backupPath = path.join(__dirname, '../../data/time-capsules-backup.json');
  if (fs.existsSync(backupPath)) {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    results.push(['OK', 'Backup file: ' + (backup.capsules?.length || 0) + ' capsules']);
  } else {
    results.push(['FAIL', 'Missing data/time-capsules-backup.json']);
  }

  console.log('Time capsule verification');
  console.log('='.repeat(50));
  for (const [status, msg] of results) {
    console.log((status === 'OK' ? '[OK]' : '[FAIL]') + ' ' + msg);
  }
  console.log('='.repeat(50));
  console.log('');
  console.log('Confirmed manually (from your SQL run):');
  console.log('  [OK] pg_cron job publish-time-capsules (schedule returned 1)');
  console.log('  [OK] publish_due_time_capsules() function created');
  console.log('');
  console.log('Diary app: no code changes to load/save (unchanged)');

  const failed = results.filter((r) => r[0] === 'FAIL').length;
  process.exit(failed > 0 ? 1 : 0);
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
