const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const publicDir = path.join(__dirname, '../../public');

// Locked tab icons: large Georgia T, #941E2F, shifted down for tab alignment.
// Exact geometry is in server/scripts/favicon-locked/LOCKED.json
const CANONICAL_SHA1 = {
  'favicon-16.png': '213334de66ed91417eeba664c1d70f87def79506',
  'favicon-32.png': '21afbae306533db99c7e073d766dd49f6c97eb9f',
  'favicon-48.png': '888bca28b030f62e4da083bf0aefc34c0b933326',
  'favicon.svg': '2b9e80ebd156bf42ad24d37502d5f2ac0bb64a22',
  'apple-touch-icon.png': '20d7e10ea876d46dd2f9f5152af2ed5cbbaa8dd5'
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
    if (!fs.existsSync(fullPath)) {
      errors.push(`${file}: missing`);
      continue;
    }
    const hash = sha1File(fullPath);
    if (hash !== expectedHash) {
      errors.push(`${file}: hash mismatch (expected locked large Georgia T)`);
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
