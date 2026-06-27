const fs = require('fs');
const path = require('path');

const file = path.join(
  process.env.LOCALAPPDATA,
  'BraveSoftware',
  'Brave-Browser',
  'User Data',
  'Default',
  'Local Storage',
  'leveldb',
  '000653.ldb'
);

const buf = fs.readFileSync(file);
const text = buf.toString('latin1');
const key = 'quest-builder-graph';
const idx = text.indexOf(key);
const window = Buffer.from(text.slice(idx, idx + 800000), 'latin1');

function stripNulls(b) {
  return Buffer.from(b.filter((byte) => byte !== 0));
}

function tryExtract(raw) {
  const cleaned = stripNulls(raw).toString('utf8');
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const slice = cleaned.slice(start, i + 1);
        try {
          const parsed = JSON.parse(slice);
          if (Array.isArray(parsed.points) && parsed.points.length > 0) {
            return parsed;
          }
        } catch {
          return null;
        }
        break;
      }
    }
  }
  return null;
}

// Try offsets after key
for (let offset = 0; offset < 200; offset++) {
  const hit = tryExtract(window.slice(key.length + offset));
  if (hit) {
    const normalized = {
      points: hit.points.map((p) => ({
        id: String(p.id ?? ''),
        title: String((p.title ?? p.label ?? '')).toUpperCase(),
        description: String(p.description ?? p.truth ?? ''),
        condition: String(p.condition ?? ''),
      })),
      edges: (hit.edges || []).map((e) => ({
        id: String(e.id ?? ''),
        fromId: String(e.fromId ?? e.from ?? ''),
        toId: String(e.toId ?? e.to ?? ''),
        unlockCondition: String(e.unlockCondition ?? e.condition ?? ''),
      })),
      positions: hit.positions,
    };

    const out = path.join(__dirname, '../../data/cause-graph-recovered.json');
    fs.writeFileSync(out, JSON.stringify(normalized, null, 2));
    console.log('Recovered!');
    console.log('Points:', normalized.points.length);
    console.log('Edges:', normalized.edges.length);
    console.log('Positions:', normalized.positions ? Object.keys(normalized.positions).length : 0);
    console.log('Titles:', normalized.points.map((p) => p.title).join(', '));
    process.exit(0);
  }
}

console.log('Failed to recover');
const preview = stripNulls(window.slice(key.length, key.length + 2000)).toString('utf8');
console.log(preview.slice(0, 500));
