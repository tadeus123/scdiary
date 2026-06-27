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

function parseValue(valStr) {
  const cleaned = valStr.replace(/^\u0001/, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('No JSON object in value');
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error('Unterminated JSON');
}

function normalizeGraph(graph) {
  return {
    points: graph.points.map((p) => ({
      id: String(p.id ?? ''),
      title: String((p.title ?? p.label ?? '')).toUpperCase(),
      description: String(p.description ?? p.truth ?? ''),
      condition: String(p.condition ?? ''),
    })),
    edges: (graph.edges || graph.links || []).map((e) => ({
      id: String(e.id ?? ''),
      fromId: String(e.fromId ?? e.from ?? e.fromId ?? ''),
      toId: String(e.toId ?? e.to ?? e.toId ?? ''),
      unlockCondition: String(e.unlockCondition ?? e.condition ?? ''),
    })),
    positions: graph.positions && typeof graph.positions === 'object' ? graph.positions : undefined,
  };
}

async function main() {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (f === 'LOCK') continue;
    fs.copyFileSync(path.join(src, f), path.join(tmp, f));
  }

  const db = new ClassicLevel(tmp, { createIfMissing: false, keyEncoding: 'buffer', valueEncoding: 'buffer' });
  let best = null;

  for await (const [key, value] of db.iterator()) {
    const keyStr = key.toString('utf8');
    if (!keyStr.includes('quest-builder-graph')) continue;

    const valStr = value.toString('utf8');
    try {
      const parsed = parseValue(valStr);
      if (!Array.isArray(parsed.points) || parsed.points.length === 0) continue;
      const score = parsed.points.length * 1000 + (parsed.edges?.length || parsed.links?.length || 0);
      if (!best || score > best.score) {
        best = { parsed, score, keyStr: keyStr.replace(/\0/g, '|') };
      }
    } catch (err) {
      console.warn('Skip key', keyStr.replace(/\0/g, '|'), err.message);
    }
  }

  await db.close();

  if (!best) {
    console.error('No recoverable graph found');
    process.exit(1);
  }

  const normalized = normalizeGraph(best.parsed);
  const out = path.join(__dirname, '../../data/cause-graph-recovered.json');
  fs.writeFileSync(out, JSON.stringify(normalized, null, 2));

  console.log('Source:', best.keyStr);
  console.log('Points:', normalized.points.length);
  console.log('Edges:', normalized.edges.length);
  console.log('Positions:', normalized.positions ? Object.keys(normalized.positions).length : 0);
  console.log('Sample titles:', normalized.points.slice(0, 12).map((p) => p.title).join(', '));
  console.log('Written:', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
