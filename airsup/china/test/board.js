/**
 * Supplier main board metrics for /airsup/china/test (replaceable).
 *
 * Conversation rate rises with uploaded / published context.
 * Customers = interactions × conversationRate.
 * Revenue = customers × average deal (stable demo unit).
 */
const { normalizeProfile, listedContacts } = require('../fields');

const AVG_DEAL_USD = 2800;
const MIN_RATE = 0.04;
const MAX_RATE = 0.42;

function hashSeed(text) {
  const s = String(text || 'x');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function daysSince(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

/** 0–100 context score from profile + dumps + note-web. */
function contextScore(company, web) {
  const profile = normalizeProfile(company && company.profile);
  const board = (profile.board && typeof profile.board === 'object') ? profile.board : {};
  const docs = (profile.quotation_knowledge && Array.isArray(profile.quotation_knowledge.documents))
    ? profile.quotation_knowledge.documents
    : [];
  const nodes = web && web.nodes && typeof web.nodes === 'object'
    ? Object.keys(web.nodes).length
    : 0;
  const reach = web && web.reach != null ? Number(web.reach) || 0 : 0;
  const uploads = Math.max(0, Number(board.context_uploads) || 0);
  const uploadBytes = Math.max(0, Number(board.context_bytes) || 0);

  let score = 0;
  if (listedContacts(profile.contacts).length) score += 12;
  if (String(profile.sample_lead || '').trim()) score += 10;
  score += Math.min(18, ((profile.processes || []).length + (profile.materials || []).length) * 3);
  score += Math.min(20, docs.length * 7);
  score += Math.min(22, Math.floor(reach / 5) + nodes * 2);
  score += Math.min(30, uploads * 6 + Math.floor(uploadBytes / (180 * 1024)));
  if (String(company && company.context || '').trim().length > 40) score += 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Conversation rate as percent (one decimal), driven by context.
 * Higher context → higher rate → more customers & revenue from the same traffic.
 */
function conversationRate(score) {
  const t = Math.max(0, Math.min(100, Number(score) || 0)) / 100;
  const rate = MIN_RATE + t * (MAX_RATE - MIN_RATE);
  return Math.round(rate * 1000) / 10; // e.g. 18.4
}

function computeBoard(company, web) {
  if (!company) {
    return {
      conversationRate: 0,
      interactions: 0,
      customers: 0,
      revenue: 0,
      contextScore: 0,
      currency: 'USD',
      avgDeal: AVG_DEAL_USD,
    };
  }

  const score = contextScore(company, web);
  const ratePct = conversationRate(score);
  const seed = hashSeed(company.company_id || company.domain) % 37;
  const liveDays = daysSince(company.live_at || company.verified_at || company.created_at);
  // Endpoint traffic grows mildly with context (stronger answers → more ChatGPT reuse).
  const interactions = Math.round(18 + seed + liveDays * 2.8 + score * 0.55);
  const customers = Math.max(0, Math.round(interactions * (ratePct / 100)));
  const revenue = customers * AVG_DEAL_USD;

  return {
    conversationRate: ratePct,
    interactions,
    customers,
    revenue,
    contextScore: score,
    currency: 'USD',
    avgDeal: AVG_DEAL_USD,
    uploads: Number((normalizeProfile(company.profile).board || {}).context_uploads) || 0,
  };
}

/**
 * Bump profile.board context counters after a supplier dump.
 * Caller persists via store.updateCompany.
 */
function applyContextUpload(company, files) {
  const profile = normalizeProfile(company && company.profile);
  const prev = (profile.board && typeof profile.board === 'object') ? profile.board : {};
  const list = Array.isArray(files) ? files : [];
  const added = list.length || 1;
  const bytes = list.reduce((n, f) => n + (Number(f.size) || 0), 0);
  profile.board = {
    ...prev,
    context_uploads: Math.max(0, Number(prev.context_uploads) || 0) + added,
    context_bytes: Math.max(0, Number(prev.context_bytes) || 0) + bytes,
    last_upload_at: new Date().toISOString(),
  };
  return profile;
}

module.exports = {
  computeBoard,
  contextScore,
  conversationRate,
  applyContextUpload,
  AVG_DEAL_USD,
};
