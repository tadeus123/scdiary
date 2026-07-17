const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../../public');

function readPngSize(png) {
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}

function createIcoFromPngs(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = [];
  const images = [];

  for (const png of pngBuffers) {
    const { width, height } = readPngSize(png);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    images.push(png);
    offset += png.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  return Buffer.concat([header, ...entries, ...images]);
}

function generateFaviconIco() {
  const png16 = fs.readFileSync(path.join(publicDir, 'favicon-16.png'));
  const png32 = fs.readFileSync(path.join(publicDir, 'favicon-32.png'));
  const ico = createIcoFromPngs([png16, png32]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
  console.log(`Wrote favicon.ico (${ico.length} bytes) from T PNGs`);
}

if (require.main === module) {
  generateFaviconIco();
}

module.exports = { createIcoFromPngs, generateFaviconIco };
