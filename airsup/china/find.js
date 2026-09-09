const db = require('./db');
const { listingText, endpointRecord } = require('./fields');

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff.+-]+/i)
    .filter((word) => word.length > 1);
}

function scoreCompany(company, query) {
  const hay = listingText(company).toLowerCase();
  const needles = tokens(query);
  if (!needles.length) return 0;
  let hits = 0;
  for (const word of needles) {
    if (hay.includes(word)) hits += 1;
  }
  const extra = ['cnc', 'shenzhen', 'dongguan', 'supplier', 'machining', 'machin', 'mold', 'injection', 'pcba', 'smt', '深圳', '东莞', '厂家', '注塑', '模具'];
  for (const word of extra) {
    if (String(query || '').toLowerCase().includes(word) && hay.includes(word)) hits += 1;
  }
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
  return {
    person_id: company.company_id,
    name: record.company_name_en || record.company_name || company.domain,
    description: description || undefined,
    score: scoreCompany(company, query),
  };
}

async function findForPlugin({ query, limit, excludeIds }) {
  if (!db.isConfigured()) return [];
  const q = String(query || '').trim();
  if (!q) return [];
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
  findForPlugin,
};
