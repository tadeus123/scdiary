/**
 * Concept-only in-memory attachment excerpts for /airsup/china/test.
 * Not shared with live quotations storage.
 */
const MAX_EXCERPT = 2500;

function excerptFromBuffer(file) {
  if (!file || !file.buffer) return '';
  const name = String(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (
    mime.startsWith('text/')
    || name.endsWith('.txt')
    || name.endsWith('.csv')
    || name.endsWith('.md')
    || name.endsWith('.json')
  ) {
    return file.buffer.toString('utf8').slice(0, MAX_EXCERPT);
  }
  // Binary (pdf/xlsx/zip): keep a tiny marker only — full extract can come later.
  return '';
}

function describeUploads(files) {
  return (files || []).map((file) => ({
    id: `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(file.originalname || 'file').slice(0, 180),
    mime: String(file.mimetype || 'application/octet-stream').slice(0, 120),
    size: Number(file.size) || (file.buffer ? file.buffer.length : 0),
    excerpt: excerptFromBuffer(file),
  }));
}

module.exports = {
  excerptFromBuffer,
  describeUploads,
  MAX_EXCERPT,
};
