const CITIES = [
  { id: 'shenzhen', zh: '深圳', en: 'Shenzhen' },
  { id: 'dongguan', zh: '东莞', en: 'Dongguan' },
  { id: 'other', zh: '其他', en: 'Other' },
];

const PROCESSES = [
  { id: '3axis', zh: '三轴铣', en: '3-axis milling' },
  { id: '4axis', zh: '四轴铣', en: '4-axis milling' },
  { id: '5axis', zh: '五轴铣', en: '5-axis milling' },
  { id: 'turning', zh: '车削', en: 'CNC turning' },
  { id: 'swiss', zh: '走心机', en: 'Swiss turning' },
  { id: 'edm', zh: '放电加工', en: 'EDM' },
  { id: 'grinding', zh: '磨削', en: 'Grinding' },
  { id: 'sheet', zh: '钣金', en: 'Sheet metal' },
];

const MATERIALS = [
  { id: 'alu', zh: '铝合金（6061 / 7075 等）', en: 'Aluminum (6061 / 7075…)' },
  { id: 'steel', zh: '碳钢 / 合金钢', en: 'Steel' },
  { id: 'stainless', zh: '不锈钢', en: 'Stainless steel' },
  { id: 'titanium', zh: '钛合金', en: 'Titanium' },
  { id: 'copper', zh: '铜 / 黄铜', en: 'Copper / brass' },
  { id: 'plastic', zh: '工程塑料（POM / PEEK 等）', en: 'Engineering plastics' },
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
  { id: 'answer_rfq', zh: '按图纸回答询价（材料、公差、交期、单价区间）', en: 'Answer RFQs (material, tolerance, lead time, price range)' },
  { id: 'share_capacity', zh: '说明当前产能与可接订单窗口', en: 'Share current capacity and booking window' },
  { id: 'share_dfm', zh: '给出可制造性（DFM）意见', en: 'Give DFM notes' },
  { id: 'share_certs', zh: '提供证书与出口相关文件说明', en: 'Share certificates and export documents' },
  { id: 'share_shipping', zh: '说明包装、货代与运到欧美的方式', en: 'Explain packing, freight and shipping to EU/US' },
  { id: 'request_drawings', zh: '在缺图纸时请采购补发 STEP / PDF', en: 'Ask the buyer for STEP/PDF when drawings are missing' },
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

function cityLabel(id, lang) {
  const row = CITIES.find((item) => item.id === id);
  if (!row) return '';
  return lang === 'en' ? row.en : row.zh;
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
  };
}

function normalizeActions(raw) {
  return pickIds(raw, ACTIONS);
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
    'Niche: CNC machining, Shenzhen/Dongguan export',
    profile.processes.length ? `Processes: ${labelsFor(profile.processes, PROCESSES, 'en').join(', ')}` : '',
    profile.materials.length ? `Materials: ${labelsFor(profile.materials, MATERIALS, 'en').join(', ')}` : '',
    profile.finishing.length ? `Finishing: ${labelsFor(profile.finishing, FINISHES, 'en').join(', ')}` : '',
    profile.certifications.length ? `Certifications: ${labelsFor(profile.certifications, CERTS, 'en').join(', ')}` : '',
    profile.tolerance ? `Tolerance: ${profile.tolerance}` : '',
    profile.moq ? `MOQ: ${profile.moq}` : '',
    profile.lead_time ? `Lead time: ${profile.lead_time}` : '',
    profile.export_markets ? `Export markets: ${profile.export_markets}` : '',
    profile.machines ? `Machines: ${profile.machines}` : '',
    company && company.context ? `Context: ${company.context}` : '',
    company && company.goal ? `Goal: ${company.goal}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function canPublish(company) {
  const name = String((company && company.company_name) || '').trim() || String((company && company.company_name_en) || '').trim();
  const city = String((company && company.city) || '').trim();
  const profile = normalizeProfile(company && company.profile);
  const hasCapability = profile.processes.length > 0 || profile.materials.length > 0 || String((company && company.context) || '').trim();
  const goal = String((company && company.goal) || '').trim();
  return Boolean(name && city && hasCapability && goal);
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
    niche: company.niche || 'cnc',
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
    listing_text: listingText(company),
  };
}

module.exports = {
  CITIES,
  PROCESSES,
  MATERIALS,
  FINISHES,
  CERTS,
  ACTIONS,
  normalizeProfile,
  normalizeActions,
  cityLabel,
  displayCity,
  companyTitle,
  listingText,
  canPublish,
  publicRecord,
  endpointRecord,
};
