// Extract quest-builder-graph JSON from Chrome/Brave LevelDB files
const fs = require('fs');
const path = require('path');

const ldbDir = process.argv[2] || path.join(
  process.env.LOCALAPPDATA || '',
  'BraveSoftware/Brave-Browser/User Data/Default/Local Storage/leveldb'
);

if (!fs.existsSync(ldbDir)) {
  console.error('LevelDB dir not found:', ldbDir);
  process.exit(1);
}

const files = fs.readdirSync(ldbDir).filter((f) => f.endsWith('.ldb') || f.endsWith('.log'));
let best = null;

for (const file of files) {
  const buf = fs.readFileSync(path.join(ldbDir, file));
  const text = buf.toString('latin1');
  const keyIdx = text.indexOf('quest-builder-graph');
  if (keyIdx === -1) continue;

  // Search for JSON object after the key
  for (let start = keyIdx; start < Math.min(text.length, keyIdx + 5000); start++) {
    if (text[start] !== '{') continue;
    let depth = 0;
    for (let i = start; i < Math.min(text.length, start + 2_000_000); i++) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          if (!candidate.includes('"points"')) break;
          try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed.points) && parsed.points.length > 0) {
              const score = parsed.points.length * 1000 + (parsed.edges?.length || 0);
              if (!best || score > best.score) {
                best = { file, parsed, score, raw: candidate };
              }
            }
          } catch {
            /* try next */
          }
          break;
        }
      }
    }
  }
}

if (!best) {
  console.error('No valid quest-builder-graph JSON found in', ldbDir);
  process.exit(1);
}

const outPath = path.join(__dirname, '../../data/cause-graph-recovered.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(best.parsed, null, 2), 'utf8');

console.log('Recovered from:', best.file);
console.log('Points:', best.parsed.points.length);
console.log('Edges:', best.parsed.edges?.length || 0);
console.log('Positions:', best.parsed.positions ? Object.keys(best.parsed.positions).length : 0);
console.log('Written to:', outPath);
