/**
 * Light funnel snapshot for Airsup China activation.
 * Usage: node airsup/china/funnel-status.js
 */
require('dotenv').config();
const db = require('./db');

async function main() {
  if (!db.isConfigured()) throw new Error('Database is not configured');
  const [live, companies, allows] = await Promise.all([
    db.listLive(),
    db.listCompanies(),
    db.listDomainAllows(),
  ]);
  const byStatus = companies.reduce((acc, row) => {
    const key = row.status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const opened = allows.filter((row) => row.claim_opened_at).length;
  const publishedFromAllow = allows.filter((row) => row.published_at).length;
  const summary = {
    metric: 'outreach → clicked claim → published → live → first inquiry',
    live: live.length,
    companies_by_status: byStatus,
    allows_total: allows.length,
    allows_claim_opened: opened,
    allows_published: publishedFromAllow,
    allows: allows.map((row) => ({
      domain: row.domain,
      email: row.contact_email,
      source: row.source,
      opened: Boolean(row.claim_opened_at),
      published: Boolean(row.published_at),
      note: row.note || '',
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
