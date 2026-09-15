const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function randomToken(prefix, bytes = 24) {
  return `${prefix}${crypto.randomBytes(bytes).toString('hex')}`;
}

module.exports = { sha256, randomToken };
