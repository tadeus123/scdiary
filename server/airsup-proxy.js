/**
 * Additive Airsup / Supi discovery proxy — only the listed paths.
 * Upstream: https://airsup-peach.vercel.app
 * Does not alter any other site routes or behavior.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_UPSTREAM = 'https://airsup-peach.vercel.app';

const AIRSUP_PATHS = [
  (p) => p === '/.well-known/agent-card.json',
  (p) => p === '/.well-known/agent.json',
  (p) => p === '/a2a/v1' || p.startsWith('/a2a/v1/'),
  (p) => p === '/agent',
  (p) => p === '/agent/status.json',
  (p) => p === '/agent/chat',
  (p) => p === '/supi.svg'
];

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length'
]);

function shouldProxy(pathname) {
  return AIRSUP_PATHS.some((test) => test(pathname));
}

function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname || '/';
}

function createAirsupProxy() {
  const upstream = (process.env.AIRSUP_UPSTREAM || DEFAULT_UPSTREAM).replace(/\/$/, '');

  return function airsupProxy(req, res, next) {
    const rawPath = (req.path || req.url.split('?')[0]) || '/';
    const pathname = normalizePathname(rawPath);

    if (!shouldProxy(pathname)) {
      return next();
    }

    let target;
    try {
      const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      target = new URL(pathname + search, upstream + '/');
    } catch (err) {
      return next(err);
    }

    const lib = target.protocol === 'https:' ? https : http;
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      if (HOP_BY_HOP.has(key.toLowerCase())) continue;
      headers[key] = value;
    }
    headers.host = target.host;
    headers['x-forwarded-host'] = req.headers.host || 'tademehl.com';
    headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'https';

    const proxyReq = lib.request(
      target,
      {
        method: req.method,
        headers
      },
      (proxyRes) => {
        const outHeaders = { ...proxyRes.headers };
        delete outHeaders['transfer-encoding'];
        res.writeHead(proxyRes.statusCode || 502, outHeaders);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.error('[airsup-proxy]', err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Airsup upstream unavailable',
          upstream
        });
      }
    });

    if (req.method === 'GET' || req.method === 'HEAD') {
      proxyReq.end();
      return;
    }

    if (req.readableEnded || req.complete) {
      if (req.body !== undefined && req.body !== null) {
        const payload =
          Buffer.isBuffer(req.body) || typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body);
        proxyReq.setHeader('content-type', req.headers['content-type'] || 'application/json');
        proxyReq.setHeader('content-length', Buffer.byteLength(payload));
        proxyReq.end(payload);
      } else {
        proxyReq.end();
      }
      return;
    }

    req.pipe(proxyReq);
  };
}

module.exports = { createAirsupProxy, shouldProxy };
