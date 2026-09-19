/**
 * Persist evidence-backed facts. Never overwrite a supplier_confirmed value with scrape.
 */
const { factsFromCompany } = require('./facts');

function factRow(companyId, row, sourceId) {
  return {
    company_id: companyId,
    fact_type: String(row.fact_type || 'identity').slice(0, 40),
    fact_key: String(row.fact_key || '').slice(0, 200),
    value: String(row.value == null ? '' : row.value).trim().slice(0, 500),
    unit: String(row.unit || ''),
    source_id: sourceId || null,
    source_type: String(row.source_type || 'profile_backfill').slice(0, 40),
    source_reference: String(row.source_reference || '').slice(0, 400),
    confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0.55)),
    supplier_confirmed: Boolean(row.supplier_confirmed),
    visibility: ['buyer', 'ops', 'private'].includes(row.visibility) ? row.visibility : 'ops',
    first_seen_at: row.first_seen_at || new Date().toISOString(),
    last_verified_at: row.last_verified_at || null,
    valid_from: row.valid_from || new Date().toISOString(),
    valid_until: row.valid_until || null,
  };
}

async function persistFacts(store, company, rows, sourceMeta) {
  if (!store || !company || !company.company_id || typeof store.insertFact !== 'function') {
    return { stored: 0, skipped: 0, source_id: null };
  }
  const list = Array.isArray(rows) ? rows.filter((row) => row && row.fact_key && String(row.value || '').trim()) : [];
  if (!list.length) return { stored: 0, skipped: 0, source_id: null };

  let sourceId = null;
  if (typeof store.insertSource === 'function') {
    const source = await store.insertSource({
      company_id: company.company_id,
      source_type: (sourceMeta && sourceMeta.source_type) || 'profile_backfill',
      source_reference: (sourceMeta && sourceMeta.source_reference) || '',
      visibility: (sourceMeta && sourceMeta.visibility) || 'ops',
      note: (sourceMeta && sourceMeta.note) || '',
    });
    sourceId = source && source.source_id;
  }

  const existing = typeof store.listFacts === 'function'
    ? await store.listFacts(company.company_id)
    : [];
  const current = new Map();
  (existing || []).forEach((row) => {
    if (row && !row.valid_until) current.set(`${row.fact_type}:${row.fact_key}`, row);
  });

  let stored = 0;
  let skipped = 0;
  const toInsert = [];
  for (const row of list) {
    const key = `${row.fact_type}:${row.fact_key}`;
    const cur = current.get(key);
    if (cur && String(cur.value) === String(row.value).trim()) {
      skipped += 1;
      continue;
    }
    if (cur && cur.supplier_confirmed && !row.supplier_confirmed) {
      skipped += 1;
      continue;
    }
    if (cur && typeof store.expireFact === 'function') {
      await store.expireFact(cur.fact_id);
    }
    toInsert.push(factRow(company.company_id, row, sourceId));
  }
  if (toInsert.length && typeof store.insertFacts === 'function') {
    await store.insertFacts(toInsert);
    stored = toInsert.length;
  } else {
    for (const row of toInsert) {
      await store.insertFact(row);
      stored += 1;
    }
  }
  return { stored, skipped, source_id: sourceId };
}

async function backfillCompanyFacts(store, company) {
  return persistFacts(store, company, factsFromCompany(company), {
    source_type: 'profile_backfill',
    source_reference: 'airsup_china_companies.profile',
    visibility: 'ops',
    note: 'profile / enrichment / gated quotation_knowledge',
  });
}

async function recordFunnelEvent(store, row) {
  if (!store || typeof store.insertFunnelEvent !== 'function' || !row || !row.company_id) return null;
  try {
    return await store.insertFunnelEvent({
      company_id: row.company_id,
      event: String(row.event || '').slice(0, 80),
      detail: String(row.detail || '').slice(0, 500),
      at: row.at || new Date().toISOString(),
    });
  } catch (error) {
    console.error('Airsup china funnel event skipped:', error.message);
    return null;
  }
}

async function projectBuyerFactsOntoCompany(store, company, rows) {
  if (!store || !company || !company.company_id || typeof store.updateCompany !== 'function') {
    return company;
  }
  const { buyerVisibleLines, normalizeProfile } = (() => {
    const factsMod = require('./facts');
    const fieldsMod = require('./fields');
    return {
      buyerVisibleLines: factsMod.buyerVisibleLines,
      normalizeProfile: fieldsMod.normalizeProfile,
    };
  })();
  let list = rows;
  if (!Array.isArray(list) && typeof store.listFacts === 'function') {
    list = await store.listFacts(company.company_id).catch(() => []);
  }
  const lines = buyerVisibleLines(list || [], 900);
  const profile = normalizeProfile(company.profile);
  profile.buyer_fact_block = lines.length
    ? `Evidence-backed facts (buyer-visible):\n${lines.join('\n')}`
    : '';
  profile.buyer_fact_updated_at = new Date().toISOString();
  return store.updateCompany(company.company_id, { profile });
}

module.exports = {
  persistFacts,
  backfillCompanyFacts,
  recordFunnelEvent,
  projectBuyerFactsOntoCompany,
  factRow,
};
