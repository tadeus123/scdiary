const fs = require('fs');
const path = require('path');
const { verifyFavicons } = require('./verify-favicon');

const lockedDir = path.join(__dirname, 'favicon-locked');
const publicDir = path.join(__dirname, '../../public');
const FILES = [
  'favicon-16.png',
  'favicon-32.png',
  'favicon-48.png',
  'favicon.svg',
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
console.log('Restored locked red Georgia T (heightRatio=1.02, yShiftRatio=0.05).');
