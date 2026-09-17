const db = require('./db');
const { listingText, endpointRecord, isDemoCompany } = require('./fields');
const { ensureDemoCompany } = require('./demo-company');

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff.+-]+/i)
    .filter((word) => word.length > 1);
}

function isBroadFactoryQuery(query) {
  return /\b(factor(?:y|ies)?|supplier|manufactur|cnc|pcba|smt|mold|injection|machin|sheet\s*metal|3d|printing|additive|demo|谁|厂家|工厂|制造商|供应商|注塑|模具|增材|3d打印|演示)\b/i.test(
    String(query || '')
  );
}

function scoreCompany(company, query) {
  const hay = listingText(company).toLowerCase();
  const needles = tokens(query);
  let hits = 0;
  for (const word of needles) {
    if (hay.includes(word)) hits += 1;
  }
  const extra = [
    'cnc', 'shenzhen', 'dongguan', 'supplier', 'machining', 'machin', 'mold', 'injection', 'pcba', 'smt',
    '3d', 'printing', 'additive', 'sla', 'sls', 'fdm', 'mjf', 'demo',
    '深圳', '东莞', '厂家', '注塑', '模具', '增材', '打印', '演示',
  ];
  for (const word of extra) {
    if (String(query || '').toLowerCase().includes(word) && hay.includes(word)) hits += 1;
  }
  if (!hits && isBroadFactoryQuery(query)) hits = 1;
  if (isDemoCompany(company) && /\bdemo\b|演示|tade|airsup/i.test(String(query || ''))) hits += 3;
  return hits;
}

function matchView(company, query) {
  const record = endpointRecord(company);
  const hay = record.listing_text || '';
  const first = String(query || '').trim().split(/\s+/)[0] || '';
  const idx = first ? hay.toLowerCase().indexOf(first.toLowerCase()) : -1;
  const description = idx >= 0
    ? hay.slice(Math.max(0, idx - 40), idx + 180).trim()
    : hay.slice(0, 180);
  const demo = isDemoCompany(company);
  const name = demo
    ? (record.company_name_en || record.company_name || 'Demo company (Tade / Airsup)')
    : (record.company_name_en || record.company_name || company.domain);
  return {
    person_id: company.company_id,
    name,
    description: demo
      ? `DEMO company operated by Tade / Airsup for testing (not a real factory). ChatGPT can ask it like a live supplier. ${description}`
      : (description
        ? `A factory ChatGPT can ask (replies in this send_message). ${description}`
        : 'A factory ChatGPT can ask. Replies in this send_message.'),
    score: scoreCompany(company, query),
    demo: demo || undefined,
  };
}

async function countLive() {
  if (!db.isConfigured()) return 0;
  try {
    const rows = await db.listLive();
    return Array.isArray(rows) ? rows.filter((row) => !isDemoCompany(row)).length : 0;
  } catch (error) {
    console.error('Airsup china live count skipped:', error.message);
    return 0;
  }
}

async function findForPlugin({ query, limit, excludeIds }) {
  if (!db.isConfigured()) return [];
  const q = String(query || '').trim();
  if (!q) return [];
  try {
    await ensureDemoCompany();
  } catch (error) {
    console.error('Airsup china demo ensure skipped:', error.message);
  }
  const skip = new Set((excludeIds || []).filter(Boolean));
  const rows = await db.listLive();
  return rows
    .filter((row) => !skip.has(row.company_id))
    .map((row) => matchView(row, q))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(Number(limit) || 5, 1), 50));
}

module.exports = {
  tokens,
  scoreCompany,
  isBroadFactoryQuery,
  countLive,
  findForPlugin,
  matchView,
};
