/**
 * Additive invisible Airsup discovery Link headers on HTML responses only.
 * Does not modify response bodies or unrelated headers.
 */
const DISCOVERY_LINKS = [
  '</agent>; rel="service"',
  '</.well-known/agent-card.json>; rel="service-desc"; type="application/json"',
  '</.well-known/agent-card.json>; rel="service-meta"; type="application/json"',
  '</llms.txt>; rel="alternate"; type="text/plain"'
];

function createServiceMetaLinkHeader() {
  return function serviceMetaLinkHeader(req, res, next) {
    const originalEnd = res.end;
    res.end = function endWithServiceMeta(...args) {
      try {
        if (!res.headersSent) {
          const contentType = String(res.getHeader('content-type') || '');
          if (contentType.includes('text/html')) {
            const existingLink = String(res.getHeader('link') || '');
            for (const link of DISCOVERY_LINKS) {
              const relMatch = link.match(/rel="([^"]+)"/);
              const rel = relMatch ? relMatch[1] : '';
              if (rel && existingLink.includes(`rel="${rel}"`)) continue;
              res.append('Link', link);
            }
          }
        }
      } catch (_) {
        // never block the response for discovery headers
      }
      return originalEnd.apply(this, args);
    };
    next();
  };
}

module.exports = { createServiceMetaLinkHeader, DISCOVERY_LINKS };
