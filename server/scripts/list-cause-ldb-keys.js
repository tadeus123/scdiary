const fs = require('fs');
const path = require('path');
const { ClassicLevel } = require('classic-level');

const src = path.join(
  process.env.LOCALAPPDATA,
  'BraveSoftware',
  'Brave-Browser',
  'User Data',
  'Default',
  'Local Storage',
  'leveldb'
);
const tmp = path.join(__dirname, '../../data/ldb-copy');

async function main() {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (f === 'LOCK') continue;
    fs.copyFileSync(path.join(src, f), path.join(tmp, f));
  }

  const db = new ClassicLevel(tmp, { createIfMissing: false, keyEncoding: 'buffer', valueEncoding: 'buffer' });
  let count = 0;

  for await (const [key, value] of db.iterator()) {
    const keyStr = key.toString('utf8').replace(/\0/g, '|');
    const valStr = value.toString('utf8');
    if (
      keyStr.includes('quest-builder') ||
      keyStr.includes('humanoid-quest') ||
      keyStr.includes('localhost') ||
      keyStr.includes('5180') ||
      keyStr.includes('livegame') ||
      valStr.includes('quest-builder')
    ) {
      count++;
      console.log('KEY:', keyStr);
      console.log('  value length:', valStr.length);
      console.log('  has points:', valStr.includes('"points"'));
      if (valStr.includes('"points"')) {
        const m = valStr.match(/"points":\[/);
        console.log('  snippet:', valStr.slice(Math.max(0, (m?.index || 0) - 5), (m?.index || 0) + 120));
      }
      console.log('');
    }
  }

  await db.close();
  console.log('Total matching keys:', count);
}

main().catch(console.error);
