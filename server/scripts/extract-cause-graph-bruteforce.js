// Brute-force extract largest valid QuestGraph JSON from LevelDB binary dumps
const fs = require('fs');
const path = require('path');

const ldbDir = process.argv[2] || path.join(
  process.env.LOCALAPPDATA || '',
  'BraveSoftware/Brave-Browser/User Data/Default/Local Storage/leveldb'
);

function tryParseGraph(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < Math.min(text.length, start + 3_000_000); i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        if (!slice.includes('"points"')) return null;
        try {
          const parsed = JSON.parse(slice);
          if (!Array.isArray(parsed.points) || parsed.points.length === 0) return null;
          const hasTitle = parsed.points.every((p) => p.title || p.label);
          if (!hasTitle) return null;
          return { parsed, slice, score: parsed.points.length * 1000 + (parsed.edges?.length || 0) };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeLegacy(graph) {
  return {
    points: graph.points.map((p) => ({
      id: String(p.id ?? ''),
      title: String((p.title ?? p.label ?? '')).toUpperCase(),
      description: String(p.description ?? p.truth ?? ''),
      condition: String(p.condition ?? ''),
    })),
    edges: Array.isArray(graph.edges)
      ? graph.edges.map((e) => ({
          id: String(e.id ?? ''),
          fromId: String(e.fromId ?? e.from ?? ''),
          toId: String(e.toId ?? e.to ?? ''),
          unlockCondition: String(e.unlockCondition ?? e.condition ?? ''),
        }))
      : [],
    positions: graph.positions && typeof graph.positions === 'object' ? graph.positions : undefined,
  };
}

let best = null;
const files = fs.readdirSync(ldbDir).filter((f) => f.endsWith('.ldb') || f.endsWith('.log'));

for (const file of files) {
  const buf = fs.readFileSync(path.join(ldbDir, file));
  const text = buf.toString('latin1');

  for (let i = 0; i < text.length - 20; i++) {
    if (text[i] !== '{') continue;
    if (!text.slice(i, i + 40).includes('"points"') && !text.slice(i, i + 80).includes('points')) continue;
    const hit = tryParseGraph(text, i);
    if (hit && (!best || hit.score > best.score)) {
      best = { ...hit, file };
    }
  }
}

if (!best) {
  console.error('No graph JSON found in', ldbDir);
  process.exit(1);
}

const normalized = normalizeLegacy(best.parsed);
const outPath = path.join(__dirname, '../../data/cause-graph-recovered.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2), 'utf8');

console.log('Recovered from:', best.file);
console.log('Score:', best.score);
console.log('Points:', normalized.points.length);
console.log('Edges:', normalized.edges.length);
console.log('Positions:', normalized.positions ? Object.keys(normalized.positions).length : 0);
console.log('Sample titles:', normalized.points.slice(0, 8).map((p) => p.title).join(', '));
console.log('Written to:', outPath);
