#!/usr/bin/env node
/**
 * Fully revert Airsup / Supi discovery install.
 * Usage: node airsup/revert-airsup.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content, 'utf8');
  console.log('updated', rel);
}

function unlink(rel) {
  const full = path.join(root, rel);
  if (fs.existsSync(full)) {
    fs.unlinkSync(full);
    console.log('deleted', rel);
  }
}

function stripAirsupBlocks(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]*\/\/ AIRSUP-BEGIN[\s\S]*?\/\/ AIRSUP-END\n?/g, '')
    .replace(/[ \t]*<%# AIRSUP-BEGIN[\s\S]*?<%# AIRSUP-END %>\n?/g, '')
    .replace(/[ \t]*# AIRSUP-BEGIN[\s\S]*?# AIRSUP-END\n?/g, '');
}

function stripIndexInclude(content) {
  return content.replace(
    /[ \t]*<%- include\('partials\/airsup-supi-logo'\) %>\r?\n/,
    ''
  );
}

function stripVercelIncludes(content) {
  return content
    .replace(/\s*"server\/airsup-proxy\.js",?\n?/g, '\n')
    .replace(/\s*"server\/airsup-discovery-headers\.js",?\n?/g, '\n')
    .replace(/,\n(\s*\])/g, '\n$1');
}

// Restore robots from snapshot
write('public/robots.txt', read('airsup/snapshots/robots.txt.pre-airsup'));

write('server/server.js', stripAirsupBlocks(read('server/server.js')));
write('views/partials/seo-head.ejs', stripAirsupBlocks(read('views/partials/seo-head.ejs')));
write('server/utils/seo.js', stripAirsupBlocks(read('server/utils/seo.js')));
write('views/index.ejs', stripIndexInclude(read('views/index.ejs')));

if (fs.existsSync(path.join(root, 'vercel.json'))) {
  write('vercel.json', stripVercelIncludes(read('vercel.json')));
}

unlink('server/airsup-proxy.js');
unlink('server/airsup-discovery-headers.js');
unlink('views/partials/airsup-supi-logo.ejs');

console.log('\nAirsup code removed from app files.');
console.log('Next: review git diff, then commit & push.');
console.log('Optional: delete the airsup/ folder after you are done.');
console.log('See airsup/REVERT.md');
