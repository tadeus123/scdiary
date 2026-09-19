const SCANNER_UA = /proofpoint|mimecast|barracuda|trustwave|symantec|messagelabs|ironport|fortinet|fortigate|trend micro|sophos|mcafee|fireeye|googleimageproxy|yahoomailproxy|safelinks|protection\.outlook|microsoft office|coremail|netease|mail\.163|curl\/|wget\/|python-requests|go-http-client|libwww-perl|scrapy|bot\b|crawler|spider|preview/i;

function header(req, name) {
  if (!req) return '';
  if (typeof req.get === 'function') return String(req.get(name) || '');
  const headers = req.headers || {};
  return String(headers[name] || headers[String(name).toLowerCase()] || '');
}

function isClaimScannerRequest(req) {
  const ua = header(req, 'user-agent');
  const purpose = `${header(req, 'purpose')} ${header(req, 'sec-purpose')} ${header(req, 'x-purpose')}`;
  const moz = header(req, 'x-moz');
  if (!String(ua || '').trim()) return true;
  if (SCANNER_UA.test(ua)) return true;
  if (/prefetch|preview/i.test(purpose) || /prefetch/i.test(moz)) return true;
  return false;
}

async function markClaimOpened(store, { domain, email, req }) {
  if (!store || typeof store.getDomainAllow !== 'function') return null;
  if (req && isClaimScannerRequest(req)) return null;
  const row = await store.getDomainAllow(domain, email);
  if (!row) return null;
  if (row.claim_opened_at) return row;
  if (row.bounced_at) return null;
  return store.touchDomainAllow(domain, email, {
    claim_opened_at: new Date().toISOString(),
  });
}

module.exports = {
  isClaimScannerRequest,
  markClaimOpened,
};
