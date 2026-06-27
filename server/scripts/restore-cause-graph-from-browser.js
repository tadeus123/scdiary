// Extract + normalize + restore cause graph from Brave localStorage
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ClassicLevel } = require('classic-level');
const { saveCauseGraph } = require('../db/supabase');

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

function decodeValue(value) {
  const attempts = [
    Buffer.from(value.filter((b) => b !== 0)).toString('utf8'),
    value.slice(1).toString('utf8'),
    value.toString('utf16le'),
  ];
  for (const text of attempts) {
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
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
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
      fromId: String(e.fromId ?? e.from ?? ''),
      toId: String(e.toId ?? e.to ?? ''),
      unlockCondition: String(e.unlockCondition ?? e.condition ?? ''),
    })),
    positions:
      graph.positions && typeof graph.positions === 'object' ? graph.positions : undefined,
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
    const parsed = decodeValue(value);
    if (!parsed?.points?.length) continue;
    const score = parsed.points.length * 1000 + (parsed.edges?.length || parsed.links?.length || 0);
    if (!best || score > best.score) {
      best = { parsed, score, keyStr: keyStr.replace(/\0/g, '|') };
    }
  }

  await db.close();

  if (!best) {
    console.error('No graph found');
    process.exit(1);
  }

  const normalized = normalizeGraph(best.parsed);
  const out = path.join(__dirname, '../../data/cause-graph-recovered.json');
  fs.writeFileSync(out, JSON.stringify(normalized, null, 2));

  const result = await saveCauseGraph(normalized);
  if (!result.success) {
    console.error('Supabase save failed:', result.error);
    process.exit(1);
  }

  console.log('Recovered from:', best.keyStr);
  console.log('Points:', normalized.points.length);
  console.log('Edges:', normalized.edges.length);
  console.log('Positions:', normalized.positions ? Object.keys(normalized.positions).length : 0);
  console.log('Saved to Supabase at:', result.updated_at);
  console.log('Backup:', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
