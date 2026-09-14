const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function randomToken(prefix, bytes = 24) {
  return `${prefix}${crypto.randomBytes(bytes).toString('hex')}`;
}

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function hrNow() {
  const [s, ns] = process.hrtime();
  return s * 1e3 + ns / 1e6;
}

function listingTextBlob(body, media) {
  const parts = [];
  if (body && typeof body === 'object') {
    parts.push(JSON.stringify(body));
  } else if (body != null) {
    parts.push(String(body));
  }
  if (Array.isArray(media)) {
    for (const item of media) {
      if (!item) continue;
      if (typeof item === 'string') parts.push(item);
      else {
        if (item.url) parts.push(String(item.url));
        if (item.caption) parts.push(String(item.caption));
        if (item.name) parts.push(String(item.name));
      }
    }
  }
  return parts.join('\n').slice(0, 200000);
}

module.exports = {
  sha256,
  randomToken,
  newId,
  nowIso,
  hrNow,
  listingTextBlob,
};
