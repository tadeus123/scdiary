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

function firstNonEmpty(...vals) {
  for (const value of vals) {
    if (value == null || typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function looksLikeBase64Blob(value) {
  const text = String(value || '').replace(/\s+/g, '');
  if (text.length < 80) return false;
  if (/^https?:\/\//i.test(text) || text.includes('/') || text.includes('\\')) return false;
  return /^[A-Za-z0-9+/=]+$/.test(text);
}

function normalizeMediaItem(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    if (looksLikeBase64Blob(text)) return { data_base64: text.replace(/\s+/g, '') };
    return { url: text };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const url = firstNonEmpty(
    raw.url,
    raw.download_url,
    raw.path,
    raw.uri,
    raw.file_url,
    raw.image_url,
    raw.href,
    raw.file,
  );
  let dataBase64 = firstNonEmpty(raw.data_base64, raw.base64, raw.data);
  if (dataBase64 && dataBase64.startsWith('data:') && dataBase64.includes(',')) {
    dataBase64 = dataBase64.slice(dataBase64.indexOf(',') + 1);
  }
  const fileId = firstNonEmpty(raw.file_id, raw.fileId);
  const name = firstNonEmpty(raw.name, raw.file_name, raw.fileName, raw.filename);
  const mime = firstNonEmpty(raw.mime, raw.mime_type, raw.mimeType, raw.content_type, raw.type);
  const caption = firstNonEmpty(raw.caption, raw.alt, raw.title, raw.description);

  if (!url && !dataBase64 && !fileId) return null;

  const item = {};
  if (url) {
    item.url = url;
    item.download_url = url;
  }
  if (dataBase64) item.data_base64 = dataBase64;
  if (fileId) item.file_id = fileId;
  if (name) {
    item.name = name;
    item.file_name = name;
  }
  if (mime) {
    item.mime = mime;
    item.mime_type = mime;
  }
  if (caption) item.caption = caption;
  return item;
}

function mediaKey(item) {
  if (!item || typeof item !== 'object') return '';
  return firstNonEmpty(item.file_id, item.url, item.download_url, item.data_base64, item.name, item.file_name);
}

function mergeMedia(prev, incoming) {
  const out = Array.isArray(prev) ? prev.filter(Boolean).map((item) => ({ ...item })) : [];
  const seen = new Set(out.map(mediaKey).filter(Boolean));
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const item = raw && typeof raw === 'object' ? { ...raw } : null;
    if (!item) continue;
    const key = mediaKey(item);
    if (key && seen.has(key)) {
      const idx = out.findIndex((row) => mediaKey(row) === key);
      if (idx >= 0) out[idx] = { ...out[idx], ...item };
      continue;
    }
    if (key) seen.add(key);
    out.push(item);
  }
  return out;
}

function resolveListingMedia(prevMedia, media, merge) {
  if (!Array.isArray(media)) return Array.isArray(prevMedia) ? [...prevMedia] : [];
  if (!merge) return [...media];
  return mergeMedia(prevMedia, media);
}

function coerceMediaList(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

function prepareListingMedia(raw) {
  if (raw == null || raw === '') {
    return { provided: false, media: undefined, rejected: 0 };
  }
  const list = coerceMediaList(raw);
  const media = [];
  let rejected = 0;
  for (const item of list) {
    const normalized = normalizeMediaItem(item);
    if (!normalized) {
      rejected += 1;
      continue;
    }
    media.push(normalized);
  }
  return { provided: true, media, rejected };
}

const MEDIA_RETRY_HINT = [
  'You can upload pictures.',
  'Pass every user-attached image in media on this same call.',
  'Each item needs download_url and file_id (ChatGPT file object), or url, or data_base64.',
  'If you only have a local file location, put that string in url or download_url — never in a path field.',
].join(' ');

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
        if (item.download_url) parts.push(String(item.download_url));
        if (item.caption) parts.push(String(item.caption));
        if (item.name) parts.push(String(item.name));
        if (item.file_name) parts.push(String(item.file_name));
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
  normalizeMediaItem,
  mergeMedia,
  resolveListingMedia,
  coerceMediaList,
  prepareListingMedia,
  MEDIA_RETRY_HINT,
};
