const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../../public');
const forbiddenPatterns = [
  { file: 'favicon.svg', pattern: /M32 0H18L32 14Z/, reason: 'corner triangle in favicon.svg' },
  { file: 'favicon.svg', pattern: /<rect width="32" height="32" fill="#EFE8DC"\/>/, reason: 'cream corner icon in favicon.svg' }
];

function extractPngsFromIco(buf) {
  const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
  const pngs = [];
  let idx = 0;
  while ((idx = buf.indexOf(pngSig, idx)) !== -1) {
    const end = buf.indexOf(Buffer.from('IEND'), idx);
    if (end === -1) break;
    pngs.push(buf.slice(idx, end + 8));
    idx += 1;
  }
  return pngs;
}

function pngHasTriangleColors(png) {
  // Triangle favicon uses cream #EFE8DC (239,232,220) and orange #C16A28 (193,106,40)
  let cream = 0;
  let orange = 0;
  for (let i = 0; i < png.length - 3; i += 4) {
    const r = png[i];
    const g = png[i + 1];
    const b = png[i + 2];
    if (Math.abs(r - 239) < 8 && Math.abs(g - 232) < 8 && Math.abs(b - 220) < 8) cream++;
    if (Math.abs(r - 193) < 8 && Math.abs(g - 106) < 8 && Math.abs(b - 40) < 8) orange++;
  }
  return cream > 20 && orange > 10;
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

  const svg = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8');
  if (!svg.includes('>T</text>')) {
    errors.push('favicon.svg: must contain Georgia T letter');
  }

  const ico = fs.readFileSync(path.join(publicDir, 'favicon.ico'));
  const embedded = extractPngsFromIco(ico);
  if (embedded.length === 0) {
    errors.push('favicon.ico: no embedded PNG found');
  } else if (embedded.some(pngHasTriangleColors)) {
    errors.push('favicon.ico: contains corner-triangle icon (must be red T only)');
  }

  for (const size of [16, 32, 48]) {
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

  console.log('Favicon verification passed: red Georgia T on all assets.');
}

if (require.main === module) {
  verifyFavicons();
}

module.exports = { verifyFavicons };
