/**
 * Mint outreach/manual claim links for Airsup China.
 * Usage:
 *   node airsup/china/mint-claim.js --domain=lk-moulds.com --email=sales@group.cn --source=outreach
 *   node airsup/china/mint-claim.js --domain=adm.com --email=info@adm-group.cn --source=manual --note="replied Mar 12"
 */
const { normalizeDomain, emailParts, isFreeMail } = require('./domain');
const db = require('./db');
const session = require('./session');
const { buildPreview, companyDraftFromPreview } = require('./site-preview');
const { fillEmptyCompany, canPublish, normalizeProfile } = require('./fields');
const { chinaClaimUrl } = require('./origin');

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

async function mintClaim({ domain, email, source, note, lang, company_id: companyId }) {
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

  let company = null;
  if (companyId) {
    company = await db.getById(companyId);
    if (!company) throw new Error('Company not found');
    if (String(company.domain || '').toLowerCase() !== site) {
      throw new Error('company_id domain mismatch');
    }
  } else {
    company = await db.getByDomain(site);
  }

  if (company && company.status === 'live') {
    throw new Error('Factory is already live. Do not mint a new claim link.');
  }

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
    const existingEmail = String(company.contact_email || '').toLowerCase();
    if (existingEmail && existingEmail !== parts.email) {
      throw new Error(`Pending factory already bound to ${company.contact_email}.`);
    }
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
    if (built.ok && company.status === 'pending') {
      const draft = companyDraftFromPreview(built);
      if (!draft.goal) {
        draft.goal = lang === 'en'
          ? 'Receive qualified RFQs from Western buyers who find us in ChatGPT.'
          : '让在 ChatGPT 里找到我们的西方采购把合格询盘发到邮箱。';
      }
      const filled = fillEmptyCompany(company, draft);
      company = await db.updateCompany(company.company_id, {
        company_name: filled.company_name,
        company_name_en: filled.company_name_en,
        city: filled.city,
        niche: filled.niche,
        context: filled.context,
        goal: filled.goal,
        profile: normalizeProfile(filled.profile),
      });
    }
  } catch (error) {
    console.error('Scrape draft skipped:', error.message);
  }

  const token = await session.createToken(company.company_id, parts.email, 'claim');
  const link = chinaClaimUrl(token);
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
  require('dotenv').config();
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
