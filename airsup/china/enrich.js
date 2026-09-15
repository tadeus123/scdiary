const { normalizeDomain } = require('./domain');
const db = require('./db');
const { buildPreview, companyDraftFromPreview } = require('./site-preview');
const {
  fillEmptyCompany,
  normalizeProfile,
  normalizeEnrichment,
  countFilledBuyerFields,
  enrichmentGaps,
  mergeEnrichment,
} = require('./fields');

const ENRICH_COLUMNS = [
  'company_name',
  'company_name_en',
  'city',
  'niche',
  'context',
  'goal',
  'profile',
];

function patchFromFilled(filled) {
  return {
    company_name: filled.company_name,
    company_name_en: filled.company_name_en,
    city: filled.city,
    niche: filled.niche,
    context: filled.context,
    goal: filled.goal,
    profile: normalizeProfile(filled.profile),
  };
}

function confirmChecklist(company) {
  const gaps = enrichmentGaps(company);
  const enrichment = normalizeEnrichment(company && company.profile && company.profile.enrichment);
  const kept = (enrichment.sources || [])
    .filter((row) => ['certifications', 'machines', 'processes', 'materials', 'moq', 'lead_time'].includes(row.field))
    .slice(0, 6)
    .map((row) => ({
      field: row.field,
      keep: true,
      note: `Found on site${row.url ? ` (${row.url})` : ''}: ${row.quote || 'see source'}`.slice(0, 200),
    }));
  const need = gaps.slice(0, 8).map((gap) => ({
    field: gap.field,
    keep: false,
    note: gap.why,
  }));
  return { kept, need, checklist: [...kept, ...need] };
}

function gapEmailBody(company) {
  const title = String(company.company_name_en || company.company_name || company.domain || 'your factory');
  const gaps = enrichmentGaps(company);
  const lines = [
    `Hello,`,
    ``,
    `Your Airsup China listing for ${title} is live. A few details would help ChatGPT answer buyer questions faster:`,
    ``,
  ];
  for (const gap of gaps.slice(0, 5)) {
    lines.push(`- ${gap.why}`);
  }
  lines.push(
    ``,
    `Add WeChat and sample/MOQ details on your live edit page when you can.`,
    `No software install required.`,
    ``,
    `Airsup China`
  );
  return lines.join('\n');
}

async function enrichCompany(company, options = {}) {
  if (!company || !company.company_id) {
    return { ok: false, error: 'company_required' };
  }
  const domain = normalizeDomain(company.domain || company.website || '');
  if (!domain) {
    return { ok: false, error: 'domain_missing' };
  }
  const lang = options.lang === 'en' ? 'en' : 'zh';
  const before = countFilledBuyerFields(company);
  const built = await buildPreview(domain, lang, { skipCache: true });
  if (!built.ok) {
    return { ok: false, error: built.error || 'preview_failed', domain, before_fields: before };
  }
  const draft = companyDraftFromPreview(built);
  if (!draft.goal && !String(company.goal || '').trim()) {
    draft.goal = lang === 'en'
      ? 'Receive qualified RFQs from Western buyers who find us in ChatGPT.'
      : '让在 ChatGPT 里找到我们的西方采购把合格询盘发到邮箱。';
  }
  const filled = fillEmptyCompany(company, draft);
  const afterProfile = normalizeProfile(filled.profile);
  afterProfile.enrichment = mergeEnrichment(afterProfile.enrichment, {
    filled_at: new Date().toISOString(),
    crawl_pages: built.crawlPages || (built.profile && built.profile.enrichment && built.profile.enrichment.crawl_pages) || 1,
    model: (afterProfile.enrichment && afterProfile.enrichment.model) || 'site-preview',
    sources: (afterProfile.enrichment && afterProfile.enrichment.sources) || [],
  });
  filled.profile = afterProfile;
  const after = countFilledBuyerFields(filled);
  const patch = patchFromFilled(filled);
  const updated = await db.updateCompany(company.company_id, patch);
  const gaps = enrichmentGaps(updated);
  const checklist = confirmChecklist(updated);
  return {
    ok: true,
    company_id: updated.company_id,
    domain,
    status: updated.status,
    before_fields: before,
    after_fields: after,
    filled_delta: Math.max(0, after - before),
    crawl_pages: built.crawlPages || 1,
    gaps,
    checklist,
    company: updated,
  };
}

async function enrichByDomain(domainInput, options = {}) {
  if (!db.isConfigured()) throw new Error('Database is not configured');
  const domain = normalizeDomain(domainInput);
  if (!domain) return { ok: false, error: 'domain_missing' };
  const company = await db.getByDomain(domain);
  if (!company) return { ok: false, error: 'company_not_found', domain };
  return enrichCompany(company, options);
}

async function enrichAllLive(options = {}) {
  if (!db.isConfigured()) throw new Error('Database is not configured');
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const live = await db.listLive();
  const targets = live.slice(0, limit);
  const results = [];
  for (const company of targets) {
    try {
      const result = await enrichCompany(company, options);
      results.push({
        domain: company.domain,
        company_id: company.company_id,
        ok: result.ok,
        before_fields: result.before_fields,
        after_fields: result.after_fields,
        filled_delta: result.filled_delta,
        crawl_pages: result.crawl_pages,
        error: result.error || null,
      });
    } catch (error) {
      results.push({
        domain: company.domain,
        company_id: company.company_id,
        ok: false,
        error: error.message || String(error),
      });
    }
  }
  return {
    ok: true,
    live_total: live.length,
    processed: results.length,
    results,
  };
}

async function storeDiscoveryScore(company, discovery) {
  if (!company || !company.company_id) return company;
  const profile = normalizeProfile(company.profile);
  profile.enrichment = mergeEnrichment(profile.enrichment, {
    last_discovery: {
      query: String((discovery && (discovery.query || discovery.buyer_query)) || '').slice(0, 200),
      score: Number(discovery && discovery.score) || 0,
      surfaced: Boolean(discovery && discovery.surfaced),
      at: new Date().toISOString(),
    },
  });
  return db.updateCompany(company.company_id, { profile });
}

module.exports = {
  ENRICH_COLUMNS,
  enrichCompany,
  enrichByDomain,
  enrichAllLive,
  confirmChecklist,
  gapEmailBody,
  enrichmentGaps,
  countFilledBuyerFields,
  storeDiscoveryScore,
};
