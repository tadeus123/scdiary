const db = require('./db');
const { listingText, endpointRecord } = require('./fields');
const { isBroadFactoryQuery, routeQueryToCategory } = require('./manufacturing-categories');
const { visibleLiveRows } = require('./public-roster');
const gapDemand = require('./gap-demand');

/** Generic RFQ words that appear on almost every listing — ignore for gap detection. */
const GAP_STOPWORDS = new Set([
  'rfq', 'quote', 'quotation', 'need', 'want', 'looking', 'please', 'thanks',
  'supplier', 'factory', 'factories', 'manufacturer', 'manufacturing', 'company',
  'pcs', 'pieces', 'piece', 'qty', 'quantity', 'units', 'unit', 'batch',
  'budget', 'price', 'usd', 'cny', 'eur', 'cost', 'pay', 'payment',
  'tolerance', 'lead', 'time', 'days', 'weeks', 'moq', 'sample', 'samples',
  'china', 'chinese', 'shenzhen', 'dongguan', 'guangdong',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'can',
  '询价', '报价', '交期', '数量', '预算', '公差', '厂家', '工厂', '供应商',
]);

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff.+-]+/i)
    .filter((word) => word.length > 1);
}

function gapTokens(query) {
  return tokens(query).filter((word) => {
    if (GAP_STOPWORDS.has(word)) return false;
    if (/^\d+(\.\d+)?$/.test(word)) return false;
    return true;
  });
}

function scoreCompany(company, query) {
  const hay = listingText(company).toLowerCase();
  const needles = tokens(query);
  let hits = 0;
  for (const word of needles) {
    if (hay.includes(word)) hits += 1;
  }
  const extra = [
    'shenzhen', 'dongguan', 'supplier',
    '深圳', '东莞', '厂家',
  ];
  for (const word of extra) {
    if (String(query || '').toLowerCase().includes(word) && hay.includes(word)) hits += 1;
  }
  const routed = routeQueryToCategory(query);
  if (routed && String((company && company.niche) || '') === routed) hits += 8;
  if (!hits && isBroadFactoryQuery(query)) hits = 1;
  return hits;
}

/**
 * Capability fit for gap detection — ignores RFQ boilerplate tokens.
 * Niche match for a routed category counts strongly.
 */
function meaningfulScore(company, query) {
  const hay = listingText(company).toLowerCase();
  const needles = gapTokens(query);
  let hits = 0;
  for (const word of needles) {
    if (hay.includes(word)) hits += 1;
  }
  const routed = routeQueryToCategory(query);
  if (routed && routed !== 'other' && String((company && company.niche) || '') === routed) hits += 8;
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
  const name = record.company_name_en || record.company_name || company.domain;
  return {
    person_id: company.company_id,
    name,
    description: description
      ? `A factory ChatGPT can ask (replies in this send_message). ${description}`
      : 'A factory ChatGPT can ask. Replies in this send_message.',
    score: scoreCompany(company, query),
    meaningful_score: meaningfulScore(company, query),
  };
}

async function countLive() {
  if (!db.isConfigured()) return 0;
  try {
    const rows = visibleLiveRows(await db.listLive());
    return Array.isArray(rows) ? rows.length : 0;
  } catch (error) {
    console.error('Airsup china live count skipped:', error.message);
    return 0;
  }
}

async function findForPlugin({ query, limit, excludeIds, callerPersonId, recordGap }) {
  if (!db.isConfigured()) return { matches: [], gap: null };
  const q = String(query || '').trim();
  if (!q) return { matches: [], gap: null };
  const skip = new Set((excludeIds || []).filter(Boolean));
  const rows = visibleLiveRows(await db.listLive());
  const scored = rows
    .filter((row) => !skip.has(row.company_id))
    .map((row) => matchView(row, q))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.meaningful_score - a.meaningful_score);

  const bestMeaningful = scored.reduce((max, row) => Math.max(max, row.meaningful_score || 0), 0);
  // Gap when a real fulfillment ask has no strong capability fit (threshold 3 after stopwords).
  const isGap = gapDemand.looksLikeFulfillmentNeed(q) && bestMeaningful < 3;

  let matches = scored.slice(0, Math.min(Math.max(Number(limit) || 5, 1), 50));
  // Honest path: do not push weak matches when this is a real fulfillment gap.
  if (isGap) {
    matches = scored
      .filter((row) => (row.meaningful_score || 0) >= 3)
      .slice(0, Math.min(Math.max(Number(limit) || 5, 1), 50));
  }

  let gap = null;
  if (isGap && recordGap !== false) {
    gap = await gapDemand.recordGapIfNeeded(db, {
      query: q,
      callerPersonId,
      chinaMatches: scored.slice(0, 8).map((row) => ({
        person_id: row.person_id,
        name: row.name,
        score: row.meaningful_score || 0,
      })),
      scoreCompany: meaningfulScore,
    });
  }

  return {
    matches: matches.map(({ person_id, name, description, score }) => ({
      person_id,
      name,
      description,
      score,
    })),
    gap,
    gap_note: isGap ? gapDemand.GAP_NOTE : null,
  };
}

module.exports = {
  tokens,
  gapTokens,
  scoreCompany,
  meaningfulScore,
  matchView,
  countLive,
  findForPlugin,
  isBroadFactoryQuery,
};
