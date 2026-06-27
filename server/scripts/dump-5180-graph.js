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

  for await (const [key, value] of db.iterator()) {
    const keyStr = key.toString('utf8');
    if (!keyStr.includes('5180') || !keyStr.includes('quest-builder')) continue;

    const out = path.join(__dirname, '../../data/cause-raw-value.bin');
    fs.writeFileSync(out, value);
    console.log('key:', keyStr.replace(/\0/g, '|'));
    console.log('length:', value.length);
    console.log('hex:', value.slice(0, 60).toString('hex'));

    const attempts = [
      ['utf8-skip1', value.slice(1).toString('utf8')],
      ['utf8', value.toString('utf8')],
      ['utf16le', value.toString('utf16le')],
      ['utf16le-skip2', value.slice(2).toString('utf16le')],
      ['latin1-null-stripped', Buffer.from(value.filter((b) => b !== 0)).toString('utf8')],
    ];

    for (const [name, text] of attempts) {
      const start = text.indexOf('{"points"');
      if (start < 0) continue;
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            try {
              const parsed = JSON.parse(text.slice(start, i + 1));
              console.log('PARSED via', name);
              console.log('points:', parsed.points.length);
              console.log('edges:', (parsed.edges || parsed.links || []).length);
              fs.writeFileSync(
                path.join(__dirname, '../../data/cause-graph-recovered.json'),
                JSON.stringify(parsed, null, 2)
              );
              await db.close();
              return;
            } catch (e) {
              console.log('parse fail', name, e.message);
            }
            break;
          }
        }
      }
    }
  }

  await db.close();
  console.error('Could not parse localhost:5180 graph');
}

main().catch(console.error);
