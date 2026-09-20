const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const flatServer = path.join(root, 'server.js');
const nestedServer = path.join(root, 'server', 'server.js');
const serverPath = fs.existsSync(flatServer) ? flatServer : nestedServer;
const vercelPath = path.join(root, 'vercel.json');

function stripBlock(src, begin, end) {
  const re = new RegExp(`\\n?// ${begin}[\\s\\S]*?// ${end}\\n?`, 'g');
  return src.replace(re, '\n');
}

if (!fs.existsSync(serverPath)) {
  console.log('server file not found');
} else {
  let server = fs.readFileSync(serverPath, 'utf8');
  const nextServer = stripBlock(server, 'AIRSUP20-BEGIN', 'AIRSUP20-END');
  if (nextServer === server) {
    console.log(`${path.relative(root, serverPath)}: no AIRSUP20 block found`);
  } else {
    fs.writeFileSync(serverPath, nextServer);
    console.log(`${path.relative(root, serverPath)}: removed AIRSUP20 block`);
  }
}

if (fs.existsSync(vercelPath)) {
  const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
  const build = vercel.builds && vercel.builds[0];
  const files = build && build.config && build.config.includeFiles;
  if (Array.isArray(files)) {
    const filtered = files.filter((f) => f !== 'airsup20/**');
    if (filtered.length !== files.length) {
      build.config.includeFiles = filtered;
      fs.writeFileSync(vercelPath, `${JSON.stringify(vercel, null, 2)}\n`);
      console.log('vercel.json: removed airsup20/**');
    }
  }
}

console.log('Airsup20 mount stripped. Delete airsup20/ and run sql/drop.sql on the Airsup factory Supabase only (airsup20_* tables). Do not drop airsup_china_*.');
