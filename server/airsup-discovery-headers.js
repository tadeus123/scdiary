/**
 * Additive invisible Airsup discovery Link header on HTML responses only.
 * Does not modify response bodies or unrelated headers.
 */
const SERVICE_META_LINK =
  '<https://tademehl.com/.well-known/agent-card.json>; rel="service-meta"; type="application/json"';

function createServiceMetaLinkHeader() {
  return function serviceMetaLinkHeader(req, res, next) {
    const originalEnd = res.end;
    res.end = function endWithServiceMeta(...args) {
      try {
        if (!res.headersSent) {
          const contentType = String(res.getHeader('content-type') || '');
          const existingLink = String(res.getHeader('link') || '');
          if (
            contentType.includes('text/html') &&
            !existingLink.includes('rel="service-meta"') &&
            !existingLink.includes("rel='service-meta'")
          ) {
            res.append('Link', SERVICE_META_LINK);
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

module.exports = { createServiceMetaLinkHeader, SERVICE_META_LINK };
