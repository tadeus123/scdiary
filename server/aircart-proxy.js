/**
 * Additive AirCart proxy for local/dev when the sidecar runs on 127.0.0.1:8787.
 * On Vercel, vercel.json routes the four paths to aircart-addon/server.js instead.
 * Does not alter any existing site routes or behavior.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const AIRCART_PATHS = [
  { method: 'ALL', test: (p) => p === '/.well-known/agent-card.json' },
  { method: 'ALL', test: (p) => p === '/a2a/v1' || p.startsWith('/a2a/v1/') },
  { method: 'ALL', test: (p) => p === '/agent' },
  { method: 'ALL', test: (p) => p === '/agent/status.json' || p === '/agent/status' }
];

function shouldProxy(pathname) {
  return AIRCART_PATHS.some((rule) => rule.test(pathname));
}

function createAircartProxy() {
  const upstream = (process.env.AIRCART_UPSTREAM || 'http://127.0.0.1:8787').replace(/\/$/, '');

  return function aircartProxy(req, res, next) {
    if (process.env.VERCEL && !process.env.AIRCART_UPSTREAM) {
      return next();
    }

    const pathname = req.path || req.url.split('?')[0];
    if (!shouldProxy(pathname)) {
      return next();
    }

    let target;
    try {
      target = new URL(req.originalUrl || req.url, upstream + '/');
    } catch (err) {
      return next(err);
    }

    const lib = target.protocol === 'https:' ? https : http;
    const headers = { ...req.headers, host: target.host };
    delete headers['content-length'];

    const proxyReq = lib.request(
      target,
      {
        method: req.method,
        headers
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.error('[aircart-proxy]', err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'AirCart sidecar unavailable',
          hint: 'Start with: npm run aircart'
        });
      }
    });

    if (req.method === 'GET' || req.method === 'HEAD') {
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  };
}

module.exports = { createAircartProxy, shouldProxy };
