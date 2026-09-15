/**
 * Mint outreach/manual claim links for Airsup China.
 * Usage:
 *   node airsup/china/mint-claim.js --domain=lk-moulds.com --email=sales@group.cn --source=outreach
 *   node airsup/china/mint-claim.js --domain=adm.com --email=info@adm-group.cn --source=manual --note="replied Mar 12"
 */
require('dotenv').config();
const { normalizeDomain, emailParts, isFreeMail } = require('./domain');
const db = require('./db');
const session = require('./session');
const { buildPreview, companyDraftFromPreview } = require('./site-preview');
const { fillEmptyCompany, canPublish } = require('./fields');

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

function publicBase() {
  return String(process.env.PUBLIC_BASE_URL || process.env.SITE_URL || 'https://www.tademehl.com').replace(/\/$/, '');
}

async function mintClaim({ domain, email, source, note, lang }) {
  const site = normalizeDomain(domain);
  const parts = emailParts(email);
  if (!site) throw new Error('Invalid domain');
  if (!parts) throw new Error('Invalid email');
  if (isFreeMail(parts.domain)) throw new Error('Free-mail addresses are not allowed');
  if (!db.isConfigured()) throw new Error('Database is not configured');

  const sourceValue = source === 'manual' ? 'manual' : 'outreach';
  await db.upsertDomainAllow({
    domain: site,
    contact_email: parts.email,
    source: sourceValue,
    note: note || '',
  });

  let company = await db.getByDomain(site);
  if (!company) {
    company = await db.insertCompany({
      domain: site,
      website: `https://${site}`,
      contact_email: parts.email,
      contact_name: '',
      city: 'shenzhen',
      locale: lang === 'en' ? 'en' : 'zh',
      niche: 'cnc',
      status: 'pending',
      source: sourceValue,
    });
  } else if (company.status === 'pending') {
    company = await db.updateCompany(company.company_id, {
      contact_email: parts.email,
      source: sourceValue,
      website: company.website || `https://${site}`,
    });
  } else if (String(company.contact_email || '').toLowerCase() !== parts.email) {
    throw new Error(`Domain already claimed by ${company.contact_email}. Use that mailbox or pause/reset first.`);
  }

  try {
    const built = await buildPreview(site, lang === 'en' ? 'en' : 'zh');
    if (built.ok) {
      const draft = companyDraftFromPreview(built);
      if (!draft.goal) {
        draft.goal = lang === 'en'
          ? 'Receive qualified RFQs from Western buyers who find us in ChatGPT.'
          : '让在 ChatGPT 里找到我们的西方采购把合格询盘发到邮箱。';
      }
      company = await db.updateCompany(company.company_id, fillEmptyCompany(company, draft));
    }
  } catch (error) {
    console.error('Scrape draft skipped:', error.message);
  }

  const token = await session.createToken(company.company_id, parts.email, 'claim');
  const link = `${publicBase()}/airsup/china/claim?token=${token}`;
  return {
    domain: site,
    email: parts.email,
    source: sourceValue,
    company_id: company.company_id,
    status: company.status,
    can_publish: canPublish(company),
    link,
  };
}

async function main() {
  const domain = arg('domain');
  const email = arg('email');
  const source = arg('source') || 'outreach';
  const note = arg('note');
  const lang = arg('lang') || 'zh';
  if (!domain || !email) {
    console.error('Usage: node airsup/china/mint-claim.js --domain=example.com --email=sales@other.com [--source=outreach|manual] [--note=...]');
    process.exit(1);
  }
  const result = await mintClaim({ domain, email, source, note, lang });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { mintClaim };
