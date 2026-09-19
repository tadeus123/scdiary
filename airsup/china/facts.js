/**
 * Evidence-backed atomic facts for Airsup China factories.
 * A fact is one key/value plus source, confidence, and verification — not a new column.
 */
const { normalizeProfile, listedContacts, publishGaps } = require('./fields');

const FACT_TYPES = [
  'identity', 'process', 'machine', 'material', 'qc',
  'commercial', 'logistics', 'people', 'hist_quote', 'buyer_perf', 'doc',
];

const TARGETS = {
  identity: 30,
  process: 120,
  machine: 150,
  material: 80,
  qc: 80,
  commercial: 80,
  logistics: 50,
  people: 30,
  hist_quote: 250,
  buyer_perf: 100,
  doc: 30,
};

function depthTier(count, living) {
  const n = Math.max(0, Number(count) || 0);
  if (n >= 1500 && living) return 'living';
  if (n >= 700) return 'deep';
  if (n >= 300) return 'rich';
  if (n >= 100) return 'enriched';
  return 'seed';
}

function isCountable(row) {
  if (!row || row.valid_until) return false;
  const value = String(row.value || '').trim();
  if (!value || /^(n\/a|na|none|unknown|see website)$/i.test(value)) return false;
  if (Number(row.confidence) < 0.4) return false;
  if (!String(row.fact_key || '').trim()) return false;
  return true;
}

function fact(partial) {
  const now = new Date().toISOString();
  return {
    fact_type: String(partial.fact_type || 'identity'),
    fact_key: String(partial.fact_key || '').slice(0, 200),
    value: String(partial.value == null ? '' : partial.value).trim().slice(0, 500),
    unit: String(partial.unit || ''),
    source_type: String(partial.source_type || 'profile_backfill'),
    source_reference: String(partial.source_reference || '').slice(0, 400),
    confidence: Math.max(0, Math.min(1, Number(partial.confidence) || 0.55)),
    supplier_confirmed: Boolean(partial.supplier_confirmed),
    visibility: ['buyer', 'ops', 'private'].includes(partial.visibility) ? partial.visibility : 'ops',
    first_seen_at: partial.first_seen_at || now,
    last_verified_at: partial.last_verified_at || (partial.supplier_confirmed ? now : null),
    valid_from: partial.valid_from || now,
    valid_until: partial.valid_until || null,
  };
}

function add(out, row) {
  if (!row || !row.fact_key || !String(row.value || '').trim()) return;
  const key = `${row.fact_type}:${row.fact_key}`;
  const prev = out.get(key);
  if (prev && String(prev.value) === String(row.value)) return;
  out.set(key, fact(row));
}

function factsFromCompany(company) {
  const out = new Map();
  const profile = normalizeProfile(company && company.profile);
  const src = { source_type: 'profile_backfill', source_reference: 'airsup_china_companies.profile', confidence: 0.7, visibility: 'buyer' };
  const put = (type, key, value, extra) => add(out, { fact_type: type, fact_key: key, value, ...src, ...extra });

  put('identity', 'domain', company && company.domain);
  put('identity', 'company_name', company && company.company_name);
  put('identity', 'company_name_en', company && company.company_name_en);
  put('identity', 'city', company && company.city);
  put('identity', 'niche', company && company.niche);
  put('identity', 'website', company && company.website);
  put('identity', 'contact_email', company && company.contact_email, { visibility: 'ops' });
  put('identity', 'context', company && company.context);
  put('identity', 'goal', company && company.goal);
  put('identity', 'year_founded', profile.year_founded);
  put('identity', 'employees', profile.employees);
  put('identity', 'address', profile.address);

  (profile.processes || []).forEach((id) => put('process', `has.${id}`, id, { supplier_confirmed: true, confidence: 0.95 }));
  (profile.materials || []).forEach((id) => put('material', `has.${id}`, id, { supplier_confirmed: true, confidence: 0.95 }));
  (profile.finishing || []).forEach((id) => put('material', `finish.${id}`, id, { supplier_confirmed: true, confidence: 0.9 }));
  (profile.certifications || []).forEach((id) => put('qc', `cert.${id}`, id, { supplier_confirmed: true, confidence: 0.9 }));
  put('machine', 'list', profile.machines, { confidence: 0.75 });
  put('commercial', 'moq', profile.moq);
  put('commercial', 'lead_time', profile.lead_time);
  put('commercial', 'sample_lead', profile.sample_lead, { supplier_confirmed: Boolean(profile.sample_lead), confidence: profile.sample_lead ? 0.9 : 0.55 });
  put('commercial', 'tolerance', profile.tolerance);
  put('commercial', 'max_workpiece', profile.max_workpiece);
  put('logistics', 'shipping', profile.shipping);
  put('logistics', 'export_markets', profile.export_markets);
  listedContacts(profile.contacts).forEach((row, i) => {
    put('people', `wechat.${i}`, `${row.name || row.role}:${row.wechat}`, { visibility: 'ops', supplier_confirmed: true, confidence: 0.95 });
  });

  const extracted = profile.quotation_knowledge && profile.quotation_knowledge.extracted
    ? profile.quotation_knowledge.extracted
    : {};
  const quoteVis = profile.quotation_knowledge && profile.quotation_knowledge.endpoint_use ? 'buyer' : 'private';
  factsFromExtracted(extracted, quoteVis).forEach((row) => add(out, row));

  return Array.from(out.values());
}

function factsFromExtracted(extracted, visibility) {
  const vis = visibility || 'private';
  const src = { source_type: 'quotation', source_reference: 'quotation_knowledge.extracted', confidence: 0.75, visibility: vis };
  const out = [];
  const push = (type, key, value, extra) => {
    if (value == null || value === '') return;
    out.push(fact({ fact_type: type, fact_key: key, value: Array.isArray(value) ? value.join(', ') : value, ...src, ...extra }));
  };
  (extracted.processes || []).forEach((id) => push('process', `quote.has.${id}`, id));
  (extracted.materials || []).forEach((id) => push('material', `quote.has.${id}`, id));
  (extracted.typical_quantities || []).forEach((q, i) => push('hist_quote', `qty.${i}`, q));
  (extracted.lead_time_phrases || []).forEach((q, i) => push('hist_quote', `lead.${i}`, q));
  (extracted.tolerances || []).forEach((q, i) => push('hist_quote', `tol.${i}`, q));
  push('commercial', 'quote.moq', extracted.moq);
  push('commercial', 'quote.lead_time', extracted.lead_time);
  push('hist_quote', 'summary', extracted.summary);
  push('hist_quote', 'insights', extracted.insights_for_endpoint);
  return out;
}

function factsFromReplyText(text, sourceReference) {
  const raw = String(text || '');
  const src = { source_type: 'email_thread', source_reference: sourceReference || 'gmail_thread', confidence: 0.7, visibility: 'ops' };
  const out = [];
  const lead = raw.match(/(\d+)\s*days?/gi) || [];
  lead.slice(0, 6).forEach((m, i) => out.push(fact({ fact_type: 'commercial', fact_key: `reply.lead_days.${i}`, value: m, unit: 'day', ...src })));
  const weeks = raw.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*weeks?/i);
  if (weeks) out.push(fact({ fact_type: 'commercial', fact_key: 'reply.lead_weeks_range', value: `${weeks[1]}-${weeks[2]}`, unit: 'week', ...src }));
  const moq = raw.match(/\bmoq[:\s]+(\d[\d,]*)/i) || raw.match(/\bmin(?:imum)?\s+(?:order|qty)[:\s]+(\d[\d,]*)/i);
  if (moq) out.push(fact({ fact_type: 'commercial', fact_key: 'reply.moq', value: moq[1], ...src }));
  const proc = raw.match(/\b(5-?axis|cnc|pcba|smt|injection|sla|sls|fdm|anodiz\w+|iso\s*9001)\b/gi) || [];
  Array.from(new Set(proc.map((p) => p.toLowerCase()))).slice(0, 8).forEach((id) => {
    out.push(fact({ fact_type: 'process', fact_key: `reply.has.${id.replace(/\s+/g, '_')}`, value: id, ...src }));
  });
  return out.filter((row) => row.value);
}

function factsFromMachineListText(text, sourceReference) {
  const raw = String(text || '');
  const src = {
    source_type: 'machine_list',
    source_reference: sourceReference || 'pasted_machine_list',
    confidence: 0.8,
    visibility: 'buyer',
    supplier_confirmed: true,
  };
  const out = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 80);
  lines.forEach((line, i) => {
    if (line.length < 4 || line.length > 200) return;
    if (/^(hi|hello|dear|thanks|best|regards)\b/i.test(line)) return;
    out.push(fact({ fact_type: 'machine', fact_key: `list.${i}`, value: line, ...src }));
  });
  const brands = raw.match(/\b(Haas|Mazak|DMG|Fanuc|Okuma|Brother|Makino|Doosan|Yamaha|Juki|Siemens|Mitsubishi)\b/gi) || [];
  Array.from(new Set(brands.map((b) => b.toLowerCase()))).slice(0, 12).forEach((brand) => {
    out.push(fact({ fact_type: 'machine', fact_key: `brand.${brand}`, value: brand, ...src }));
  });
  return out.filter((row) => row.value);
}

function factsFromBuyerThread(buyerMessage, factoryReply, sourceReference) {
  const buyer = String(buyerMessage || '').trim();
  const reply = String(factoryReply || '').trim();
  const combined = `${buyer}\n${reply}`;
  const src = {
    source_type: 'buyer_chat',
    source_reference: sourceReference || 'buyer_thread',
    confidence: 0.65,
    visibility: 'buyer',
  };
  const out = [];
  const procs = combined.match(/\b(5-?axis|cnc|pcba|smt|injection|sla|sls|fdm|anodiz\w+|turning|milling)\b/gi) || [];
  Array.from(new Set(procs.map((p) => p.toLowerCase()))).slice(0, 6).forEach((id) => {
    out.push(fact({ fact_type: 'process', fact_key: `chat.has.${id.replace(/\s+/g, '_')}`, value: id, ...src }));
  });
  const mats = combined.match(/\b(aluminum|aluminium|steel|stainless|titanium|brass|copper|peek|abs|pc)\b/gi) || [];
  Array.from(new Set(mats.map((m) => m.toLowerCase()))).slice(0, 6).forEach((id) => {
    out.push(fact({ fact_type: 'material', fact_key: `chat.has.${id}`, value: id, ...src }));
  });
  const lead = reply.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*days?/i) || reply.match(/(\d+)\s*days?/i);
  if (lead) {
    out.push(fact({
      fact_type: 'commercial',
      fact_key: 'chat.lead_time',
      value: lead[2] ? `${lead[1]}-${lead[2]} days` : lead[0],
      visibility: 'ops',
      source_type: 'buyer_chat',
      source_reference: sourceReference || 'buyer_thread',
      confidence: 0.6,
    }));
  }
  if (/\b(iso\s*9001|iatf|as9100)\b/i.test(combined)) {
    const cert = combined.match(/\b(iso\s*9001|iatf|as9100)\b/i);
    if (cert) out.push(fact({ fact_type: 'qc', fact_key: `chat.cert.${cert[1].toLowerCase().replace(/\s+/g, '')}`, value: cert[1], ...src }));
  }
  return out.filter((row) => row.value);
}

function buyerVisibleLines(rows, maxChars) {
  const budget = Math.max(200, Math.min(2400, Number(maxChars) || 900));
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && !row.valid_until && row.visibility === 'buyer' && isCountable(row))
    .slice(0, 40);
  const lines = [];
  let used = 0;
  for (const row of list) {
    const line = `${row.fact_type}.${row.fact_key}: ${row.value}`.slice(0, 180);
    if (used + line.length + 1 > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines;
}

function summarizeDepth(rows, extras) {
  const list = (Array.isArray(rows) ? rows : []).filter(isCountable);
  const byType = {};
  FACT_TYPES.forEach((type) => { byType[type] = 0; });
  let confirmed = 0;
  let inferred = 0;
  let quoteSourced = 0;
  list.forEach((row) => {
    byType[row.fact_type] = (byType[row.fact_type] || 0) + 1;
    if (row.supplier_confirmed) confirmed += 1;
    else inferred += 1;
    if (row.source_type === 'quotation' || String(row.fact_key || '').startsWith('quote.') || row.fact_type === 'hist_quote') {
      quoteSourced += 1;
    }
  });
  const living = Boolean(extras && extras.living);
  const stale = (extras && extras.stale) || [];
  const conflicts = (extras && extras.conflicts) || [];
  const quality = list.length
    ? Math.round((100 * (confirmed * 1.2 + quoteSourced * 1.1 + inferred * 0.7)) / (list.length * 1.2))
    : 0;
  return {
    fact_count: list.length,
    confirmed,
    inferred,
    quote_sourced: quoteSourced,
    stale: stale.length,
    conflicting: conflicts.length,
    by_type: byType,
    targets: TARGETS,
    depth_tier: depthTier(list.length, living),
    quality_score: Math.max(0, Math.min(100, quality)),
  };
}

function gapsFromFacts(rows, company) {
  const summary = summarizeDepth(rows);
  const weak = FACT_TYPES.filter((type) => (summary.by_type[type] || 0) < Math.min(8, Math.round((TARGETS[type] || 30) * 0.08)));
  const publish = publishGaps(company);
  return {
    publish_gaps: publish,
    weak_categories: weak,
    auto_possible: weak.filter((type) => type === 'identity' || type === 'process' || type === 'doc'),
    supplier_needed: weak.filter((type) => type === 'machine' || type === 'hist_quote' || type === 'qc' || type === 'commercial'),
  };
}

function suggestNext(rows, company) {
  const gaps = gapsFromFacts(rows, company);
  if (gaps.publish_gaps.includes('capabilities')) {
    return {
      action: 'ask_capabilities',
      channel: 'onboard',
      expected_new_facts: 12,
      copy_en: 'Confirm the processes and machines your factory actually runs.',
      copy_zh: '请确认工厂实际能做的工艺和机床。',
    };
  }
  if (gaps.publish_gaps.length) {
    return {
      action: 'unblock_publish',
      channel: 'onboard',
      expected_new_facts: 4,
      copy_en: `Still needed to publish: ${gaps.publish_gaps.join(', ')}.`,
      copy_zh: `发布前还需：${gaps.publish_gaps.join('、')}。`,
    };
  }
  const byType = summarizeDepth(rows).by_type;
  if ((byType.hist_quote || 0) < 50) {
    return {
      action: 'ask_historical_quotes',
      channel: 'email',
      expected_new_facts: 420,
      copy_en: 'Please send your machine list and 5-10 old quotations. We will import them.',
      copy_zh: '请发一份机床清单和 5–10 份过往报价，我们来导入。',
    };
  }
  if ((byType.machine || 0) < 20) {
    return {
      action: 'ask_machine_list',
      channel: 'email',
      expected_new_facts: 95,
      copy_en: 'Please send a machine list (models and quantities). We will import it.',
      copy_zh: '请发机床清单（型号和数量），我们来导入。',
    };
  }
  if ((byType.qc || 0) < 8) {
    return {
      action: 'ask_certificates',
      channel: 'email',
      expected_new_facts: 25,
      copy_en: 'Please send ISO or inspection certificates if you have them.',
      copy_zh: '如有 ISO 或检测证书，请发过来。',
    };
  }
  return {
    action: 'deep_crawl',
    channel: 'crawl',
    expected_new_facts: 40,
    copy_en: 'Crawl more first-party catalog and equipment pages.',
    copy_zh: '继续抓取官网设备与目录页。',
  };
}

function detectConflicts(rows) {
  const current = (Array.isArray(rows) ? rows : []).filter((row) => !row.valid_until);
  const byKey = new Map();
  current.forEach((row) => {
    const key = `${row.fact_type}:${row.fact_key}`;
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  });
  const conflicts = [];
  byKey.forEach((list, key) => {
    const values = Array.from(new Set(list.map((row) => String(row.value || '').trim()).filter(Boolean)));
    if (values.length > 1) conflicts.push({ fact_key: key, values });
  });
  return conflicts;
}

function staleFacts(rows, now) {
  const t = now ? new Date(now).getTime() : Date.now();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (row.valid_until || row.fact_type === 'hist_quote') return false;
    const at = new Date(row.last_verified_at || row.first_seen_at || 0).getTime();
    if (!at) return false;
    const days = (t - at) / 86400000;
    if (row.fact_type === 'commercial' || row.fact_type === 'logistics') return days > 180;
    if (row.fact_type === 'machine' || row.fact_type === 'qc') return days > 365;
    return false;
  });
}

function deriveFunnel({ company, allow, tokens, events }) {
  const missing = publishGaps(company);
  const reason = missing.length ? `missing:${missing.join(',')}` : null;
  const profile = normalizeProfile(company && company.profile);
  const ev = Array.isArray(events) ? events : [];
  const has = (name) => ev.some((row) => row.event === name);
  const sent = Boolean((company && company.last_email_at) || has('outreach_sent'));
  const bounced = Boolean((allow && allow.bounced_at) || has('bounced'));
  const viewed = Boolean((allow && allow.claim_opened_at) || has('claim_page_viewed'));
  const replied = has('human_replied');
  const discovery = Boolean(
    profile.enrichment && profile.enrichment.last_discovery && profile.enrichment.last_discovery.at
  );

  let funnel_state = 'draft';
  let state = 'draft';
  if (company && company.status === 'live') {
    funnel_state = discovery || has('discovery_tested') ? 'discovery_tested' : 'published_live';
    state = 'live';
  } else if (company && company.status === 'verified') {
    if (!missing.length) {
      funnel_state = 'profile_approved';
      state = 'ready_to_publish';
    } else {
      funnel_state = 'email_verified';
      state = 'email_verified';
    }
  } else if (profile.claim_ready) {
    funnel_state = 'email_verification_sent';
    state = 'awaiting_verification';
  } else if (viewed) {
    funnel_state = 'claim_page_viewed';
    state = 'claim_page_viewed';
  } else if ((tokens || []).some((row) => row.purpose === 'claim' && !row.used_at && new Date(row.expires_at).getTime() > Date.now())) {
    funnel_state = 'claim_created';
    state = 'magic_link_created';
  } else if (replied) {
    funnel_state = 'human_replied';
    state = 'human_replied';
  } else if (sent && !bounced) {
    funnel_state = 'outreach_sent';
    state = 'draft';
  } else {
    funnel_state = 'draft';
    state = 'draft';
  }

  if (bounced && !viewed && !(company && company.status === 'live')) {
    state = 'bounced';
    funnel_state = 'bounced';
  }

  return {
    state,
    funnel_state,
    reason: state === 'live' ? null : reason,
    publish_gaps: state === 'live' ? [] : missing,
    published: Boolean(company && company.status === 'live'),
    deliverability: {
      sent,
      delivered: sent && !bounced,
      bounced,
      human_engaged: Boolean(viewed || replied || (company && (company.verified_at || company.status === 'live'))),
    },
  };
}

const FUNNEL_EVENTS = [
  'outreach_sent',
  'delivered',
  'bounced',
  'human_replied',
  'claim_created',
  'claim_page_viewed',
  'email_verification_sent',
  'email_verified',
  'profile_approved',
  'published_live',
  'discovery_tested',
];

function inboxOwned(funnelState, company) {
  if (company && (company.status === 'verified' || company.status === 'live')) return true;
  return ['email_verified', 'profile_approved', 'published_live', 'discovery_tested'].includes(funnelState);
}

function deriveOnboardingStatus(args) {
  const company = args && args.company;
  if (!company) {
    return {
      state: 'blocked',
      funnel_state: 'blocked',
      reason: 'supplier_not_found',
      publish_gaps: [],
      published: false,
      company_status: null,
      inbox_owned: false,
      opened_is_not_verified: false,
      deliverability: { sent: false, delivered: false, bounced: false, human_engaged: false },
    };
  }
  const funnel = deriveFunnel(args);
  return {
    ...funnel,
    company_status: company.status || null,
    inbox_owned: inboxOwned(funnel.funnel_state, company),
    opened_is_not_verified: funnel.funnel_state === 'claim_page_viewed' || funnel.state === 'opened',
  };
}

module.exports = {
  FACT_TYPES,
  TARGETS,
  FUNNEL_EVENTS,
  depthTier,
  depthTier: depthTier,
  isCountable,
  fact,
  factsFromCompany,
  factsFromExtracted,
  factsFromReplyText,
  factsFromMachineListText,
  factsFromBuyerThread,
  buyerVisibleLines,
  summarizeDepth,
  gapsFromFacts,
  suggestNext,
  detectConflicts,
  staleFacts,
  deriveFunnel,
  deriveOnboardingStatus,
  inboxOwned,
};
