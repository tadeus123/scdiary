const {
  CATEGORIES,
  NICHES,
  PROCESSES,
  PROCESS_GROUPS,
  normalizeNiche,
  categorySearchHaystack,
} = require('./manufacturing-categories');

const CITIES = [
  { id: 'shenzhen', zh: '深圳', en: 'Shenzhen' },
  { id: 'dongguan', zh: '东莞', en: 'Dongguan' },
  { id: 'other', zh: '其他', en: 'Other' },
];

const MATERIALS = [
  { id: 'alu', zh: '铝合金（6061 / 7075 等）', en: 'Aluminum (6061 / 7075…)' },
  { id: 'steel', zh: '碳钢 / 合金钢', en: 'Steel' },
  { id: 'stainless', zh: '不锈钢', en: 'Stainless steel' },
  { id: 'titanium', zh: '钛合金', en: 'Titanium' },
  { id: 'copper', zh: '铜 / 黄铜', en: 'Copper / brass' },
  { id: 'plastic', zh: '工程塑料（POM / PEEK 等）', en: 'Engineering plastics' },
  { id: 'resin', zh: '光敏树脂', en: 'Photopolymer resin' },
  { id: 'pa12', zh: '尼龙 PA12', en: 'Nylon PA12' },
  { id: 'tpu', zh: 'TPU 弹性体', en: 'TPU elastomer' },
];

const FINISHES = [
  { id: 'anodize', zh: '阳极氧化', en: 'Anodizing' },
  { id: 'powder', zh: '粉末喷涂', en: 'Powder coating' },
  { id: 'plating', zh: '电镀', en: 'Plating' },
  { id: 'bead', zh: '喷砂', en: 'Bead blast' },
  { id: 'polish', zh: '抛光', en: 'Polishing' },
  { id: 'heat', zh: '热处理', en: 'Heat treatment' },
];

const CERTS = [
  { id: 'iso9001', zh: 'ISO 9001', en: 'ISO 9001' },
  { id: 'iso13485', zh: 'ISO 13485', en: 'ISO 13485' },
  { id: 'as9100', zh: 'AS9100', en: 'AS9100' },
  { id: 'iatf', zh: 'IATF 16949', en: 'IATF 16949' },
  { id: 'iso14001', zh: 'ISO 14001', en: 'ISO 14001' },
];

const ACTIONS = [
  { id: 'answer_capabilities', zh: '按已填写的能力回答能不能做（不编造机床、证书或交期）', en: 'Answer capability questions from approved information only' },
  { id: 'collect_rfq', zh: '收下项目需求：数量、材料、公差、表面、交期、目的地、图纸', en: 'Collect a structured RFQ (qty, material, tolerance, finish, date, destination, drawings)' },
  { id: 'request_missing', zh: '缺项时向采购追问，不编造', en: 'Ask for missing project information instead of guessing' },
  { id: 'forward_sales', zh: '把合格询盘发到已验证的企业邮箱', en: 'Forward a qualified RFQ to the verified company email' },
  { id: 'contact_sales', zh: '记下「请销售联系」并发到邮箱', en: 'Record a request for sales to contact the buyer' },
  { id: 'book_visit', zh: '记下看厂或电话预约，发到邮箱（不是自动排期）', en: 'Record a call or factory-visit request and email it (no calendar booking)' },
  { id: 'share_certs', zh: '说明已勾选的证书（不提供未填写的文件）', en: 'Share listed certificates only' },
  { id: 'share_shipping', zh: '说明已填写的出货方式', en: 'Share listed shipping terms' },
  { id: 'request_drawings', zh: '缺图纸时请采购补发 STEP / PDF', en: 'Ask the buyer for STEP/PDF when drawings are missing' },
];

const DEFAULT_ACTIONS = ['answer_capabilities', 'collect_rfq', 'request_missing', 'forward_sales'];

const FLEX = [
  { id: 'strict', zh: '严格：只确认已填写内容，不给替代方案', en: 'Strict: confirm listed facts only, no alternatives' },
  { id: 'normal', zh: '正常：可在已填写工艺内建议可行做法', en: 'Normal: suggest options that are already listed' },
  { id: 'creative', zh: '灵活：在已填写能力内主动找可行方案', en: 'Flexible: hunt for a fit inside listed capabilities' },
];

const CONTACT_SLOTS = [
  { role: 'ceo', zh: '负责人 / 老板微信', en: 'Owner / CEO WeChat' },
  { role: 'sales', zh: '销售 1 微信', en: 'Sales 1 WeChat' },
  { role: 'sales', zh: '销售 2 微信', en: 'Sales 2 WeChat' },
  { role: 'sales', zh: '销售 3 微信', en: 'Sales 3 WeChat' },
];

function asList(raw) {
  if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function pickIds(raw, allowed) {
  const allow = new Set(allowed.map((item) => item.id));
  return asList(raw).filter((id) => allow.has(id));
}

function emptyContacts() {
  return CONTACT_SLOTS.map((slot) => ({ role: slot.role, name: '', wechat: '' }));
}

function normalizeContacts(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  return emptyContacts().map((slot, index) => {
    const row = rows[index] && typeof rows[index] === 'object' ? rows[index] : {};
    return {
      role: slot.role,
      name: String(row.name || '').trim().slice(0, 80),
      wechat: String(row.wechat || '').trim().slice(0, 80),
    };
  });
}

function listedContacts(raw) {
  return normalizeContacts(raw).filter((row) => row.wechat);
}

function normalizeFlexibility(raw) {
  const id = String(raw || '').trim();
  return FLEX.some((item) => item.id === id) ? id : 'normal';
}

function mapCityId(city) {
  const value = String(city || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  if (/深圳|shenzhen/.test(lower)) return 'shenzhen';
  if (/东莞|dongguan/.test(lower)) return 'dongguan';
  return 'other';
}

function cityLabel(id, lang) {
  const row = CITIES.find((item) => item.id === id);
  if (!row) return '';
  return lang === 'en' ? row.en : row.zh;
}

function normalizeEnrichment(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const sources = (Array.isArray(source.sources) ? source.sources : [])
    .slice(0, 80)
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const field = String(row.field || '').trim().slice(0, 60);
      const url = String(row.url || '').trim().slice(0, 400);
      const quote = String(row.quote || '').trim().slice(0, 240);
      if (!field) return null;
      return { field, url, quote };
    })
    .filter(Boolean);
  const discovery = source.last_discovery && typeof source.last_discovery === 'object'
    ? {
        query: String(source.last_discovery.query || '').trim().slice(0, 200),
        score: Number(source.last_discovery.score) || 0,
        surfaced: Boolean(source.last_discovery.surfaced),
        at: String(source.last_discovery.at || '').trim(),
      }
    : null;
  return {
    filled_at: String(source.filled_at || '').trim(),
    crawl_pages: Number(source.crawl_pages) || 0,
    model: String(source.model || '').trim().slice(0, 80),
    sources,
    last_discovery: discovery && discovery.query ? discovery : null,
  };
}

function normalizeExtracted(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const list = (key, max) => (Array.isArray(source[key]) ? source[key] : [])
    .map((item) => String(item || '').trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, max);
  return {
    processes: pickIds(source.processes, PROCESSES),
    materials: pickIds(source.materials, MATERIALS),
    typical_quantities: list('typical_quantities', 12),
    lead_time_phrases: list('lead_time_phrases', 12),
    tolerances: list('tolerances', 12),
    buyer_questions: list('buyer_questions', 16),
    dfm_notes: list('dfm_notes', 16),
    moq: String(source.moq || '').trim().slice(0, 120),
    lead_time: String(source.lead_time || '').trim().slice(0, 120),
    summary: String(source.summary || '').trim().slice(0, 1200),
    insights_for_endpoint: String(source.insights_for_endpoint || '').trim().slice(0, 1600),
  };
}

function normalizeQuotationKnowledge(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const documents = (Array.isArray(source.documents) ? source.documents : [])
    .slice(0, 10)
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const id = String(row.id || '').trim().slice(0, 80);
      if (!id) return null;
      return {
        id,
        name: String(row.name || '').trim().slice(0, 200),
        mime: String(row.mime || '').trim().slice(0, 120),
        size: Number(row.size) || 0,
        storage_path: String(row.storage_path || '').trim().slice(0, 400),
        uploaded_at: String(row.uploaded_at || '').trim(),
        extracted_at: String(row.extracted_at || '').trim(),
        status: String(row.status || 'pending').trim().slice(0, 40),
        error: String(row.error || '').trim().slice(0, 240),
      };
    })
    .filter(Boolean);
  return {
    documents,
    extracted: normalizeExtracted(source.extracted),
    endpoint_use: Boolean(source.endpoint_use),
    updated_at: String(source.updated_at || '').trim(),
  };
}

function quotationInsightsText(company) {
  const knowledge = normalizeQuotationKnowledge(
    company && company.profile && company.profile.quotation_knowledge
  );
  if (!knowledge.endpoint_use) return '';
  const extracted = knowledge.extracted || {};
  const lines = [];
  if (extracted.insights_for_endpoint) lines.push(extracted.insights_for_endpoint);
  if (extracted.summary) lines.push(extracted.summary);
  if (extracted.typical_quantities.length) {
    lines.push(`Typical quantities seen in past quotes: ${extracted.typical_quantities.join('; ')}`);
  }
  if (extracted.lead_time_phrases.length) {
    lines.push(`Lead-time patterns: ${extracted.lead_time_phrases.join('; ')}`);
  }
  if (extracted.tolerances.length) {
    lines.push(`Tolerance patterns: ${extracted.tolerances.join('; ')}`);
  }
  if (extracted.buyer_questions.length) {
    lines.push(`Recurring buyer questions: ${extracted.buyer_questions.slice(0, 6).join('; ')}`);
  }
  if (extracted.dfm_notes.length) {
    lines.push(`DFM notes: ${extracted.dfm_notes.slice(0, 6).join('; ')}`);
  }
  const body = lines.filter(Boolean).join('\n').trim();
  if (!body) return '';
  return `Quotation-learned (factory-approved, no customer names):\n${body}`;
}

function normalizeBoard(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    context_uploads: Math.max(0, Math.round(Number(source.context_uploads) || 0)),
    context_bytes: Math.max(0, Math.round(Number(source.context_bytes) || 0)),
    last_upload_at: source.last_upload_at ? String(source.last_upload_at) : '',
  };
}

function normalizeProfile(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    year_founded: String(source.year_founded || '').trim(),
    employees: String(source.employees || '').trim(),
    address: String(source.address || '').trim(),
    export_markets: String(source.export_markets || '').trim(),
    other_city: String(source.other_city || '').trim(),
    processes: pickIds(source.processes, PROCESSES),
    materials: pickIds(source.materials, MATERIALS),
    finishing: pickIds(source.finishing, FINISHES),
    certifications: pickIds(source.certifications, CERTS),
    machines: String(source.machines || '').trim(),
    tolerance: String(source.tolerance || '').trim(),
    max_workpiece: String(source.max_workpiece || '').trim(),
    moq: String(source.moq || '').trim(),
    lead_time: String(source.lead_time || '').trim(),
    shipping: String(source.shipping || '').trim(),
    sample_lead: String(source.sample_lead || '').trim(),
    holidays: String(source.holidays || '').trim(),
    flexibility: normalizeFlexibility(source.flexibility),
    contacts: normalizeContacts(source.contacts),
    site_notes: String(source.site_notes || '').trim().slice(0, 8000),
    claim_ready: Boolean(source.claim_ready),
    is_demo: Boolean(source.is_demo),
    enrichment: normalizeEnrichment(source.enrichment),
    quotation_knowledge: normalizeQuotationKnowledge(source.quotation_knowledge),
    board: normalizeBoard(source.board),
  };
}

function founderWechat(profile) {
  const contacts = normalizeContacts(profile && profile.contacts);
  return String((contacts[0] && contacts[0].wechat) || '').trim();
}

function interactionReady(company) {
  const profile = normalizeProfile(company && company.profile);
  return Boolean(founderWechat(profile) && String(profile.sample_lead || '').trim());
}

function normalizeActions(raw) {
  const picked = pickIds(raw, ACTIONS);
  return picked.length ? picked : DEFAULT_ACTIONS.slice();
}

function labelsFor(ids, catalog, lang) {
  const map = new Map(catalog.map((item) => [item.id, lang === 'en' ? item.en : item.zh]));
  return ids.map((id) => map.get(id) || id);
}

function displayCity(company, lang) {
  const city = String((company && company.city) || '');
  const profile = (company && company.profile) || {};
  if (city === 'other' && profile.other_city) return String(profile.other_city);
  return cityLabel(city, lang) || city;
}

function companyTitle(company, lang) {
  const zh = String((company && company.company_name) || '').trim();
  const en = String((company && company.company_name_en) || '').trim();
  if (lang === 'en') return en || zh || String((company && company.domain) || '');
  return zh || en || String((company && company.domain) || '');
}

function listingText(company) {
  const profile = normalizeProfile(company && company.profile);
  const city = displayCity(company, 'en');
  const lines = [
    `Company: ${companyTitle(company, 'en')}`,
    company && company.company_name ? `Name ZH: ${company.company_name}` : '',
    company && company.domain ? `Domain: ${company.domain}` : '',
    city ? `City: ${city}` : '',
    company && company.niche ? `Niche: ${labelsFor([company.niche], NICHES, 'en')[0] || company.niche}` : '',
    company && company.niche ? `Category search: ${categorySearchHaystack(company.niche)}` : '',
    profile.processes.length ? `Processes: ${labelsFor(profile.processes, PROCESSES, 'en').join(', ')}` : '',
    profile.materials.length ? `Materials: ${labelsFor(profile.materials, MATERIALS, 'en').join(', ')}` : '',
    profile.finishing.length ? `Finishing: ${labelsFor(profile.finishing, FINISHES, 'en').join(', ')}` : '',
    profile.certifications.length ? `Certifications: ${labelsFor(profile.certifications, CERTS, 'en').join(', ')}` : '',
    profile.tolerance ? `Tolerance: ${profile.tolerance}` : '',
    profile.moq ? `MOQ: ${profile.moq}` : '',
    profile.max_workpiece ? `Max workpiece: ${profile.max_workpiece}` : '',
    profile.lead_time ? `Lead time: ${profile.lead_time}` : '',
    profile.shipping ? `Shipping: ${profile.shipping}` : '',
    profile.year_founded ? `Year founded: ${profile.year_founded}` : '',
    profile.employees ? `Employees: ${profile.employees}` : '',
    profile.address ? `Address: ${profile.address}` : '',
    profile.export_markets ? `Export markets: ${profile.export_markets}` : '',
    profile.machines ? `Machines: ${profile.machines}` : '',
    profile.sample_lead ? `How they work / lead times / shutdowns they stand behind: ${profile.sample_lead}` : '',
    profile.holidays ? `Shutdown / holiday calendar: ${profile.holidays}` : '',
    profile.flexibility ? `Reply style: ${profile.flexibility}` : '',
    listedContacts(profile.contacts).length
      ? `WeChat contacts: ${listedContacts(profile.contacts).map((row) => `${row.name || row.role} ${row.wechat}`).join('; ')}`
      : '',
    company && company.context ? `Context: ${company.context}` : '',
    company && company.goal ? `Goal: ${company.goal}` : '',
    quotationInsightsText(company),
  ];
  return lines.filter(Boolean).join('\n');
}

function publishGaps(company) {
  const gaps = [];
  const name = String((company && company.company_name) || '').trim()
    || String((company && company.company_name_en) || '').trim();
  if (!name) gaps.push('company_name');
  if (!String((company && company.city) || '').trim()) gaps.push('city');
  const profile = normalizeProfile(company && company.profile);
  const hasCapability = profile.processes.length > 0
    || profile.materials.length > 0
    || String((company && company.context) || '').trim();
  if (!hasCapability) gaps.push('capabilities');
  if (!String((company && company.goal) || '').trim()) gaps.push('goal');
  return gaps;
}

function canPublish(company) {
  return publishGaps(company).length === 0;
}

function claimListing(company, lang) {
  const locale = lang === 'en' ? 'en' : 'zh';
  const profile = normalizeProfile(company && company.profile);
  const textRow = (key, value) => {
    const text = String(value || '').trim();
    return text ? { key, value: text } : null;
  };
  const chipRow = (key, ids, catalog) => {
    const values = labelsFor(ids || [], catalog, locale).filter(Boolean);
    return values.length ? { key, values } : null;
  };
  const website = (company && company.website)
    || (company && company.domain ? `https://${company.domain}` : '');
  return {
    niche: String((company && company.niche) || 'other'),
    rows: [
      textRow('website', website),
      textRow('email', company && company.contact_email),
      textRow('city', displayCity(company, locale)),
      textRow('context', company && company.context),
      textRow('machines', profile.machines),
      textRow('moq', profile.moq),
      textRow('lead_time', profile.lead_time),
      textRow('tolerance', profile.tolerance),
      textRow('how_you_work', profile.sample_lead),
      textRow('goal', company && company.goal),
    ].filter(Boolean),
    groups: [
      chipRow('processes', profile.processes, PROCESSES),
      chipRow('materials', profile.materials, MATERIALS),
      chipRow('finishing', profile.finishing, FINISHES),
      chipRow('certs', profile.certifications, CERTS),
    ].filter(Boolean),
  };
}

/** New publishes need founder WeChat + how-you-work. Already-live factories skip this gate. */
function qualityReady(company) {
  return canPublish(company) && interactionReady(company);
}

function afterVerifyNext(company, nextQuery) {
  const next = String(nextQuery || '').trim().toLowerCase();
  const dash = (next === 'quotes' || next === 'quotations')
    ? '/airsup/dashboard?quotes=1'
    : '/airsup/dashboard';
  if (company && company.status === 'live') return dash;
  if (interactionReady(company)) return dash;
  return '/airsup/china/onboard';
}

function buyerTestPrompt(company) {
  const profile = normalizeProfile(company && company.profile);
  const city = displayCity(company, 'en') || 'China';
  const niche = labelsFor([company && company.niche], NICHES, 'en')[0]
    || labelsFor(profile.processes.slice(0, 1), PROCESSES, 'en')[0]
    || 'manufacturing';
  const process = labelsFor(profile.processes.slice(0, 1), PROCESSES, 'en')[0];
  const capability = process && process.toLowerCase() !== String(niche).toLowerCase()
    ? `${niche} (${process})`
    : niche;
  return `Find me a ${capability} supplier in ${city} for a Western buyer RFQ. Prefer a real factory domain ChatGPT can ask.`;
}

function publicRecord(company) {
  if (!company) return null;
  const profile = normalizeProfile(company.profile);
  return {
    company_id: company.company_id,
    domain: company.domain,
    website: company.website || `https://${company.domain}`,
    company_name: company.company_name || '',
    company_name_en: company.company_name_en || '',
    city: displayCity(company, 'en'),
    niche: company.niche || 'other',
    status: company.status,
    processes: labelsFor(profile.processes, PROCESSES, 'en'),
    materials: labelsFor(profile.materials, MATERIALS, 'en'),
    finishing: labelsFor(profile.finishing, FINISHES, 'en'),
    certifications: labelsFor(profile.certifications, CERTS, 'en'),
    tolerance: profile.tolerance,
    moq: profile.moq,
    lead_time: profile.lead_time,
    live_at: company.live_at || null,
  };
}

function endpointRecord(company) {
  const pub = publicRecord(company);
  if (!pub) return null;
  const profile = normalizeProfile(company.profile);
  return {
    ...pub,
    context: company.context || '',
    goal: company.goal || '',
    actions: normalizeActions(company.actions),
    action_labels: labelsFor(normalizeActions(company.actions), ACTIONS, 'en'),
    machines: profile.machines,
    export_markets: profile.export_markets,
    sample_lead: profile.sample_lead,
    holidays: profile.holidays,
    flexibility: profile.flexibility,
    contacts: listedContacts(profile.contacts),
    listing_text: listingText(company),
  };
}

function fillEmptyCompany(company, draft) {
  const current = company && typeof company === 'object' ? company : {};
  const incoming = draft && typeof draft === 'object' ? draft : {};
  const next = { ...current };
  for (const key of ['company_name', 'company_name_en', 'city', 'niche', 'context', 'goal']) {
    if (!String(next[key] || '').trim() && String(incoming[key] || '').trim()) next[key] = incoming[key];
  }
  const prevProfile = normalizeProfile(current.profile);
  const draftProfile = normalizeProfile(incoming.profile);
  const firstFill = !String(prevProfile.site_notes || '').trim() && !(prevProfile.processes || []).length;
  if (firstFill) {
    const placeholderCity = !String(current.city || '').trim() || current.city === 'shenzhen';
    const placeholderNiche = !String(current.niche || '').trim() || current.niche === 'cnc' || current.niche === 'other';
    if (placeholderCity && String(incoming.city || '').trim()) next.city = incoming.city;
    if (placeholderNiche && String(incoming.niche || '').trim()) next.niche = incoming.niche;
  }
  next.profile = {
    ...prevProfile,
    ...Object.fromEntries(Object.entries(draftProfile).filter(([key, value]) => {
      if (key === 'contacts' || key === 'flexibility' || key === 'enrichment' || key === 'quotation_knowledge' || key === 'claim_ready' || key === 'is_demo' || key === 'board') return false;
      if (Array.isArray(value)) return value.length && !(Array.isArray(prevProfile[key]) && prevProfile[key].length);
      return Boolean(String(value || '').trim()) && !String(prevProfile[key] || '').trim();
    })),
    contacts: listedContacts(prevProfile.contacts).length ? prevProfile.contacts : draftProfile.contacts,
    flexibility: prevProfile.flexibility || draftProfile.flexibility,
    site_notes: prevProfile.site_notes || draftProfile.site_notes,
    claim_ready: prevProfile.claim_ready || draftProfile.claim_ready,
    is_demo: prevProfile.is_demo || draftProfile.is_demo,
    enrichment: mergeEnrichment(prevProfile.enrichment, draftProfile.enrichment),
    quotation_knowledge: keepQuotationKnowledge(prevProfile.quotation_knowledge, draftProfile.quotation_knowledge),
    board: prevProfile.board,
  };
  return next;
}

function quotationKnowledgePresent(knowledge) {
  const row = normalizeQuotationKnowledge(knowledge);
  const extracted = row.extracted || {};
  return Boolean(
    row.documents.length
    || row.endpoint_use
    || String(extracted.insights_for_endpoint || '').trim()
    || String(extracted.summary || '').trim()
  );
}

function keepQuotationKnowledge(prev, incoming) {
  return quotationKnowledgePresent(prev)
    ? normalizeQuotationKnowledge(prev)
    : normalizeQuotationKnowledge(incoming);
}

function mergeEnrichment(prev, incoming) {
  const a = normalizeEnrichment(prev);
  const b = normalizeEnrichment(incoming);
  const seen = new Set(a.sources.map((row) => `${row.field}|${row.url}|${row.quote}`));
  const sources = a.sources.slice();
  for (const row of b.sources) {
    const key = `${row.field}|${row.url}|${row.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(row);
    if (sources.length >= 80) break;
  }
  return normalizeEnrichment({
    filled_at: b.filled_at || a.filled_at,
    crawl_pages: Math.max(a.crawl_pages, b.crawl_pages),
    model: b.model || a.model,
    sources,
    last_discovery: b.last_discovery || a.last_discovery,
  });
}

function countFilledBuyerFields(company) {
  const profile = normalizeProfile(company && company.profile);
  let n = 0;
  if (String((company && (company.company_name || company.company_name_en)) || '').trim()) n += 1;
  if (String((company && company.city) || '').trim()) n += 1;
  if (String((company && company.context) || '').trim()) n += 1;
  if (profile.processes.length) n += 1;
  if (profile.materials.length) n += 1;
  if (profile.finishing.length) n += 1;
  if (profile.certifications.length) n += 1;
  if (profile.machines) n += 1;
  if (profile.tolerance) n += 1;
  if (profile.moq) n += 1;
  if (profile.lead_time) n += 1;
  if (profile.export_markets) n += 1;
  if (profile.sample_lead) n += 1;
  if (listedContacts(profile.contacts).length) n += 1;
  return n;
}

function enrichmentGaps(company) {
  const profile = normalizeProfile(company && company.profile);
  const gaps = [];
  if (!profile.processes.length && !profile.materials.length) {
    gaps.push({
      field: 'capabilities',
      why: 'No processes or materials listed',
      why_zh: '还没有工艺或材料，采购问起来不好答',
      why_en: 'No processes or materials listed',
    });
  }
  if (!profile.machines) {
    gaps.push({
      field: 'machines',
      why: 'No machines listed for ChatGPT answers',
      why_zh: '还没有设备清单，ChatGPT 不好说清产能',
      why_en: 'No machines listed for ChatGPT answers',
    });
  }
  if (!profile.certifications.length) {
    gaps.push({
      field: 'certifications',
      why: 'No certifications listed',
      why_zh: '还没有认证信息',
      why_en: 'No certifications listed',
    });
  }
  if (!profile.moq) {
    gaps.push({
      field: 'moq',
      why: 'No MOQ listed',
      why_zh: '还没有起订量',
      why_en: 'No MOQ listed',
    });
  }
  if (!profile.lead_time && !profile.sample_lead) {
    gaps.push({
      field: 'lead_time',
      why: 'No lead time or sample lead listed',
      why_zh: '还没有交期或最快样品周期',
      why_en: 'No lead time or sample lead listed',
    });
  }
  if (!listedContacts(profile.contacts).length) {
    gaps.push({
      field: 'wechat',
      why: 'No WeChat contact for sales follow-up',
      why_zh: '还没有销售微信，跟进采购会慢',
      why_en: 'No WeChat contact for sales follow-up',
    });
  }
  if (!profile.export_markets) {
    gaps.push({
      field: 'export_markets',
      why: 'No export markets listed',
      why_zh: '还没有出口市场',
      why_en: 'No export markets listed',
    });
  }
  return gaps;
}

function gapWhy(gap, lang) {
  if (!gap) return '';
  if (lang === 'en') return String(gap.why_en || gap.why || '');
  return String(gap.why_zh || gap.why || '');
}

function operatorListingSummary(company, lang) {
  const profile = normalizeProfile(company && company.profile);
  const city = displayCity(company, lang === 'en' ? 'en' : 'zh');
  const name = companyTitle(company, lang === 'en' ? 'en' : 'zh');
  const niche = labelsFor([company && company.niche], NICHES, lang === 'en' ? 'en' : 'zh')[0] || '';
  const processes = labelsFor(profile.processes.slice(0, 4), PROCESSES, lang === 'en' ? 'en' : 'zh');
  const certs = labelsFor(profile.certifications.slice(0, 3), CERTS, lang === 'en' ? 'en' : 'zh');
  const wechat = listedContacts(profile.contacts).length;
  if (lang === 'en') {
    const bits = [
      name,
      city ? `in ${city}` : '',
      niche ? `(${niche})` : '',
      processes.length ? `Processes: ${processes.join(', ')}.` : '',
      certs.length ? `Certs: ${certs.join(', ')}.` : '',
      profile.moq ? `MOQ: ${profile.moq}.` : '',
      wechat ? 'WeChat contacts published.' : 'WeChat not published yet.',
      'Qualified inquiries go to your verified company email.',
    ];
    return bits.filter(Boolean).join(' ');
  }
  const bits = [
    name,
    city ? `· ${city}` : '',
    niche ? `· ${niche}` : '',
    processes.length ? `工艺：${processes.join('、')}。` : '',
    certs.length ? `认证：${certs.join('、')}。` : '',
    profile.moq ? `起订量：${profile.moq}。` : '',
    wechat ? '已发布销售微信。' : '尚未发布微信。',
    '合格询盘会发到你们已验证的企业邮箱。',
  ];
  return bits.filter(Boolean).join(' ');
}

function formatLiveAt(iso, lang) {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (lang === 'en') return `${y}-${m}-${day}`;
  return `${y}年${m}月${day}日`;
}

module.exports = {
  CATEGORIES,
  NICHES,
  PROCESS_GROUPS,
  CITIES,
  PROCESSES,
  MATERIALS,
  FINISHES,
  CERTS,
  ACTIONS,
  DEFAULT_ACTIONS,
  FLEX,
  CONTACT_SLOTS,
  normalizeProfile,
  normalizeEnrichment,
  normalizeQuotationKnowledge,
  normalizeExtracted,
  quotationInsightsText,
  founderWechat,
  interactionReady,
  normalizeActions,
  normalizeNiche,
  normalizeContacts,
  normalizeFlexibility,
  listedContacts,
  mapCityId,
  fillEmptyCompany,
  mergeEnrichment,
  countFilledBuyerFields,
  enrichmentGaps,
  gapWhy,
  operatorListingSummary,
  formatLiveAt,
  cityLabel,
  displayCity,
  companyTitle,
  listingText,
  claimListing,
  categorySearchHaystack,
  publishGaps,
  canPublish,
  qualityReady,
  afterVerifyNext,
  buyerTestPrompt,
  publicRecord,
  endpointRecord,
};
