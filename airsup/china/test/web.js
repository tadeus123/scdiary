/**
 * Abstract company endpoint "web" for /airsup/china/test.
 * Concept only — not wired to live china publish.
 */

const NODE_DEFS = [
  { id: 'core', zh: '工厂', en: 'Factory', weight: 0 },
  { id: 'domain', zh: '域名 / 网站', en: 'Domain / site', weight: 18 },
  { id: 'process', zh: '工艺', en: 'Processes', weight: 18 },
  { id: 'material', zh: '材料', en: 'Materials', weight: 14 },
  { id: 'quotes', zh: '历史报价', en: 'Past quotes', weight: 20 },
  { id: 'contact', zh: '联系 / 微信', en: 'Contact / WeChat', weight: 14 },
  { id: 'lead', zh: '交期 / 样品', en: 'Lead / samples', weight: 10 },
  { id: 'export', zh: '出口能力', en: 'Export readiness', weight: 6 },
];

const EDGES = [
  ['core', 'domain'],
  ['core', 'process'],
  ['core', 'material'],
  ['core', 'quotes'],
  ['core', 'contact'],
  ['core', 'lead'],
  ['core', 'export'],
  ['process', 'material'],
  ['process', 'quotes'],
  ['material', 'quotes'],
  ['contact', 'lead'],
  ['domain', 'export'],
];

function emptyWeb(lang) {
  const nodes = {};
  for (const def of NODE_DEFS) {
    nodes[def.id] = {
      id: def.id,
      label: lang === 'en' ? def.en : def.zh,
      strength: def.id === 'core' ? 0.35 : 0,
      hints: [],
      count: def.id === 'core' ? 1 : 0,
    };
  }
  return {
    nodes,
    edges: EDGES.map(([from, to]) => ({ from, to })),
    reach: 8,
    reachHistory: [8],
    events: [],
  };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function computeReach(nodes) {
  let score = 8;
  for (const def of NODE_DEFS) {
    if (def.id === 'core') continue;
    const node = nodes[def.id];
    const s = node ? Number(node.strength) || 0 : 0;
    score += def.weight * s;
  }
  return Math.round(Math.max(8, Math.min(100, score)));
}

function bump(node, amount, hint) {
  if (!node) return false;
  const before = node.strength;
  node.strength = clamp01(node.strength + amount);
  if (hint) {
    const clean = String(hint).trim().slice(0, 80);
    if (clean && !node.hints.includes(clean)) {
      node.hints = [clean, ...node.hints].slice(0, 6);
    }
  }
  if (amount > 0) node.count = (node.count || 0) + 1;
  return node.strength > before + 0.001;
}

function extractSignals({ message, files, lang }) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const signals = [];

  if (/https?:\/\//i.test(text) || /\b[\w.-]+\.(com|cn|net|co)\b/i.test(text)) {
    const m = text.match(/https?:\/\/[^\s]+/i) || text.match(/\b[\w.-]+\.(com|cn|net|co)\b/i);
    signals.push({ node: 'domain', amount: 0.45, hint: m ? m[0] : 'website' });
    signals.push({ node: 'export', amount: 0.12, hint: lang === 'en' ? 'public site' : '公开网站' });
  }

  if (/\b(sla|sls|fdm|mjf|cnc|注塑|机加|钣金|冲压|铸造|喷涂|阳极|3d\s*print|resin|铣削|车削)\b/i.test(lower)
    || /工艺|打印|机加|注塑/.test(text)) {
    const m = text.match(/\b(SLA|SLS|FDM|MJF|CNC|注塑|机加|钣金|3D\s*打印|树脂)\b/i);
    signals.push({ node: 'process', amount: 0.35, hint: m ? m[0] : (lang === 'en' ? 'process' : '工艺') });
  }

  if (/\b(aluminum|aluminium|steel|resin|nylon|abs|peek|不锈钢|铝合金|钛|铜|塑料)\b/i.test(lower)
    || /材料|树脂|尼龙/.test(text)) {
    const m = text.match(/\b(aluminum|aluminium|steel|resin|nylon|ABS|PEEK|不锈钢|铝合金|树脂)\b/i);
    signals.push({ node: 'material', amount: 0.3, hint: m ? m[0] : (lang === 'en' ? 'material' : '材料') });
  }

  if (/wechat|微信|whatsapp|电话|sales@|联系人/i.test(lower) || /微信/.test(text)) {
    signals.push({ node: 'contact', amount: 0.4, hint: lang === 'en' ? 'contact' : '联系方式' });
  }

  if (/lead\s*time|交期|样品|sample|working\s*days|天交/i.test(lower) || /交期|样品/.test(text)) {
    signals.push({ node: 'lead', amount: 0.35, hint: lang === 'en' ? 'lead time' : '交期' });
  }

  if (/export|出口|欧美|海外|incoterm|fob|exw/i.test(lower) || /出口|海外/.test(text)) {
    signals.push({ node: 'export', amount: 0.25, hint: lang === 'en' ? 'export' : '出口' });
  }

  const fileList = files || [];
  if (fileList.length) {
    for (const file of fileList) {
      const name = String(file.name || 'file');
      signals.push({
        node: 'quotes',
        amount: 0.28,
        hint: name.slice(0, 60),
      });
      if (/\b(sla|resin|cnc|quote|报价)/i.test(name)) {
        signals.push({ node: 'process', amount: 0.12, hint: lang === 'en' ? 'from quote' : '来自报价' });
      }
    }
  }

  // Free-form creative dump still grows the web a little via core + export readiness
  if (!signals.length && text.trim().length > 12) {
    signals.push({ node: 'export', amount: 0.08, hint: lang === 'en' ? 'note' : '备注' });
    signals.push({ node: 'process', amount: 0.08, hint: text.trim().slice(0, 40) });
  }

  return signals;
}

function applySignals(web, signals, eventLabel) {
  const next = JSON.parse(JSON.stringify(web));
  let changed = false;
  for (const sig of signals) {
    if (bump(next.nodes[sig.node], sig.amount, sig.hint)) changed = true;
  }
  // Core solidifies as peripheral knowledge grows
  const avg = NODE_DEFS.filter((d) => d.id !== 'core')
    .reduce((sum, d) => sum + (next.nodes[d.id].strength || 0), 0) / (NODE_DEFS.length - 1);
  next.nodes.core.strength = clamp01(0.35 + avg * 0.65);

  const reach = computeReach(next.nodes);
  next.reach = reach;
  if (!Array.isArray(next.reachHistory)) next.reachHistory = [8];
  next.reachHistory = [...next.reachHistory, reach].slice(-24);
  if (changed || (signals && signals.length)) {
    next.events = [
      {
        at: Date.now(),
        label: eventLabel || 'update',
        reach,
        nodes: signals.map((s) => s.node),
      },
      ...(next.events || []),
    ].slice(0, 12);
  }
  return { web: next, changed, reach };
}

function normalizeClientWeb(raw, lang) {
  const base = emptyWeb(lang);
  if (!raw || typeof raw !== 'object') return base;
  for (const def of NODE_DEFS) {
    const incoming = raw.nodes && raw.nodes[def.id];
    if (!incoming) continue;
    base.nodes[def.id].strength = clamp01(Number(incoming.strength) || 0);
    base.nodes[def.id].count = Math.max(0, Number(incoming.count) || 0);
    base.nodes[def.id].hints = Array.isArray(incoming.hints)
      ? incoming.hints.map((h) => String(h).slice(0, 80)).filter(Boolean).slice(0, 6)
      : [];
    base.nodes[def.id].label = lang === 'en' ? def.en : def.zh;
  }
  base.reach = computeReach(base.nodes);
  base.reachHistory = Array.isArray(raw.reachHistory)
    ? raw.reachHistory.map((n) => Math.round(Number(n) || 0)).slice(-24)
    : [base.reach];
  if (!base.reachHistory.length) base.reachHistory = [base.reach];
  base.events = Array.isArray(raw.events) ? raw.events.slice(0, 12) : [];
  return base;
}

function layoutPositions() {
  // Fixed abstract constellation — readable, not a physics sim
  return {
    core: { x: 50, y: 48 },
    domain: { x: 22, y: 28 },
    process: { x: 78, y: 26 },
    material: { x: 86, y: 52 },
    quotes: { x: 72, y: 76 },
    contact: { x: 28, y: 74 },
    lead: { x: 14, y: 52 },
    export: { x: 50, y: 18 },
  };
}

module.exports = {
  NODE_DEFS,
  EDGES,
  emptyWeb,
  extractSignals,
  applySignals,
  normalizeClientWeb,
  computeReach,
  layoutPositions,
};
