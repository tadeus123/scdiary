/**
 * Email quotation-upload login links to live factories.
 * Usage:
 *   node airsup/china/send-quotes-invite.js --domain=china-3dprinting.com
 *   node airsup/china/send-quotes-invite.js --domain=china-3dprinting.com --domain=elite-machining.com
 */
const db = require('./db');
const session = require('./session');
const { sendQuotesInviteEmail } = require('./mail');
const { chinaVerifyUrl } = require('./origin');

function argsNamed(name) {
  const prefix = `--${name}=`;
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    const item = process.argv[i];
    if (item.startsWith(prefix)) values.push(item.slice(prefix.length));
    if (item === `--${name}` && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
      values.push(process.argv[i + 1]);
    }
  }
  return values.filter(Boolean);
}

async function sendForDomain(domain) {
  const company = await db.getByDomain(domain);
  if (!company) throw new Error(`Company not found: ${domain}`);
  if (!company.contact_email) throw new Error(`No contact_email for ${domain}`);
  const token = await session.createToken(company.company_id, company.contact_email, 'login');
  const link = chinaVerifyUrl(token, 'quotes');
  await sendQuotesInviteEmail({
    lang: company.locale === 'en' ? 'en' : 'zh',
    to: company.contact_email,
    link,
    contactName: company.contact_name,
    companyName: company.company_name_en || company.company_name,
  });
  return { domain, email: company.contact_email, link };
}

async function main() {
  require('dotenv').config();
  const domains = argsNamed('domain');
  if (!domains.length) {
    console.error('Usage: node airsup/china/send-quotes-invite.js --domain=example.com [--domain=other.com]');
    process.exit(1);
  }
  if (!db.isConfigured()) throw new Error('Database is not configured');
  for (const domain of domains) {
    const row = await sendForDomain(domain);
    console.log(JSON.stringify(row));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { sendForDomain };
