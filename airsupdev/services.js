const crypto = require('crypto');
const chinaDb = require('../airsup/china/db');
const { mintClaim } = require('../airsup/china/mint-claim');
const { buildPreview, companyDraftFromPreview } = require('../airsup/china/site-preview');
const { findForPlugin } = require('../airsup/china/find');
const {
  canPublish,
  publishGaps,
  endpointRecord,
  listingText,
  buyerTestPrompt,
  fillEmptyCompany,
  normalizeProfile,
  normalizeEnrichment,
  normalizeNiche,
  normalizeActions,
  countFilledBuyerFields,
  enrichmentGaps,
  DEFAULT_ACTIONS,
  NICHES,
  CITIES,
} = require('../airsup/china/fields');
const {
  enrichCompany,
  confirmChecklist,
  gapEmailBody,
  storeDiscoveryScore,
} = require('../airsup/china/enrich');
const {
  normalizeDomain,
  emailParts,
  isFreeMail,
  emailAllowedForSite,
} = require('../airsup/china/domain');
const session = require('../airsup/china/session');
const { sendVerifyEmail } = require('../airsup/china/mail');
const { chinaVerifyUrl, chinaLiveJsonUrl, chinaEndpointUrl } = require('../airsup/china/origin');
const facts = require('../airsup/china/facts');
const factsStore = require('../airsup/china/facts-store');
const quotations = require('../airsup/china/quotations');

function requireChinaDb() {
  if (!chinaDb.isConfigured()) {
    const error = new Error('Airsup China database is not configured');
    error.code = -32001;
    throw error;
  }
}

function summarizeCompany(company, allow) {
  if (!company) return null;
  return {
    company_id: company.company_id,
    domain: company.domain,
    website: company.website,
    company_name: company.company_name,
    company_name_en: company.company_name_en,
    city: company.city,
    niche: company.niche,
    contact_email: company.contact_email,
    contact_name: company.contact_name,
    status: company.status,
    source: company.source,
    can_publish: canPublish(company),
    publish_gaps: publishGaps(company),
    verified_at: company.verified_at || null,
    live_at: company.live_at || null,
    allow: allow
      ? {
          source: allow.source,
          note: allow.note || '',
          claim_opened_at: allow.claim_opened_at || null,
          bounced_at: allow.bounced_at || null,
          bounce_type: allow.bounce_type || null,
          published_at: allow.published_at || null,
        }
      : null,
  };
}

async function resolveCompany(args = {}, { allowFuzzy = false } = {}) {
  requireChinaDb();
  const companyId = String(args.company_id || args.supplier_id || '').trim();
  if (companyId) {
    const row = await chinaDb.getById(companyId);
    if (row) return row;
    return null;
  }
  const domain = normalizeDomain(args.domain || args.website || '');
  if (domain) {
    const row = await chinaDb.getByDomain(domain);
    if (row) return row;
    if (!allowFuzzy) return null;
  }
  const email = String(args.email || args.contact_email || '').trim().toLowerCase();
  if (email && !allowFuzzy) {
    const all = await chinaDb.listCompanies();
    const hits = all.filter((row) => String(row.contact_email || '').toLowerCase() === email);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      const error = new Error('ambiguous_email');
      error.code = 'ambiguous';
      error.matches = hits.map((row) => ({ company_id: row.company_id, domain: row.domain, status: row.status }));
      throw error;
    }
    return null;
  }
  if (!allowFuzzy) return null;
  const name = String(args.name || args.company_name || args.query || '').trim().toLowerCase();
  if (name && name.length >= 2) {
    const all = await chinaDb.listCompanies();
    const hit = all.find((row) => {
      const zh = String(row.company_name || '').toLowerCase();
      const en = String(row.company_name_en || '').toLowerCase();
      return zh.includes(name) || en.includes(name) || String(row.domain || '').includes(name);
    });
    if (hit) return hit;
  }
  return null;
}

async function resolveCompanyExact(args = {}) {
  try {
    return await resolveCompany(args, { allowFuzzy: false });
  } catch (error) {
    if (error && error.code === 'ambiguous') {
      return { __ambiguous: true, matches: error.matches };
    }
    throw error;
  }
}

function deriveOnboardingStatus({ company, allow, tokens, events }) {
  return facts.deriveOnboardingStatus({ company, allow, tokens, events });
}

async function lookupSupplier(args = {}) {
  requireChinaDb();
  const query = String(args.query || args.domain || args.email || args.name || '').trim();
  const all = await chinaDb.listCompanies();
  const domain = normalizeDomain(args.domain || query);
  const email = String(args.email || '').trim().toLowerCase()
    || (query.includes('@') ? query.toLowerCase() : '');
  const name = String(args.name || (!domain && !email ? query : '')).trim().toLowerCase();

  let matches = [];
  if (domain) {
    matches = all.filter((row) => String(row.domain || '').toLowerCase() === domain);
  } else if (email) {
    matches = all.filter((row) => String(row.contact_email || '').toLowerCase() === email);
  } else if (name) {
    matches = all.filter((row) => {
      const zh = String(row.company_name || '').toLowerCase();
      const en = String(row.company_name_en || '').toLowerCase();
      return zh.includes(name) || en.includes(name) || String(row.domain || '').includes(name);
    }).slice(0, 20);
  }

  const primary = matches[0] || null;
  let allow = null;
  if (primary) {
    allow = await chinaDb.getDomainAllow(primary.domain, primary.contact_email).catch(() => null);
  }

  const duplicates = [];
  if (primary && primary.contact_email) {
    for (const row of all) {
      if (row.company_id === primary.company_id) continue;
      if (String(row.contact_email || '').toLowerCase() === String(primary.contact_email).toLowerCase()) {
        duplicates.push({ company_id: row.company_id, domain: row.domain, status: row.status });
      }
    }
  }

  return {
    ok: true,
    found: Boolean(primary),
    supplier: summarizeCompany(primary, allow),
    matches: matches.map((row) => ({
      company_id: row.company_id,
      domain: row.domain,
      status: row.status,
      contact_email: row.contact_email,
      company_name: row.company_name || row.company_name_en,
    })),
    duplicates,
  };
}

async function createSupplierDraft(args = {}) {
  requireChinaDb();
  const domain = normalizeDomain(args.domain || args.website || '');
  if (!domain) return { ok: false, error: 'invalid_domain' };
  if (isFreeMail(domain)) return { ok: false, error: 'website_public' };

  let email = '';
  if (args.email) {
    const parts = emailParts(args.email);
    if (!parts) return { ok: false, error: 'invalid_email' };
    if (isFreeMail(parts.domain)) return { ok: false, error: 'free_mail' };
    email = parts.email;
  }

  const lang = args.lang === 'en' ? 'en' : 'zh';
  let company = await chinaDb.getByDomain(domain);
  if (company && company.status === 'live') {
    return { ok: false, error: 'already_live', supplier: summarizeCompany(company, null) };
  }
  if (company && company.status !== 'pending' && email && email !== String(company.contact_email || '').toLowerCase()) {
    return { ok: false, error: 'domain_taken_other_email', contact_email: company.contact_email };
  }

  if (!company) {
    company = await chinaDb.insertCompany({
      domain,
      website: `https://${domain}`,
      contact_email: email || '',
      contact_name: String(args.contact_name || '').trim(),
      city: 'shenzhen',
      locale: lang,
      niche: args.niche ? normalizeNiche(args.niche) : 'other',
      status: 'pending',
      source: String(args.source || 'outreach').slice(0, 40),
    });
  } else if (company.status === 'pending') {
    const existingEmail = String(company.contact_email || '').toLowerCase();
    if (email && existingEmail && existingEmail !== email) {
      return { ok: false, error: 'domain_taken_other_email', contact_email: company.contact_email };
    }
    company = await chinaDb.updateCompany(company.company_id, {
      website: company.website || `https://${domain}`,
      contact_email: email || company.contact_email,
      contact_name: String(args.contact_name || company.contact_name || '').trim(),
      locale: lang,
    });
  } else if (company.status !== 'pending') {
    return { ok: false, error: 'not_pending', status: company.status };
  }

  const built = await buildPreview(domain, lang);
  if (built.ok) {
    const draft = companyDraftFromPreview(built);
    if (!draft.goal) {
      draft.goal = lang === 'en'
        ? 'Receive qualified RFQs from Western buyers who find us in ChatGPT.'
        : '让在 ChatGPT 里找到我们的西方采购把合格询盘发到邮箱。';
    }
    if (args.company_name) draft.company_name = String(args.company_name).slice(0, 120);
    if (args.company_name_en) draft.company_name_en = String(args.company_name_en).slice(0, 120);
    company = await chinaDb.updateCompany(company.company_id, fillEmptyCompany(company, draft));
  } else if (args.company_name || args.company_name_en) {
    company = await chinaDb.updateCompany(company.company_id, {
      company_name: String(args.company_name || company.company_name || '').slice(0, 120),
      company_name_en: String(args.company_name_en || company.company_name_en || '').slice(0, 120),
    });
  }

  return {
    ok: true,
    supplier: summarizeCompany(company, null),
    scraped: Boolean(built && built.ok),
    card: endpointRecord(company),
  };
}

async function getSupplierCard(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  return {
    ok: true,
    company_id: company.company_id,
    status: company.status,
    discoverable: company.status === 'live',
    card: endpointRecord(company),
    listing_text: listingText(company),
  };
}

async function updateSupplierCard(args = {}) {
  requireChinaDb();
  const company = await resolveCompanyExact(args);
  if (company && company.__ambiguous) {
    return { ok: false, error: 'ambiguous', matches: company.matches };
  }
  if (!company) return { ok: false, error: 'supplier_not_found', hint: 'Pass company_id or exact domain' };
  if (company.status === 'live' && args.force !== true) {
    return { ok: false, error: 'live_locked', hint: 'Pass force:true to edit a live factory card' };
  }

  const patch = {};
  if (args.company_name != null) patch.company_name = String(args.company_name).slice(0, 120);
  if (args.company_name_en != null) patch.company_name_en = String(args.company_name_en).slice(0, 120);
  if (args.website != null) {
    const site = normalizeDomain(args.website);
    if (!site || isFreeMail(site)) return { ok: false, error: 'invalid_website' };
    if (site !== company.domain) return { ok: false, error: 'website_domain_locked' };
    patch.website = `https://${site}`;
  }
  if (args.city != null) {
    const city = String(args.city).trim().toLowerCase();
    patch.city = CITIES.some((item) => item.id === city) ? city : company.city;
  }
  if (args.niche != null) patch.niche = normalizeNiche(args.niche);
  if (args.context != null) patch.context = String(args.context).slice(0, 4000);
  if (args.goal != null) patch.goal = String(args.goal).slice(0, 1000);
  if (args.contact_name != null) patch.contact_name = String(args.contact_name).slice(0, 120);
  if (args.contact_email != null) {
    const parts = emailParts(args.contact_email);
    if (!parts) return { ok: false, error: 'invalid_email' };
    if (isFreeMail(parts.domain)) return { ok: false, error: 'free_mail' };
    if (company.status !== 'pending' && parts.email !== String(company.contact_email || '').toLowerCase()) {
      return { ok: false, error: 'contact_email_locked' };
    }
    patch.contact_email = parts.email;
  }
  if (args.actions != null) patch.actions = normalizeActions(args.actions);
  if (args.profile != null && typeof args.profile === 'object') {
    patch.profile = normalizeProfile({ ...normalizeProfile(company.profile), ...args.profile });
  }

  const next = await chinaDb.updateCompany(company.company_id, patch);
  return {
    ok: true,
    supplier: summarizeCompany(next, null),
    can_publish: canPublish(next),
    card: endpointRecord(next),
  };
}

async function createMagicLink(args = {}) {
  requireChinaDb();
  const domain = normalizeDomain(args.domain || args.website || '');
  const parts = emailParts(args.email || args.contact_email || '');
  if (!domain) return { ok: false, error: 'invalid_domain' };
  if (!parts) return { ok: false, error: 'invalid_email' };
  const source = args.source === 'manual' ? 'manual' : 'outreach';
  try {
    const result = await mintClaim({
      domain,
      email: parts.email,
      source,
      note: String(args.note || '').slice(0, 500),
      lang: args.lang === 'en' ? 'en' : 'zh',
      company_id: String(args.company_id || '').trim() || undefined,
      niche: args.niche,
    });
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message || 'mint_failed' };
  }
}

async function getOnboardingStatus(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, state: 'blocked', reason: 'supplier_not_found' };
  const allow = await chinaDb.getDomainAllow(company.domain, company.contact_email).catch(() => null);
  const tokens = await chinaDb.listTokensForCompany(company.company_id).catch(() => []);
  const events = typeof chinaDb.listFunnelEvents === 'function'
    ? await chinaDb.listFunnelEvents(company.company_id).catch(() => [])
    : [];
  const derived = deriveOnboardingStatus({ company, allow, tokens, events });
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    status: company.status,
    ...derived,
    claim_page_viewed: Boolean(allow && allow.claim_opened_at),
    email_verified: Boolean(company.verified_at || company.status === 'verified' || company.status === 'live'),
    page_viewed_at: (allow && allow.claim_opened_at) || null,
    email_verified_at: company.verified_at || null,
    can_publish: canPublish(company),
    publish_gaps: publishGaps(company),
    allow: allow
      ? {
        source: allow.source,
        claim_opened_at: allow.claim_opened_at,
        published_at: allow.published_at,
        bounced_at: allow.bounced_at || null,
        bounce_type: allow.bounce_type || null,
      }
      : null,
  };
}

async function verifySupplier(args = {}) {
  const method = String(args.method || '').trim();
  if (method === 'dns' || method === 'website_token') {
    return { ok: false, supported: false, error: 'not_built_yet', method };
  }
  if (!['manual', 'email_link', 'site_listed'].includes(method)) {
    return { ok: false, error: 'invalid_method', supported_methods: ['manual', 'email_link', 'site_listed'] };
  }
  requireChinaDb();

  const company = await resolveCompanyExact(args);
  if (company && company.__ambiguous) {
    return { ok: false, error: 'ambiguous', matches: company.matches };
  }
  if (!company) return { ok: false, error: 'supplier_not_found', hint: 'Pass company_id or exact domain' };
  const email = String(args.email || company.contact_email || '').trim().toLowerCase();
  const parts = emailParts(email);
  if (!parts) return { ok: false, error: 'invalid_email' };
  if (isFreeMail(parts.domain)) return { ok: false, error: 'free_mail' };

  if (method === 'manual') {
    const note = String(args.note || '').trim();
    if (!note) return { ok: false, error: 'note_required', hint: 'Manual verify requires a note for audit' };
    if (args.confirm !== true) {
      return { ok: false, error: 'confirm_required', hint: 'Pass confirm:true for manual verification' };
    }
    await chinaDb.upsertDomainAllow({
      domain: company.domain,
      contact_email: parts.email,
      source: 'manual',
      note: note.slice(0, 500),
    });
    let next = company;
    if (company.status === 'pending') {
      next = await chinaDb.updateCompany(company.company_id, {
        contact_email: parts.email,
        status: 'verified',
        verified_at: company.verified_at || new Date().toISOString(),
      });
    } else if (company.status === 'live') {
      return { ok: false, error: 'already_live' };
    } else {
      return {
        ok: true,
        method: 'manual',
        already_verified: true,
        supplier: summarizeCompany(company, await chinaDb.getDomainAllow(company.domain, company.contact_email)),
      };
    }
    return {
      ok: true,
      method: 'manual',
      supplier: summarizeCompany(next, await chinaDb.getDomainAllow(next.domain, next.contact_email)),
    };
  }

  if (method === 'site_listed') {
    const built = await buildPreview(company.website || company.domain, 'en');
    const siteEmails = (built.ok && built.siteEmails) || [];
    const allowed = emailAllowedForSite({
      website: company.domain,
      email: parts.email,
      siteEmails,
    });
    if (!allowed.ok) {
      return { ok: false, method: 'site_listed', error: allowed.error || 'mismatch', siteEmails };
    }
    await chinaDb.upsertDomainAllow({
      domain: company.domain,
      contact_email: parts.email,
      source: 'site',
      note: 'email listed on website',
    });
    let next = company;
    if (company.status === 'pending') {
      next = await chinaDb.updateCompany(company.company_id, {
        contact_email: parts.email,
        status: 'verified',
        verified_at: company.verified_at || new Date().toISOString(),
      });
    }
    return { ok: true, method: 'site_listed', reason: allowed.reason, siteEmails, supplier: summarizeCompany(next, null) };
  }

  // email_link — do not return raw verify URL (complete via inbox)
  if (company.status === 'live') return { ok: false, error: 'already_live' };
  if (company.status !== 'pending' && parts.email !== String(company.contact_email || '').toLowerCase()) {
    return { ok: false, error: 'contact_email_locked' };
  }
  await chinaDb.updateCompany(company.company_id, { contact_email: parts.email });
  const token = await session.createToken(company.company_id, parts.email, company.status === 'pending' ? 'verify' : 'login');
  const link = chinaVerifyUrl(token);
  await sendVerifyEmail({
    lang: args.lang === 'en' ? 'en' : 'zh',
    to: parts.email,
    link,
    contactName: company.contact_name,
  });
  await chinaDb.updateCompany(company.company_id, { last_email_at: new Date().toISOString() });
  return { ok: true, method: 'email_link', email: parts.email, emailed: true };
}

async function publishSupplier(args = {}) {
  requireChinaDb();
  const company = await resolveCompanyExact(args);
  if (company && company.__ambiguous) {
    return { ok: false, error: 'ambiguous', matches: company.matches };
  }
  if (!company) return { ok: false, error: 'supplier_not_found', hint: 'Pass company_id or exact domain' };
  if (!canPublish(company)) {
    return { ok: false, error: 'cannot_publish', status: deriveOnboardingStatus({ company, allow: null, tokens: [] }) };
  }
  if (company.status !== 'verified' && company.status !== 'live') {
    return { ok: false, error: 'not_verified', status: company.status };
  }
  if (company.status === 'live') {
    return { ok: true, already_live: true, supplier: summarizeCompany(company, null) };
  }
  const next = await chinaDb.updateCompany(company.company_id, {
    status: 'live',
    live_at: new Date().toISOString(),
    verified_at: company.verified_at || new Date().toISOString(),
  });
  await chinaDb.touchDomainAllow(next.domain, next.contact_email, {
    published_at: new Date().toISOString(),
  }).catch(() => null);
  return { ok: true, supplier: summarizeCompany(next, null), card: endpointRecord(next) };
}

async function testSupplierDiscovery(args = {}) {
  requireChinaDb();
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const query = String(args.query || args.buyer_query || '').trim();
  if (!query) return { ok: false, error: 'missing_query' };
  if (company.status !== 'live') {
    return {
      ok: true,
      surfaced: false,
      reason: 'not_live',
      status: company.status,
      query,
    };
  }
  const matches = await findForPlugin({ query, limit: Number(args.limit) || 10 });
  const hit = matches.find((row) => row.person_id === company.company_id);
  const result = {
    ok: true,
    surfaced: Boolean(hit),
    query,
    score: hit ? hit.score : 0,
    match: hit || null,
    card: endpointRecord(company),
    other_matches: matches.filter((row) => row.person_id !== company.company_id).slice(0, 5),
  };
  if (args.store_score !== false) {
    try {
      await storeDiscoveryScore(company, result);
    } catch (_) {
      // discovery score is best-effort private metadata
    }
  }
  return result;
}

async function enrichSupplier(args = {}) {
  requireChinaDb();
  const company = await resolveCompanyExact(args);
  if (company && company.__ambiguous) {
    return { ok: false, error: 'ambiguous', matches: company.matches };
  }
  if (!company) return { ok: false, error: 'supplier_not_found', hint: 'Pass company_id or exact domain' };
  const result = await enrichCompany(company, { lang: args.lang === 'en' ? 'en' : 'zh' });
  if (!result.ok) return result;
  let discovery = null;
  if (args.run_discovery && result.company && result.company.status === 'live') {
    const query = String(args.discovery_query || '').trim() || buyerTestPrompt(result.company);
    discovery = await testSupplierDiscovery({
      company_id: result.company_id,
      query,
      store_score: true,
    });
  }
  return {
    ok: true,
    company_id: result.company_id,
    domain: result.domain,
    status: result.status,
    before_fields: result.before_fields,
    after_fields: result.after_fields,
    filled_delta: result.filled_delta,
    crawl_pages: result.crawl_pages,
    gaps: result.gaps,
    checklist: result.checklist,
    discovery,
    card: endpointRecord(result.company),
  };
}

async function getEnrichmentGaps(args = {}) {
  requireChinaDb();
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const gaps = enrichmentGaps(company);
  const checklist = confirmChecklist(company);
  const enrichment = normalizeEnrichment(company.profile && company.profile.enrichment);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    status: company.status,
    filled_fields: countFilledBuyerFields(company),
    gaps,
    checklist,
    last_discovery: enrichment.last_discovery,
    gap_email_draft: {
      to: company.contact_email || '',
      subject: 'Add a few details so ChatGPT can answer buyers faster',
      body: gapEmailBody(company),
    },
  };
}

async function generateDemo(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    status: company.status,
    discoverable: company.status === 'live',
    buyer_prompt: buyerTestPrompt(company),
    listing_text: listingText(company),
    card: endpointRecord(company),
    live_json_url: chinaLiveJsonUrl(),
    endpoint_url: chinaEndpointUrl(company.company_id),
  };
}

async function getGrowthFunnel() {
  requireChinaDb();
  const [live, companies, allows] = await Promise.all([
    chinaDb.listLive(),
    chinaDb.listCompanies(),
    chinaDb.listDomainAllows(),
  ]);
  const byStatus = companies.reduce((acc, row) => {
    const key = row.status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const enriched = live.map((row) => {
    const profile = normalizeProfile(row.profile);
    return {
      domain: row.domain,
      filled_fields: countFilledBuyerFields(row),
      gaps: enrichmentGaps(row).length,
      discovery_score: profile.enrichment && profile.enrichment.last_discovery
        ? profile.enrichment.last_discovery.score
        : null,
      enriched_at: profile.enrichment && profile.enrichment.filled_at
        ? profile.enrichment.filled_at
        : null,
    };
  });
  const avgFilled = enriched.length
    ? enriched.reduce((sum, row) => sum + row.filled_fields, 0) / enriched.length
    : 0;
  return {
    ok: true,
    metric: 'outreach → claim_page_viewed → email_verified → published → live → enriched_fields → discovery_score → first inquiry',
    live: live.length,
    companies_by_status: byStatus,
    allows_total: allows.length,
    claim_page_viewed: allows.filter((row) => row.claim_opened_at).length,
    email_verified: companies.filter((row) => row.verified_at || row.status === 'verified' || row.status === 'live').length,
    allows_claim_opened: allows.filter((row) => row.claim_opened_at).length,
    allows_bounced: allows.filter((row) => row.bounced_at).length,
    allows_published: allows.filter((row) => row.published_at).length,
    live_avg_filled_fields: Math.round(avgFilled * 10) / 10,
    live_with_enrichment: enriched.filter((row) => row.enriched_at).length,
    live_enrichment: enriched.slice(0, 40),
    allows: allows.slice(0, 100).map((row) => ({
      domain: row.domain,
      email: row.contact_email,
      source: row.source,
      opened: Boolean(row.claim_opened_at),
      bounced: Boolean(row.bounced_at),
      published: Boolean(row.published_at),
      note: row.note || '',
    })),
  };
}

async function recordEmailBounce(args = {}) {
  requireChinaDb();
  const domain = normalizeDomain(args.domain || args.website || '');
  const parts = emailParts(args.email || args.contact_email || '');
  if (!domain) return { ok: false, error: 'invalid_domain' };
  if (!parts) return { ok: false, error: 'invalid_email' };
  const bounceType = ['hard', 'spam', 'soft'].includes(String(args.bounce_type || '').trim())
    ? String(args.bounce_type).trim()
    : 'hard';
  const allow = await chinaDb.getDomainAllow(domain, parts.email);
  if (!allow) return { ok: false, error: 'allow_not_found' };
  const clearOpen = allow.claim_opened_at && !allow.published_at && !args.keep_open;
  const next = await chinaDb.touchDomainAllow(domain, parts.email, {
    bounced_at: allow.bounced_at || new Date().toISOString(),
    bounce_type: bounceType,
    bounce_detail: String(args.detail || args.bounce_detail || args.reason || '').slice(0, 500),
    claim_opened_at: clearOpen ? null : allow.claim_opened_at,
  });
  try {
    const company = await chinaDb.getByDomain(domain).catch(() => null);
    if (company) {
      await factsStore.recordFunnelEvent(chinaDb, {
        company_id: company.company_id,
        event: 'bounced',
        detail: bounceType,
      });
    }
  } catch (error) {
    console.error('Airsupdev bounce funnel skipped:', error.message);
  }
  return {
    ok: true,
    domain,
    email: parts.email,
    bounced_at: next && next.bounced_at,
    bounce_type: next && next.bounce_type,
    opened: Boolean(next && next.claim_opened_at),
    allow: next,
  };
}

async function getSupplierEvents(args = {}) {
  requireChinaDb();
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const allow = await chinaDb.getDomainAllow(company.domain, company.contact_email).catch(() => null);
  const inquiries = await chinaDb.listInquiriesForCompany(company.company_id).catch(() => []);
  const tokens = await chinaDb.listTokensForCompany(company.company_id).catch(() => []);
  const funnel = typeof chinaDb.listFunnelEvents === 'function'
    ? await chinaDb.listFunnelEvents(company.company_id).catch(() => [])
    : [];
  const events = [];
  const push = (at, type, detail) => {
    if (!at) return;
    events.push({ at, type, detail: detail || '' });
  };
  push(company.created_at, 'draft_created', company.source || '');
  push(company.last_email_at, 'email_sent', company.contact_email || '');
  for (const token of tokens) {
    if (token.purpose === 'claim' && !token.used_at) push(token.created_at, 'magic_link_created', token.email);
    if (token.used_at) push(token.used_at, `token_used_${token.purpose}`, token.email);
  }
  if (allow) {
    push(allow.claim_opened_at, 'claim_page_viewed', allow.source);
    push(allow.bounced_at, 'email_bounced', allow.bounce_type || '');
    push(allow.published_at, 'published_from_allow', allow.source);
  }
  push(company.verified_at, 'email_verified', '');
  push(company.live_at, 'published_live', '');
  for (const inquiry of inquiries) {
    push(inquiry.created_at, 'buyer_inquiry_received', String(inquiry.message || '').slice(0, 120));
  }
  for (const row of funnel || []) {
    push(row.at || row.created_at, row.event, row.detail || '');
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return { ok: true, company_id: company.company_id, domain: company.domain, events };
}

async function loadCompanyFacts(company) {
  requireChinaDb();
  let storeUnavailable = false;
  let rows = [];
  if (typeof chinaDb.listFacts === 'function') {
    try {
      rows = await chinaDb.listFacts(company.company_id);
    } catch (error) {
      storeUnavailable = true;
      console.error('Airsupdev listFacts failed:', error.message);
      rows = [];
    }
  } else {
    storeUnavailable = true;
  }
  const current = (rows || []).filter((row) => !row.valid_until && facts.isCountable(row));
  if (!current.length) {
    try {
      await factsStore.backfillCompanyFacts(chinaDb, company);
      if (typeof chinaDb.listFacts === 'function' && !storeUnavailable) {
        rows = await chinaDb.listFacts(company.company_id).catch(() => []);
      }
    } catch (error) {
      storeUnavailable = true;
      console.error('Airsupdev backfillFacts failed:', error.message);
    }
  }
  const listed = (rows || []).filter((row) => !row.valid_until);
  if (!listed.length) {
    return {
      rows: facts.factsFromCompany(company),
      facts_store: storeUnavailable ? 'unavailable' : 'memory_fallback',
    };
  }
  return { rows: listed, facts_store: storeUnavailable ? 'unavailable' : 'ok' };
}

async function getSupplierDataDepth(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const loaded = await loadCompanyFacts(company);
  const summary = facts.summarizeDepth(loaded.rows);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    facts_store: loaded.facts_store,
    ...summary,
  };
}

async function getSupplierFactGaps(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const loaded = await loadCompanyFacts(company);
  const gaps = facts.gapsFromFacts(loaded.rows, company);
  const next = facts.suggestNext(loaded.rows, company);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    facts_store: loaded.facts_store,
    ...gaps,
    next_ask: next,
  };
}

async function listSupplierFacts(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  let loaded = await loadCompanyFacts(company);
  let rows = loaded.rows;
  const type = String(args.fact_type || '').trim();
  if (type) rows = rows.filter((row) => row.fact_type === type);
  const limit = Math.max(1, Math.min(500, Number(args.limit) || 100));
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    facts_store: loaded.facts_store,
    count: rows.length,
    facts: rows.slice(0, limit),
  };
}

async function recordSupplierReply(args = {}) {
  requireChinaDb();
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const text = String(args.text || args.body || args.reply || '').trim();
  await factsStore.recordFunnelEvent(chinaDb, {
    company_id: company.company_id,
    event: 'human_replied',
    detail: String(args.thread_id || '').slice(0, 120),
  });
  let stored = 0;
  if (text) {
    const extracted = facts.factsFromReplyText(text, args.thread_id || 'supplier_reply');
    const result = await factsStore.persistFacts(chinaDb, company, extracted, {
      source_type: 'supplier_reply',
      source_reference: String(args.thread_id || 'email').slice(0, 400),
      visibility: 'ops',
      note: 'human_replied',
    });
    stored = result.stored || 0;
  }
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    facts_stored: stored,
  };
}

async function backfillSupplierFacts(args = {}) {
  requireChinaDb();
  if (args.all_live) {
    const limit = Math.max(1, Math.min(200, Number(args.limit) || 80));
    const live = await chinaDb.listLive();
    const targets = (live || []).slice(0, limit);
    const results = [];
    for (const company of targets) {
      try {
        const before = typeof chinaDb.listFacts === 'function'
          ? (await chinaDb.listFacts(company.company_id).catch(() => [])).filter((row) => !row.valid_until).length
          : 0;
        const persisted = await factsStore.backfillCompanyFacts(chinaDb, company);
        const fresh = await chinaDb.getById(company.company_id);
        await factsStore.projectBuyerFactsOntoCompany(chinaDb, fresh || company);
        const afterRows = typeof chinaDb.listFacts === 'function'
          ? (await chinaDb.listFacts(company.company_id).catch(() => [])).filter((row) => !row.valid_until)
          : facts.factsFromCompany(fresh || company);
        results.push({
          company_id: company.company_id,
          domain: company.domain,
          ok: true,
          stored: persisted.stored || 0,
          fact_count: afterRows.length,
          before,
          depth_tier: facts.summarizeDepth(afterRows).depth_tier,
        });
      } catch (error) {
        results.push({
          company_id: company.company_id,
          domain: company.domain,
          ok: false,
          error: error.message || String(error),
        });
      }
    }
    return { ok: true, processed: results.length, live_total: (live || []).length, results };
  }
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const persisted = await factsStore.backfillCompanyFacts(chinaDb, company);
  const fresh = await chinaDb.getById(company.company_id);
  await factsStore.projectBuyerFactsOntoCompany(chinaDb, fresh || company);
  await factsStore.recordFunnelEvent(chinaDb, {
    company_id: company.company_id,
    event: 'facts_backfilled',
    detail: String(persisted.stored || 0),
  });
  const loaded = await loadCompanyFacts(fresh || company);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    stored: persisted.stored || 0,
    skipped: persisted.skipped || 0,
    ...facts.summarizeDepth(loaded.rows),
    facts_store: loaded.facts_store,
  };
}

async function ingestHistoricalQuotes(args = {}) {
  requireChinaDb();
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };

  const machineList = String(args.machine_list || '').trim();
  const text = String(args.text || '').trim();
  const b64 = String(args.content_base64 || '').trim();
  let stored = 0;
  let mode = 'none';
  let nextCompany = company;

  if (b64) {
    mode = 'file';
    const buffer = Buffer.from(b64, 'base64');
    if (!buffer.length || buffer.length > quotations.MAX_BYTES) {
      return { ok: false, error: 'invalid_file' };
    }
    const file = {
      originalname: String(args.filename || 'quote.bin').slice(0, 200),
      mimetype: String(args.mime || 'application/octet-stream').slice(0, 120),
      size: buffer.length,
      buffer,
    };
    if (!quotations.isAllowedFile(file)) return { ok: false, error: 'file_type_not_allowed' };
    const uploaded = await quotations.uploadAndExtract(company, file);
    nextCompany = uploaded.company || company;
    if (args.endpoint_use === true) {
      const toggled = await quotations.setEndpointUse(nextCompany, true);
      nextCompany = toggled.company || nextCompany;
    }
    const extracted = (nextCompany.profile && nextCompany.profile.quotation_knowledge
      && nextCompany.profile.quotation_knowledge.extracted) || {};
    const vis = nextCompany.profile && nextCompany.profile.quotation_knowledge
      && nextCompany.profile.quotation_knowledge.endpoint_use ? 'buyer' : 'private';
    const rows = facts.factsFromExtracted(extracted, vis);
    const result = await factsStore.persistFacts(chinaDb, nextCompany, rows, {
      source_type: 'quotation',
      source_reference: file.originalname,
      visibility: vis,
      note: 'ingest_historical_quotes',
    });
    stored = result.stored || 0;
  } else if (machineList || text) {
    mode = machineList ? 'machine_list' : 'text';
    const body = machineList || text;
    const rows = [
      ...facts.factsFromMachineListText(body, 'ingest_historical_quotes'),
      ...facts.factsFromReplyText(body, 'ingest_historical_quotes'),
      ...facts.factsFromExtracted(
        typeof quotations.heuristicExtract === 'function' ? quotations.heuristicExtract(body) : {},
        'private'
      ),
    ];
    const result = await factsStore.persistFacts(chinaDb, company, rows, {
      source_type: machineList ? 'machine_list' : 'quotation',
      source_reference: 'worker_paste',
      visibility: 'ops',
      note: 'ingest_historical_quotes',
    });
    stored = result.stored || 0;
  } else {
    return { ok: false, error: 'text_or_file_required' };
  }

  await factsStore.recordFunnelEvent(chinaDb, {
    company_id: company.company_id,
    event: 'quotes_ingested',
    detail: mode,
  });
  const fresh = await chinaDb.getById(company.company_id);
  await factsStore.backfillCompanyFacts(chinaDb, fresh || nextCompany);
  await factsStore.projectBuyerFactsOntoCompany(chinaDb, fresh || nextCompany);
  const loaded = await loadCompanyFacts(fresh || nextCompany);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    mode,
    facts_stored: stored,
    ...facts.summarizeDepth(loaded.rows),
    facts_store: loaded.facts_store,
  };
}

async function suggestNextSupplierEnrichment(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const loaded = await loadCompanyFacts(company);
  const next = facts.suggestNext(loaded.rows, company);
  const depth = facts.summarizeDepth(loaded.rows);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    next_ask: next,
    depth,
    publish_gaps: publishGaps(company),
    facts_store: loaded.facts_store,
  };
}

async function getFactConflicts(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const loaded = await loadCompanyFacts(company);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    conflicts: facts.detectConflicts(loaded.rows),
  };
}

async function getStaleSupplierFacts(args = {}) {
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const loaded = await loadCompanyFacts(company);
  const stale = facts.staleFacts(loaded.rows);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    count: stale.length,
    facts: stale.slice(0, 80),
  };
}

async function confirmSupplierFacts(args = {}) {
  requireChinaDb();
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const factType = String(args.fact_type || '').trim();
  const factKey = String(args.fact_key || '').trim();
  const value = String(args.value || '').trim();
  const factId = String(args.fact_id || '').trim();
  if ((!factType || !factKey || !value) && !factId) {
    return { ok: false, error: 'fact_type_key_value_or_fact_id_required' };
  }
  const rows = typeof chinaDb.listFacts === 'function'
    ? await chinaDb.listFacts(company.company_id).catch(() => [])
    : [];
  const current = (rows || []).filter((row) => !row.valid_until);
  let winner = null;
  if (factId) {
    winner = current.find((row) => row.fact_id === factId) || null;
  } else {
    winner = current.find((row) => row.fact_type === factType && row.fact_key === factKey && String(row.value) === value) || null;
  }
  if (!winner) {
    const created = await factsStore.persistFacts(chinaDb, company, [facts.fact({
      fact_type: factType || 'identity',
      fact_key: factKey || 'confirmed',
      value,
      confidence: 0.95,
      supplier_confirmed: true,
      visibility: 'buyer',
      source_type: 'supplier_confirm',
      source_reference: 'confirm_supplier_facts',
    })], {
      source_type: 'supplier_confirm',
      source_reference: 'confirm_supplier_facts',
      visibility: 'buyer',
      note: 'worker_confirm',
    });
    await factsStore.projectBuyerFactsOntoCompany(chinaDb, company);
    return { ok: true, created: true, stored: created.stored || 0 };
  }
  let expired = 0;
  for (const row of current) {
    if (row.fact_id === winner.fact_id) continue;
    if (row.fact_type === winner.fact_type && row.fact_key === winner.fact_key && typeof chinaDb.expireFact === 'function') {
      await chinaDb.expireFact(row.fact_id);
      expired += 1;
    }
  }
  await factsStore.persistFacts(chinaDb, company, [{
    ...winner,
    supplier_confirmed: true,
    confidence: Math.max(0.9, Number(winner.confidence) || 0.9),
    last_verified_at: new Date().toISOString(),
    visibility: winner.visibility || 'buyer',
    source_type: 'supplier_confirm',
    source_reference: 'confirm_supplier_facts',
  }], {
    source_type: 'supplier_confirm',
    source_reference: 'confirm_supplier_facts',
    visibility: 'buyer',
    note: 'worker_confirm',
  });
  await factsStore.projectBuyerFactsOntoCompany(chinaDb, company);
  return {
    ok: true,
    created: false,
    fact_id: winner.fact_id,
    expired,
  };
}

async function enrichSupplierDeep(args = {}) {
  requireChinaDb();
  const company = await resolveCompany(args, { allowFuzzy: true });
  if (!company) return { ok: false, error: 'supplier_not_found' };
  const beforeLoaded = await loadCompanyFacts(company);
  const before = facts.summarizeDepth(beforeLoaded.rows);
  const enriched = await enrichCompany(company, {
    lang: args.lang === 'en' ? 'en' : 'zh',
  });
  if (!enriched.ok) {
    return { ok: false, error: enriched.error || 'enrich_failed', domain: company.domain };
  }
  const fresh = enriched.company || await chinaDb.getById(company.company_id);
  const persisted = await factsStore.backfillCompanyFacts(chinaDb, fresh);
  await factsStore.projectBuyerFactsOntoCompany(chinaDb, fresh);
  await factsStore.recordFunnelEvent(chinaDb, {
    company_id: company.company_id,
    event: 'deep_crawl',
    detail: String(enriched.crawl_pages || 1),
  });
  const afterLoaded = await loadCompanyFacts(fresh);
  const after = facts.summarizeDepth(afterLoaded.rows);
  return {
    ok: true,
    company_id: company.company_id,
    domain: company.domain,
    crawl_pages: enriched.crawl_pages || 1,
    filled_delta: enriched.filled_delta || 0,
    facts_stored: persisted.stored || 0,
    before,
    after,
    listing_preview: String(listingText(fresh) || '').slice(0, 500),
  };
}

async function callTool(name, args) {
  switch (name) {
    case 'lookup_supplier':
      return lookupSupplier(args);
    case 'create_supplier_draft':
      return createSupplierDraft(args);
    case 'get_supplier_card':
      return getSupplierCard(args);
    case 'update_supplier_card':
      return updateSupplierCard(args);
    case 'create_magic_link':
      return createMagicLink(args);
    case 'get_onboarding_status':
      return getOnboardingStatus(args);
    case 'verify_supplier':
      return verifySupplier(args);
    case 'publish_supplier':
      return publishSupplier(args);
    case 'test_supplier_discovery':
      return testSupplierDiscovery(args);
    case 'enrich_supplier':
      return enrichSupplier(args);
    case 'get_enrichment_gaps':
      return getEnrichmentGaps(args);
    case 'generate_demo':
      return generateDemo(args);
    case 'get_growth_funnel':
      return getGrowthFunnel(args);
    case 'get_supplier_events':
      return getSupplierEvents(args);
    case 'record_email_bounce':
      return recordEmailBounce(args);
    case 'record_supplier_reply':
      return recordSupplierReply(args);
    case 'get_supplier_data_depth':
      return getSupplierDataDepth(args);
    case 'get_supplier_fact_gaps':
      return getSupplierFactGaps(args);
    case 'list_supplier_facts':
      return listSupplierFacts(args);
    case 'backfill_supplier_facts':
      return backfillSupplierFacts(args);
    case 'ingest_historical_quotes':
      return ingestHistoricalQuotes(args);
    case 'suggest_next_supplier_enrichment':
      return suggestNextSupplierEnrichment(args);
    case 'get_fact_conflicts':
      return getFactConflicts(args);
    case 'get_stale_supplier_facts':
      return getStaleSupplierFacts(args);
    case 'confirm_supplier_facts':
      return confirmSupplierFacts(args);
    case 'enrich_supplier_deep':
      return enrichSupplierDeep(args);
    default: {
      const error = new Error(`Unknown tool: ${name}`);
      error.code = -32601;
      throw error;
    }
  }
}

function timingSafeEqualString(a, b) {
  const left = crypto.createHash('sha256').update(String(a || ''), 'utf8').digest();
  const right = crypto.createHash('sha256').update(String(b || ''), 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  callTool,
  deriveOnboardingStatus,
  timingSafeEqualString,
  summarizeCompany,
  NICHES,
  CITIES,
  DEFAULT_ACTIONS,
};
