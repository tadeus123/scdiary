const HIDDEN_LIVE_DOMAINS = new Set(['hugeconversations.com']);

function hostOf(domain) {
  return String(domain || '').replace(/^www\./i, '').trim().toLowerCase();
}

function isHiddenLiveDomain(domain) {
  return HIDDEN_LIVE_DOMAINS.has(hostOf(domain));
}

function visibleLiveRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isHiddenLiveDomain(row && row.domain));
}

module.exports = {
  HIDDEN_LIVE_DOMAINS,
  isHiddenLiveDomain,
  visibleLiveRows,
};
