const fs = require('fs');
const path = require('path');
const { verifyFavicons } = require('./verify-favicon');

const lockedDir = path.join(__dirname, 'favicon-locked');
const publicDir = path.join(__dirname, '../../public');
const FILES = [
  'favicon-16.png',
  'favicon-32.png',
  'favicon-48.png',
  'apple-touch-icon.png'
];

for (const file of FILES) {
  const from = path.join(lockedDir, file);
  const to = path.join(publicDir, file);
  if (!fs.existsSync(from)) {
    console.error(`Locked copy missing: ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(from, to);
  console.log(`restored ${file}`);
}

verifyFavicons();

const seoPath = path.join(__dirname, '../utils/seo.js');
const seoSrc = fs.readFileSync(seoPath, 'utf8');
const versionMatch = seoSrc.match(/const FAVICON_VERSION = '(\d+)'/);
if (!versionMatch) {
  console.error('Could not bump FAVICON_VERSION in server/utils/seo.js');
  process.exit(1);
}
const nextVersion = String(Number(versionMatch[1]) + 1);
fs.writeFileSync(
  seoPath,
  seoSrc.replace(/const FAVICON_VERSION = '\d+'/, `const FAVICON_VERSION = '${nextVersion}'`)
);
console.log('Restored locked cream-background T from favicon-locked (master: source.png 1024x1024).');
console.log(`FAVICON_VERSION -> ${nextVersion} (cache bust so the tab drops any test icon)`);
