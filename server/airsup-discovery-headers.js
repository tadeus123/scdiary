/**
 * Additive invisible Airsup Link headers on HTML responses only.
 * REVERT: delete this file + remove require from server/server.js (see airsup/REVERT.md)
 */
const DISCOVERY_LINKS = [
  '</supi>; rel="service"',
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
              if (existingLink.includes(link)) continue;
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
