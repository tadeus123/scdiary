const fs = require('fs');
const path = require('path');

const dir = path.join(
  process.env.LOCALAPPDATA,
  'BraveSoftware',
  'Brave-Browser',
  'User Data',
  'Default',
  'Local Storage',
  'leveldb'
);

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.ldb')) continue;
  const buf = fs.readFileSync(path.join(dir, f));
  const hits = [];
  for (const k of ['quest-builder-graph', 'unlockCondition', 'POINT A', '"points"']) {
    if (buf.includes(k)) hits.push(k);
  }
  if (hits.length) console.log(f, buf.length, hits.join(', '));
}
