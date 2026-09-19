/**
 * Canonical Airsup China manufacturing categories.
 * Single source for onboarding, scrape, search, cards, and live roster.
 * Aliases never become stored category ids.
 */
function cap(id, zh, en, aliases) {
  return { id, zh, en, aliases: aliases || [] };
}

const CATEGORIES = [
  {
    slug: 'cnc',
    name: 'CNC machining',
    nameZh: 'CNC 机加工',
    description: 'Precision CNC milling, turning, and related subtractive machining.',
    descriptionZh: '精密 CNC 铣削、车削及相关减材加工。',
    aliases: ['CNC', 'CNC machining', 'machining', '铣削', '车削', '五轴', '精密加工'],
    searchTerms: [
      'CNC supplier China',
      '5-axis CNC machining factory',
      'precision CNC parts Shenzhen',
    ],
    excludeTerms: [],
    capabilities: [
      cap('3axis', '三轴铣', '3-axis milling', ['3-axis', '3 axis', '三轴']),
      cap('4axis', '四轴铣', '4-axis milling', ['4-axis', '4 axis', '四轴']),
      cap('5axis', '五轴铣', '5-axis milling', ['5-axis', '5 axis', '五轴']),
      cap('turning', '车削', 'CNC turning', ['turning', '车削', '车床']),
      cap('swiss', '走心机', 'Swiss turning', ['swiss', '走心']),
      cap('edm', '放电加工', 'EDM', ['edm', '放电']),
      cap('grinding', '磨削', 'Grinding', ['grind', 'grinding', '磨削']),
    ],
  },
  {
    slug: 'injection',
    name: 'Injection molding / molds',
    nameZh: '注塑 / 模具',
    description: 'Plastic injection molding, tooling, and related mold making.',
    descriptionZh: '塑料注塑、开模及相关模具制造。',
    aliases: [
      'injection molding',
      'injection moulding',
      'plastic injection',
      'mould',
      'mold making',
      '注塑',
      '模具',
      'PA66',
      'ABS',
    ],
    searchTerms: [
      'injection molding factory China',
      'plastic injection supplier Dongguan',
      'tooling and injection molding',
    ],
    excludeTerms: ['mim', 'metal injection', '金属注射', 'silicone', 'lsr', 'rubber molding', '硅胶', '液态硅胶'],
    capabilities: [
      cap('injection', '注塑', 'Injection molding', ['injection', '注塑']),
      cap('mold', '模具', 'Mold making', ['mold', 'mould', '模具']),
    ],
  },
  {
    slug: 'pcba',
    name: 'PCBA / SMT',
    nameZh: 'PCBA / SMT',
    description: 'Printed circuit board assembly, SMT, and related electronics manufacturing.',
    descriptionZh: '电路板组装、SMT 贴片及相关电子制造。',
    aliases: ['PCBA', 'SMT', 'PCB assembly', '电路', '贴片', 'pcb'],
    searchTerms: [
      'PCBA factory Shenzhen',
      'SMT assembly supplier',
      'small batch PCB assembly China',
    ],
    excludeTerms: [],
    capabilities: [
      cap('pcba', 'PCBA / SMT', 'PCBA / SMT', ['pcba', 'smt', '贴片']),
    ],
  },
  {
    slug: '3d_printing',
    name: '3D printing / additive',
    nameZh: '3D 打印 / 增材',
    description: 'Additive manufacturing: SLA, SLS, FDM, MJF and related 3D printing.',
    descriptionZh: '增材制造：SLA、SLS、FDM、MJF 及相关 3D 打印。',
    aliases: [
      '3D printing',
      '3d print',
      'additive',
      'additive manufacturing',
      'SLA',
      'SLS',
      'FDM',
      'MJF',
      '增材',
      '3D打印',
      '3d打印',
      '三维打印',
      'nylon sintering',
      'resin prototypes',
    ],
    searchTerms: [
      '3D printing supplier Shenzhen',
      'SLA resin prototype factory',
      'SLS nylon additive manufacturing',
    ],
    excludeTerms: ['powder metallurgy', '粉末冶金', 'mim', 'metal injection', 'debinding', '脱脂'],
    capabilities: [
      cap('sla', 'SLA 光固化', 'SLA resin printing', ['sla', '光固化', 'stereolith']),
      cap('sls', 'SLS 尼龙烧结', 'SLS nylon sintering', ['sls', '尼龙烧结', 'selective laser sinter']),
      cap('fdm', 'FDM / FFF', 'FDM / FFF', ['fdm', 'fff', 'fused deposition']),
      cap('mjf', 'HP MJF', 'HP Multi Jet Fusion', ['mjf', 'multi jet fusion', '多射流']),
    ],
  },
  {
    slug: 'sintering',
    name: 'Sintering / Powder Metallurgy',
    nameZh: '烧结 / 粉末冶金',
    description: 'Powder metallurgy, MIM, metal and ceramic sintering, debinding, and PM parts.',
    descriptionZh: '粉末冶金、MIM、金属/陶瓷烧结、脱脂及粉末冶金零件。',
    aliases: [
      'sintering',
      'powder metallurgy',
      'powder metal',
      'MIM',
      'metal injection molding',
      'metal sintering',
      'ceramic sintering',
      'debinding',
      'PM parts',
      '粉末冶金',
      '金属注射成型',
      '脱脂',
      '金属烧结',
      '陶瓷烧结',
    ],
    searchTerms: [
      'powder metallurgy manufacturer',
      'MIM metal injection molding factory',
      'sintered PM parts supplier',
    ],
    excludeTerms: [
      'sla',
      'sls',
      'fdm',
      'mjf',
      '3d print',
      '3d printing',
      'additive',
      '尼龙烧结',
      '增材',
      '3d打印',
      '3D打印',
    ],
    capabilities: [
      cap('powder-metallurgy', '粉末冶金', 'Powder metallurgy', ['powder metallurgy', '粉末冶金']),
      cap('mim', 'MIM 金属注射成型', 'Metal injection molding (MIM)', ['mim', 'metal injection molding', '金属注射成型']),
      cap('metal-sintering', '金属烧结', 'Metal sintering', ['metal sintering', '金属烧结']),
      cap('ceramic-sintering', '陶瓷烧结', 'Ceramic sintering', ['ceramic sintering', '陶瓷烧结']),
      cap('debinding', '脱脂', 'Debinding', ['debinding', '脱脂']),
      cap('pm-parts', '粉末冶金零件', 'PM parts', ['pm parts', '粉末冶金零件']),
    ],
  },
  {
    slug: 'led-manufacturing',
    name: 'LED Manufacturing',
    nameZh: 'LED 制造',
    description: 'LED modules, strips, COB, addressable LEDs, custom assemblies, and displays.',
    descriptionZh: 'LED 模组、灯带、COB、可寻址灯珠、定制组装及显示屏。',
    aliases: [
      'LED manufacturing',
      'LED modules',
      'LED strips',
      'LED strip',
      'COB LED',
      'addressable LEDs',
      'LED assemblies',
      'LED displays',
      '灯珠',
      '灯带',
      '灯条',
    ],
    searchTerms: [
      'LED module manufacturer',
      'custom LED strip factory',
      'COB LED assembly China',
    ],
    excludeTerms: [],
    capabilities: [
      cap('led-modules', 'LED 模组', 'LED modules', ['led module', 'led modules', 'led模组']),
      cap('led-strips', 'LED 灯带', 'LED strips', ['led strip', 'led strips', '灯带', '灯条']),
      cap('cob', 'COB', 'COB', ['cob']),
      cap('addressable-leds', '可寻址 LED', 'Addressable LEDs', ['addressable led', 'addressable leds']),
      cap('custom-led-assemblies', '定制 LED 组装', 'Custom LED assemblies', ['led assembl', 'custom led']),
      cap('led-displays', 'LED 显示屏', 'LED displays', ['led display', 'led displays', '显示屏']),
    ],
  },
  {
    slug: 'woodworking',
    name: 'Woodworking',
    nameZh: '木工 / 家具',
    description: 'CNC wood, cabinetry, furniture, plywood/MDF machining, and solid wood manufacturing.',
    descriptionZh: '数控木工、柜体、家具、胶合板/密度板加工及实木制造。',
    aliases: [
      'woodworking',
      'CNC wood',
      'cabinetry',
      'cabinet making',
      'furniture manufacturing',
      'plywood',
      'MDF',
      'solid wood',
      '木工',
      '家具',
      '柜体',
      '实木',
      '密度板',
      '胶合板',
    ],
    searchTerms: [
      'CNC wood furniture factory',
      'cabinetry manufacturer China',
      'solid wood manufacturing supplier',
    ],
    excludeTerms: [],
    capabilities: [
      cap('cnc-wood', '数控木工', 'CNC wood', ['cnc wood', 'wood cnc', '数控木工']),
      cap('cabinetry', '柜体', 'Cabinetry', ['cabinetry', 'cabinet', '柜体']),
      cap('furniture', '家具', 'Furniture', ['furniture', '家具']),
      cap('plywood-mdf', '胶合板 / 密度板', 'Plywood / MDF machining', ['plywood', 'mdf', '密度板', '胶合板']),
      cap('solid-wood', '实木', 'Solid wood manufacturing', ['solid wood', '实木']),
    ],
  },
  {
    slug: 'sheet-metal',
    name: 'Sheet Metal Fabrication',
    nameZh: '钣金加工',
    description: 'Laser cutting, bending, punching, stamping, welding, and metal enclosures.',
    descriptionZh: '激光切割、折弯、冲孔、冲压、焊接及金属机箱。',
    aliases: [
      'sheet metal',
      'sheet-metal',
      'laser cutting',
      'bending',
      'punching',
      'stamping',
      'metal enclosures',
      '钣金',
      '激光切割',
      '折弯',
      '冲压',
    ],
    searchTerms: [
      'sheet metal fabrication China',
      'laser cutting bending factory',
      'metal enclosure manufacturer',
    ],
    excludeTerms: ['5-axis', '5 axis', '五轴', 'swiss', 'milling'],
    requireAbsent: ['cnc'],
    capabilities: [
      cap('sheet', '钣金', 'Sheet metal', ['sheet metal', '钣金']),
      cap('laser-cutting', '激光切割', 'Laser cutting', ['laser cutting', '激光切割']),
      cap('bending', '折弯', 'Bending', ['bending', '折弯']),
      cap('punching', '冲孔', 'Punching', ['punching', '冲孔']),
      cap('stamping', '冲压', 'Stamping', ['stamping', '冲压']),
      cap('welding', '焊接', 'Welding', ['welding', '焊接']),
      cap('metal-enclosures', '金属机箱', 'Metal enclosures', ['metal enclosure', 'enclosures', '机箱']),
    ],
  },
  {
    slug: 'battery-manufacturing',
    name: 'Battery Manufacturing',
    nameZh: '电池制造',
    description: 'Li-ion/LiPo cells, custom battery packs, BMS integration, and wearable batteries.',
    descriptionZh: '锂离子/聚合物电芯、定制电池包、BMS 集成及可穿戴电池。',
    aliases: [
      'battery manufacturing',
      'battery pack',
      'Li-ion',
      'LiPo',
      'lithium ion',
      'lithium polymer',
      'BMS',
      'battery cells',
      '电芯',
      '电池包',
      '锂电池',
    ],
    searchTerms: [
      'Li-ion cell manufacturer',
      'custom battery pack factory',
      'BMS integration manufacturer',
    ],
    excludeTerms: ['wholesale', 'reseller', 'distributor', 'retail', 'buy batteries', 'battery shop', 'battery store'],
    requireTerms: ['manufacturer', 'manufacturing', 'factory', 'cell', 'cells', 'pack', 'packs', 'bms', '电芯', '电池包', '厂家', '工厂', '制造'],
    capabilities: [
      cap('li-ion-cells', '锂离子电芯', 'Li-ion cells', ['li-ion', 'lithium ion', '锂离子电芯']),
      cap('lipo-cells', '聚合物电芯', 'LiPo cells', ['lipo', 'lithium polymer', '聚合物电芯']),
      cap('custom-battery-packs', '定制电池包', 'Custom battery packs', ['battery pack', 'battery packs', '电池包']),
      cap('bms-integration', 'BMS 集成', 'BMS integration', ['bms']),
      cap('wearable-batteries', '可穿戴电池', 'Wearable batteries', ['wearable batter', '可穿戴电池']),
    ],
  },
  {
    slug: 'cable-assemblies',
    name: 'Cable & Wire Harness Manufacturing',
    nameZh: '线缆 / 线束制造',
    description: 'Power cables, wire harnesses, connectorized cables, crimping, soldering, and overmolded cables.',
    descriptionZh: '电源线、线束、带接头线缆、压接、焊接及包胶线缆。',
    aliases: [
      'cable assemblies',
      'wire harness',
      'wire harnesses',
      'power cables',
      'connectorized cables',
      'overmolded cables',
      'crimping',
      '线束',
      '线缆',
      '端子',
    ],
    searchTerms: [
      'wire harness manufacturer',
      'custom cable assembly factory',
      'overmolded cable supplier',
    ],
    excludeTerms: [],
    capabilities: [
      cap('power-cables', '电源线', 'Power cables', ['power cable', 'power cables', '电源线']),
      cap('wire-harnesses', '线束', 'Wire harnesses', ['wire harness', 'wire harnesses', '线束']),
      cap('connectorized-cables', '带接头线缆', 'Connectorized cables', ['connectorized', 'connector cable']),
      cap('crimping', '压接', 'Crimping', ['crimping', '压接']),
      cap('cable-soldering', '线缆焊接', 'Cable soldering', ['cable soldering', '线缆焊接']),
      cap('overmolded-cables', '包胶线缆', 'Overmolded cables', ['overmolded', 'overmold', '包胶']),
    ],
  },
  {
    slug: 'biosignal-electrodes',
    name: 'Biosignal Electrodes',
    nameZh: '生物电电极',
    description: 'Custom electrodes for EEG, ECG, EMG and wearable biosensing.',
    descriptionZh: '用于脑电、心电、肌电及可穿戴生物传感的定制电极。',
    aliases: [
      'electrodes',
      'EEG electrodes',
      'ECG electrodes',
      'EMG electrodes',
      'Ag/AgCl electrodes',
      'dry electrodes',
      'comb electrodes',
      'pin electrodes',
      'biosignal',
      'biosensing electrodes',
      '脑电电极',
      '心电电极',
      '肌电电极',
      '生物电极',
      '干电极',
    ],
    searchTerms: [
      'Ag/AgCl electrode manufacturer',
      'EEG electrode manufacturer',
      'dry electrode factory',
      'custom biosignal electrode',
    ],
    excludeTerms: [
      'welding electrode',
      'welding electrodes',
      'electrolysis',
      'spark electrode',
      'stick electrode',
      'arc welding',
      '焊条',
      '焊接电极',
    ],
    capabilities: [
      cap('ag-agcl', 'Ag/AgCl', 'Ag/AgCl', ['ag/agcl', 'agcl', 'ag agcl']),
      cap('eeg-electrodes', '脑电电极', 'EEG electrodes', ['eeg', '脑电']),
      cap('ecg-electrodes', '心电电极', 'ECG electrodes', ['ecg', 'ekg', '心电']),
      cap('emg-electrodes', '肌电电极', 'EMG electrodes', ['emg', '肌电']),
      cap('dry-electrodes', '干电极', 'Dry electrodes', ['dry electrode', 'dry electrodes', '干电极']),
      cap('comb-electrodes', '梳状电极', 'Comb electrodes', ['comb electrode', 'comb electrodes', '梳状电极']),
      cap('pin-electrodes', '针状电极', 'Pin electrodes', ['pin electrode', 'pin electrodes', '针状电极']),
      cap('conductive-rubber', '导电橡胶电极', 'Conductive rubber electrodes', ['conductive rubber', '导电橡胶']),
      cap('hydrogel-electrodes', '水凝胶电极', 'Hydrogel electrodes', ['hydrogel', '水凝胶']),
      cap('wearable-biosensing', '可穿戴生物传感', 'Wearable biosensing', ['wearable biosens', '可穿戴生物']),
      cap('custom-tooling', '定制工装', 'Custom tooling', ['custom tooling', '定制工装']),
    ],
  },
  {
    slug: 'elastomer-manufacturing',
    name: 'Silicone / Rubber / Urethane Manufacturing',
    nameZh: '硅胶 / 橡胶 / 聚氨酯',
    description: 'LSR, silicone molding, rubber molding, compression molding, urethane/vacuum casting, elastomer overmolding.',
    descriptionZh: '液态硅胶、硅胶成型、橡胶成型、压缩模、聚氨酯/真空复模及弹性体包胶。',
    aliases: [
      'elastomer',
      'LSR',
      'silicone molding',
      'silicone moulding',
      'rubber molding',
      'compression molding',
      'urethane casting',
      'vacuum casting',
      'elastomer overmolding',
      '硅胶',
      '橡胶',
      '聚氨酯',
      '液态硅胶',
    ],
    searchTerms: [
      'LSR silicone molding factory',
      'rubber compression molding manufacturer',
      'urethane vacuum casting supplier',
    ],
    excludeTerms: ['pa66', 'abs', 'plastic injection'],
    capabilities: [
      cap('lsr', '液态硅胶 LSR', 'LSR', ['lsr', 'liquid silicone', '液态硅胶']),
      cap('silicone-molding', '硅胶成型', 'Silicone molding', ['silicone molding', 'silicone moulding', '硅胶成型']),
      cap('rubber-molding', '橡胶成型', 'Rubber molding', ['rubber molding', 'rubber moulding', '橡胶成型']),
      cap('compression-molding', '压缩模', 'Compression molding', ['compression molding', '压缩模']),
      cap('urethane-casting', '聚氨酯浇注', 'Urethane casting', ['urethane', 'urethane casting', '聚氨酯']),
      cap('vacuum-casting', '真空复模', 'Vacuum casting', ['vacuum casting', '真空复模']),
      cap('elastomer-overmolding', '弹性体包胶', 'Elastomer overmolding', ['elastomer overmold', 'overmolding', '包胶']),
    ],
  },
  {
    slug: 'other',
    name: 'Other export manufacturing',
    nameZh: '其他出口制造',
    description: 'Export manufacturing that does not fit a more specific category.',
    descriptionZh: '不属于更具体品类的出口制造。',
    aliases: ['other export manufacturing', '其他出口制造'],
    searchTerms: ['other export manufacturing China'],
    excludeTerms: [],
    capabilities: [],
  },
];

const MATCH_ORDER = [
  'biosignal-electrodes',
  'battery-manufacturing',
  'cable-assemblies',
  'led-manufacturing',
  'elastomer-manufacturing',
  'sintering',
  'sheet-metal',
  'woodworking',
  'pcba',
  '3d_printing',
  'injection',
  'cnc',
  'other',
];

const bySlug = new Map(CATEGORIES.map((row) => [row.slug, row]));

function escapeRe(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function foldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, ' ');
}

function hayVariants(text) {
  const raw = String(text || '').toLowerCase();
  const spaced = raw.replace(/[_/,]+/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return { raw, spaced };
}

function hasTerm(hays, term) {
  const t = String(term || '').trim().toLowerCase();
  if (!t) return false;
  if (/[\u4e00-\u9fff]/.test(t)) {
    return hays.raw.includes(t) || hays.spaced.includes(t);
  }
  const spaced = t.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return false;
  if (spaced.includes(' ')) {
    return hays.spaced.includes(spaced) || hays.raw.includes(t);
  }
  if (spaced.length <= 4) {
    const re = new RegExp(`(?:^|[^a-z0-9\\u4e00-\\u9fff])${escapeRe(spaced)}(?:[^a-z0-9\\u4e00-\\u9fff]|$)`, 'i');
    return re.test(hays.spaced) || re.test(hays.raw);
  }
  return hays.spaced.includes(spaced) || hays.raw.includes(t);
}

function hasAnyTerm(hays, terms) {
  return (terms || []).some((term) => hasTerm(hays, term));
}

const slugKeys = new Set();
CATEGORIES.forEach((row) => {
  slugKeys.add(row.slug);
  slugKeys.add(foldKey(row.slug));
  slugKeys.add(row.slug.replace(/-/g, '_'));
  slugKeys.add(row.slug.replace(/_/g, '-'));
});

const aliasMap = new Map();

function addAliasKey(alias, slug) {
  const keys = [
    foldKey(alias),
    foldKey(alias).replace(/-/g, '_'),
    foldKey(alias).replace(/_/g, '-'),
    String(alias || '').trim().toLowerCase(),
  ];
  keys.forEach((key) => {
    if (!key) return;
    const existing = aliasMap.get(key);
    if (existing && existing !== slug) return;
    if (slugKeys.has(key) && key !== slug && key !== foldKey(slug) && key !== slug.replace(/-/g, '_') && key !== slug.replace(/_/g, '-')) {
      return;
    }
    aliasMap.set(key, slug);
  });
}

CATEGORIES.forEach((row) => {
  addAliasKey(row.slug, row.slug);
  addAliasKey(row.name, row.slug);
  addAliasKey(row.nameZh, row.slug);
  (row.aliases || []).forEach((alias) => addAliasKey(alias, row.slug));
});

function categoryMatchTerms(row) {
  return [
    row.slug.replace(/[-_]+/g, ' '),
    row.name,
    row.nameZh,
    ...(row.aliases || []),
    ...(row.searchTerms || []),
  ];
}

function categoryMatches(row, hays) {
  if (hasAnyTerm(hays, row.excludeTerms)) return false;
  if (Array.isArray(row.requireAbsent) && hasAnyTerm(hays, row.requireAbsent)) return false;
  if (Array.isArray(row.requireTerms) && row.requireTerms.length && !hasAnyTerm(hays, row.requireTerms)) {
    return false;
  }
  return hasAnyTerm(hays, categoryMatchTerms(row));
}

function routeQueryToCategory(query) {
  const text = String(query || '').trim();
  if (!text) return null;
  const hays = hayVariants(text);
  for (const slug of MATCH_ORDER) {
    const row = bySlug.get(slug);
    if (!row || slug === 'other') continue;
    if (categoryMatches(row, hays)) return slug;
  }
  const other = bySlug.get('other');
  if (other && categoryMatches(other, hays)) return 'other';
  return null;
}

function guessNiche(text) {
  return routeQueryToCategory(text) || 'other';
}

function normalizeNiche(raw) {
  const folded = foldKey(raw);
  if (!folded) return 'other';
  const direct = bySlug.get(String(raw || '').trim())
    || bySlug.get(folded)
    || bySlug.get(folded.replace(/-/g, '_'))
    || bySlug.get(String(raw || '').trim().replace(/-/g, '_'));
  if (direct) return direct.slug;
  return aliasMap.get(folded)
    || aliasMap.get(folded.replace(/-/g, '_'))
    || aliasMap.get(String(raw || '').trim().toLowerCase())
    || 'other';
}

function categorySearchHaystack(slug) {
  const row = bySlug.get(slug);
  if (!row) return '';
  const bits = [
    row.slug,
    row.name,
    row.nameZh,
    row.description,
    ...(row.aliases || []),
    ...(row.searchTerms || []),
  ];
  (row.capabilities || []).forEach((item) => {
    bits.push(item.id, item.en, item.zh, ...(item.aliases || []));
  });
  return bits.filter(Boolean).join(' ');
}

function isBroadFactoryQuery(query) {
  const q = String(query || '');
  if (/\b(factor(?:y|ies)?|supplier|manufactur|demo|谁|厂家|工厂|制造商|供应商|演示)\b/i.test(q)) {
    return true;
  }
  return Boolean(routeQueryToCategory(q));
}

function heuristicProcessIdsFromText(text) {
  const hays = hayVariants(text);
  const ids = [];
  PROCESSES.forEach((item) => {
    const terms = [item.en, item.zh, ...(item.aliases || [])];
    if (item.id.includes('-') || item.id.length > 6) terms.push(item.id.replace(/-/g, ' '));
    if (hasAnyTerm(hays, terms)) ids.push(item.id);
  });
  return Array.from(new Set(ids));
}

const NICHES = CATEGORIES.map((row) => ({
  id: row.slug,
  zh: row.nameZh,
  en: row.name,
}));

const seenProcess = new Set();
const PROCESSES = [];
CATEGORIES.forEach((row) => {
  (row.capabilities || []).forEach((item) => {
    if (seenProcess.has(item.id)) return;
    seenProcess.add(item.id);
    PROCESSES.push(item);
  });
});

const PROCESS_GROUPS = CATEGORIES
  .map((row) => ({
    id: row.slug,
    zh: row.nameZh,
    en: row.name,
    items: row.capabilities || [],
  }))
  .filter((group) => group.items.length);

function scrapeNicheEnum() {
  return CATEGORIES.map((row) => row.slug).join('|');
}

function scrapeProcessEnum() {
  return PROCESSES.map((row) => row.id).join(',');
}

module.exports = {
  CATEGORIES,
  MATCH_ORDER,
  NICHES,
  PROCESSES,
  PROCESS_GROUPS,
  normalizeNiche,
  guessNiche,
  routeQueryToCategory,
  categorySearchHaystack,
  isBroadFactoryQuery,
  heuristicProcessIdsFromText,
  scrapeNicheEnum,
  scrapeProcessEnum,
  bySlug,
};
