/**
 * Manual approve = mint claim with source=manual.
 * Usage:
 *   node airsup/china/approve-claim.js --domain=lk-moulds.com --email=sales@group.cn --note="replied Mar 12"
 */
require('dotenv').config();
const { mintClaim } = require('./mint-claim');

function arg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return '';
}

async function main() {
  const domain = arg('domain');
  const email = arg('email');
  const note = arg('note');
  const lang = arg('lang') || 'zh';
  if (!domain || !email) {
    console.error('Usage: node airsup/china/approve-claim.js --domain=example.com --email=sales@other.com [--note=...]');
    process.exit(1);
  }
  const result = await mintClaim({ domain, email, source: 'manual', note, lang });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
