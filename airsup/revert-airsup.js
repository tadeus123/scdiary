#!/usr/bin/env node
/**
 * Fully revert the /airsup page install.
 * Usage: node airsup/revert-airsup.js
 *
 * Does not drop remote Supabase tables. See airsup/sql/drop.sql.
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
    .replace(/[ \t]*\/\/ AIRSUP-BEGIN[\s\S]*?\/\/ AIRSUP-END\n?/g, '');
}

function stripVercelIncludes(content) {
  return content
    .replace(/\s*"airsup\/\*\*",?\n?/g, '\n')
    .replace(/,\n(\s*\])/g, '\n$1');
}

write('server/server.js', stripAirsupBlocks(read('server/server.js')));

if (fs.existsSync(path.join(root, 'vercel.json'))) {
  write('vercel.json', stripVercelIncludes(read('vercel.json')));
}

unlink('.cursor/rules/airsup.mdc');

console.log('\nAirsup code removed from app files.');
console.log('Next: delete the airsup/ folder, review git diff, then commit & push.');
console.log('If tables were created, run airsup/sql/drop.sql in Supabase first.');
console.log('See airsup/REVERT.md');
