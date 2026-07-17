const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const publicDir = path.join(__dirname, '../../public');

const CANONICAL_SHA1 = {
  'favicon-16.png': '5f297e74b7ae756da19c5f6654ad83fd308ad3eb',
  'favicon-32.png': '2270dfcaaf38355e3b13a9b930bb2356bc6900d9'
};

const forbiddenPatterns = [
  { file: 'favicon.svg', pattern: /M32 0H18L32 14Z/, reason: 'corner triangle in favicon.svg' },
  { file: 'favicon.svg', pattern: /<rect width="32" height="32" fill="#EFE8DC"\/>/, reason: 'cream corner icon in favicon.svg' }
];

function sha1File(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyFavicons() {
  const errors = [];

  for (const { file, pattern, reason } of forbiddenPatterns) {
    const fullPath = path.join(publicDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    if (pattern.test(content)) {
      errors.push(`${file}: ${reason}`);
    }
  }

  for (const [file, expectedHash] of Object.entries(CANONICAL_SHA1)) {
    const fullPath = path.join(publicDir, file);
    const hash = sha1File(fullPath);
    if (hash !== expectedHash) {
      errors.push(`${file}: hash mismatch (expected locked Georgia T from 515ea9f)`);
    }
  }

  for (const size of [48]) {
    const pngPath = path.join(publicDir, `favicon-${size}.png`);
    if (!fs.existsSync(pngPath)) {
      errors.push(`favicon-${size}.png: missing`);
    }
  }

  if (errors.length) {
    console.error('Favicon verification failed:\n');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('Favicon verification passed: locked red Georgia T tab icons.');
}

if (require.main === module) {
  verifyFavicons();
}

module.exports = { verifyFavicons, CANONICAL_SHA1 };
