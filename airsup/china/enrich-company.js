/**
 * Empty-only enrichment for Airsup China factories from their own websites.
 * Usage:
 *   node airsup/china/enrich-company.js --domain=ptms-mold.com
 *   node airsup/china/enrich-company.js --all-live --limit=20
 */
const { enrichByDomain, enrichAllLive } = require('./enrich');

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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const lang = arg('lang') === 'en' ? 'en' : 'zh';
  if (hasFlag('all-live')) {
    const limit = Number(arg('limit') || 20);
    const result = await enrichAllLive({ limit, lang });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const domain = arg('domain');
  if (!domain) {
    console.error('Usage: node airsup/china/enrich-company.js --domain=example.com');
    console.error('   or: node airsup/china/enrich-company.js --all-live --limit=20');
    process.exitCode = 1;
    return;
  }
  const result = await enrichByDomain(domain, { lang });
  console.log(JSON.stringify({
    ok: result.ok,
    domain: result.domain,
    company_id: result.company_id,
    status: result.status,
    before_fields: result.before_fields,
    after_fields: result.after_fields,
    filled_delta: result.filled_delta,
    crawl_pages: result.crawl_pages,
    gaps: result.gaps,
    checklist: result.checklist,
    error: result.error || null,
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
