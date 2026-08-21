const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const publicDir = path.join(__dirname, '../../public');
const lockedDir = path.join(__dirname, 'favicon-locked');

// Canonical tab icon: cream-background crimson T. Master is favicon-locked/source.png (1024x1024).
const CANONICAL_SHA1 = {
  'favicon-16.png': '4bc269dca32ad4f4a794cd82d04adf2c333fd3db',
  'favicon-32.png': '8f30f455f820a1f9de0b63a7d18eb937021303ca',
  'favicon-48.png': 'ac41cc11e69715d3c2ee8d3d682776472b808b97',
  'apple-touch-icon.png': 'f11cec02567fcd0a60913657ad93249a57e3ecbd'
};

const SOURCE_SHA1 = 'b27b6d2f9f4a3119ac865ac7dc8056b16fc1c51b';

const forbiddenPatterns = [
  { file: 'favicon.svg', pattern: /M32 0H18L32 14Z/, reason: 'corner triangle in favicon.svg' },
  { file: 'favicon.svg', pattern: /<rect width="32" height="32" fill="#EFE8DC"\/>/, reason: 'cream corner icon in favicon.svg' }
];

function sha1File(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyFavicons() {
  const errors = [];

  const sourcePath = path.join(lockedDir, 'source.png');
  if (!fs.existsSync(sourcePath)) {
    errors.push('favicon-locked/source.png: missing high-quality master');
  } else if (sha1File(sourcePath) !== SOURCE_SHA1) {
    errors.push('favicon-locked/source.png: hash mismatch (do not overwrite the 1024 master)');
  }

  for (const { file, pattern, reason } of forbiddenPatterns) {
    const fullPath = path.join(publicDir, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    if (pattern.test(content)) {
      errors.push(`${file}: ${reason}`);
    }
  }

  for (const [file, expectedHash] of Object.entries(CANONICAL_SHA1)) {
    const fullPath = path.join(publicDir, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`${file}: missing`);
      continue;
    }
    const hash = sha1File(fullPath);
    if (hash !== expectedHash) {
      errors.push(`${file}: hash mismatch (expected locked cream T)`);
    }
  }

  if (errors.length) {
    console.error('Favicon verification failed:\n');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('Favicon verification passed: locked cream-background T (1024 master intact).');
}

if (require.main === module) {
  verifyFavicons();
}

module.exports = { verifyFavicons, CANONICAL_SHA1, SOURCE_SHA1 };
