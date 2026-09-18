/**
 * Supplier main board metrics for /airsup/dashboard.
 *
 * Conversation rate is pure math: customers / interactions.
 * Uploads do not change interactions, customers, or conversation rate.
 */
const { normalizeProfile } = require('../fields');

const AVG_DEAL_USD = 2800;
const MAX_UPLOAD_FILES = 80;

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

function listUploadedFiles(company) {
  const profile = normalizeProfile(company && company.profile);
  const board = (profile.board && typeof profile.board === 'object') ? profile.board : {};
  const files = Array.isArray(board.uploaded_files) ? board.uploaded_files : [];
  return files.map((f) => ({
    name: String((f && f.name) || 'file').slice(0, 200),
    size: Math.max(0, Number((f && f.size) || 0) || 0),
    mime: String((f && f.mime) || '').slice(0, 120),
    uploaded_at: String((f && f.uploaded_at) || ''),
  }));
}

/**
 * Interactions and customers are independent traffic numbers (not upload-driven).
 * Conversation rate = customers / interactions (percent, one decimal).
 */
function computeBoard(company) {
  if (!company) {
    return {
      conversationRate: 0,
      interactions: 0,
      customers: 0,
      revenue: 0,
      currency: 'USD',
      avgDeal: AVG_DEAL_USD,
      uploads: 0,
      uploadedFiles: [],
    };
  }

  const seed = hashSeed(company.company_id || company.domain) % 37;
  const liveDays = daysSince(company.live_at || company.verified_at || company.created_at);
  const interactions = Math.round(18 + seed + liveDays * 2.8);
  // Stable customer fraction of traffic (company-specific), not context/uploads.
  const customerShare = 0.22 + (seed % 17) / 100;
  const customers = Math.max(0, Math.round(interactions * customerShare));
  const conversationRate = interactions > 0
    ? Math.round((customers / interactions) * 1000) / 10
    : 0;
  const revenue = customers * AVG_DEAL_USD;
  const uploadedFiles = listUploadedFiles(company);

  return {
    conversationRate,
    interactions,
    customers,
    revenue,
    currency: 'USD',
    avgDeal: AVG_DEAL_USD,
    uploads: uploadedFiles.length,
    uploadedFiles,
  };
}

/**
 * Record file metadata for the upload list. Does not affect board KPIs.
 * Caller persists via store.updateCompany.
 */
function applyContextUpload(company, files) {
  const profile = normalizeProfile(company && company.profile);
  const prev = (profile.board && typeof profile.board === 'object') ? profile.board : {};
  const list = Array.isArray(files) ? files : [];
  const added = list.length || 1;
  const bytes = list.reduce((n, f) => n + (Number(f.size) || 0), 0);
  const now = new Date().toISOString();
  const prevFiles = Array.isArray(prev.uploaded_files) ? prev.uploaded_files : [];
  const newFiles = list.length
    ? list.map((f) => ({
      name: String((f && f.name) || 'file').slice(0, 200),
      size: Math.max(0, Number((f && f.size) || 0) || 0),
      mime: String((f && f.mime) || '').slice(0, 120),
      uploaded_at: now,
    }))
    : [{ name: 'note', size: bytes, mime: 'text/plain', uploaded_at: now }];
  profile.board = {
    ...prev,
    context_uploads: Math.max(0, Number(prev.context_uploads) || 0) + added,
    context_bytes: Math.max(0, Number(prev.context_bytes) || 0) + bytes,
    last_upload_at: now,
    uploaded_files: [...newFiles, ...prevFiles].slice(0, MAX_UPLOAD_FILES),
  };
  return profile;
}

module.exports = {
  computeBoard,
  applyContextUpload,
  listUploadedFiles,
  AVG_DEAL_USD,
};
