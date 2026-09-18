#!/usr/bin/env node
/**
 * Fully revert the /games page install.
 * Usage: node games/revert-games.js
 *
 * Does not drop remote Supabase tables. See games/sql/drop.sql.
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

function stripGamesBlocks(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]*\/\/ GAMES-BEGIN[\s\S]*?\/\/ GAMES-END\n?/g, '');
}

function stripVercelIncludes(content) {
  return content
    .replace(/\s*"games\/\*\*",?\n?/g, '\n')
    .replace(/,\n(\s*\])/g, '\n$1');
}

write('server/server.js', stripGamesBlocks(read('server/server.js')));

if (fs.existsSync(path.join(root, 'vercel.json'))) {
  write('vercel.json', stripVercelIncludes(read('vercel.json')));
}

unlink('.cursor/rules/games.mdc');

console.log('\nGames code removed from app files.');
console.log('Next: delete the games/ folder, review git diff, then commit & push.');
console.log('If the table was created, run games/sql/drop.sql in Supabase first.');
console.log('See games/REVERT.md');
