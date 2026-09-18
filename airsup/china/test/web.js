/**
 * Abstract company endpoint "web" for /airsup/china/test.
 * Concept only — not wired to live china publish.
 */

const NODE_DEFS = [
  { id: 'core', zh: '工厂', en: 'Factory', weight: 0 },
  { id: 'domain', zh: '网站', en: 'Site', weight: 14 },
  { id: 'process', zh: '工艺', en: 'Process', weight: 16 },
  { id: 'material', zh: '材料', en: 'Material', weight: 12 },
  { id: 'quotes', zh: '报价', en: 'Quotes', weight: 16 },
  { id: 'contact', zh: '联系', en: 'Contact', weight: 12 },
  { id: 'lead', zh: '交期', en: 'Lead', weight: 9 },
  { id: 'export', zh: '出口', en: 'Export', weight: 8 },
  { id: 'quality', zh: '品质', en: 'Quality', weight: 7 },
  { id: 'capacity', zh: '产能', en: 'Capacity', weight: 6 },
];

/** Structural skeleton — denser mesh, not a star */
const EDGES = [
  ['core', 'domain'],
  ['core', 'process'],
  ['core', 'material'],
  ['core', 'quotes'],
  ['core', 'contact'],
  ['core', 'lead'],
  ['core', 'export'],
  ['core', 'quality'],
  ['core', 'capacity'],
  ['domain', 'export'],
  ['domain', 'contact'],
  ['process', 'material'],
  ['process', 'quotes'],
  ['process', 'quality'],
  ['process', 'capacity'],
  ['material', 'quotes'],
  ['material', 'quality'],
  ['quotes', 'lead'],
  ['quotes', 'export'],
  ['contact', 'lead'],
  ['contact', 'export'],
  ['lead', 'capacity'],
  ['quality', 'export'],
  ['capacity', 'export'],
];

function edgeKey(a, b) {
  return [a, b].sort().join('::');
}

function emptyWeb(lang) {
  const nodes = {};
  for (const def of NODE_DEFS) {
    nodes[def.id] = {
      id: def.id,
      label: lang === 'en' ? def.en : def.zh,
      strength: def.id === 'core' ? 0.4 : 0.04,
      hints: [],
      count: def.id === 'core' ? 1 : 0,
    };
  }
  return {
    nodes,
    edges: EDGES.map(([from, to]) => ({ from, to, kind: 'base' })),
    customLinks: [],
    reach: 10,
    reachHistory: [10],
    events: [],
  };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function liveEdgeCount(web) {
  const nodes = web.nodes || {};
  const all = [...(web.edges || []), ...(web.customLinks || []).map((l) => ({ ...l, kind: 'custom' }))];
  let n = 0;
  for (const e of all) {
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (!a || !b) continue;
    if (a.strength > 0.15 && b.strength > 0.15) n += 1;
  }
  return n;
}

function computeReach(web) {
  const nodes = web.nodes || web;
  let score = 10;
  for (const def of NODE_DEFS) {
    if (def.id === 'core') continue;
    const node = nodes[def.id] || (web.nodes && web.nodes[def.id]);
    const s = node ? Number(node.strength) || 0 : 0;
    score += def.weight * s;
  }
  // Dense live mesh bonus — linking nodes yourself raises findability
  const links = typeof web.customLinks !== 'undefined'
    ? liveEdgeCount(web)
    : 0;
  score += Math.min(18, links * 1.1);
  if (Array.isArray(web.customLinks)) {
    score += Math.min(12, web.customLinks.length * 1.8);
  }
  return Math.round(Math.max(10, Math.min(100, score)));
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
    signals.push({ node: 'export', amount: 0.12, hint: lang === 'en' ? 'site' : '网站' });
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
    signals.push({ node: 'contact', amount: 0.4, hint: lang === 'en' ? 'contact' : '联系' });
  }

  if (/lead\s*time|交期|样品|sample|working\s*days|天交/i.test(lower) || /交期|样品/.test(text)) {
    signals.push({ node: 'lead', amount: 0.35, hint: lang === 'en' ? 'lead' : '交期' });
  }

  if (/export|出口|欧美|海外|incoterm|fob|exw/i.test(lower) || /出口|海外/.test(text)) {
    signals.push({ node: 'export', amount: 0.25, hint: lang === 'en' ? 'export' : '出口' });
  }

  if (/iso|证书|cert|qc|品质|公差|tolerance|inspection/i.test(lower) || /品质|证书|公差/.test(text)) {
    signals.push({ node: 'quality', amount: 0.35, hint: lang === 'en' ? 'quality' : '品质' });
  }

  if (/产能|capacity|pcs\/|月产|台设备|machines?/i.test(lower) || /产能|设备/.test(text)) {
    signals.push({ node: 'capacity', amount: 0.3, hint: lang === 'en' ? 'capacity' : '产能' });
  }

  const fileList = files || [];
  if (fileList.length) {
    for (const file of fileList) {
      const name = String(file.name || 'file');
      signals.push({ node: 'quotes', amount: 0.28, hint: name.slice(0, 60) });
      if (/\b(sla|resin|cnc|quote|报价)/i.test(name)) {
        signals.push({ node: 'process', amount: 0.12, hint: lang === 'en' ? 'from quote' : '报价' });
      }
    }
  }

  if (!signals.length && text.trim().length > 12) {
    signals.push({ node: 'export', amount: 0.08, hint: lang === 'en' ? 'note' : '备注' });
    signals.push({ node: 'process', amount: 0.08, hint: text.trim().slice(0, 40) });
  }

  return signals;
}

function refreshReach(web) {
  web.reach = computeReach(web);
  if (!Array.isArray(web.reachHistory)) web.reachHistory = [web.reach];
  web.reachHistory = [...web.reachHistory, web.reach].slice(-24);
  return web;
}

function applySignals(web, signals, eventLabel) {
  const next = JSON.parse(JSON.stringify(web));
  if (!Array.isArray(next.customLinks)) next.customLinks = [];
  let changed = false;
  for (const sig of signals) {
    if (bump(next.nodes[sig.node], sig.amount, sig.hint)) changed = true;
  }
  const avg = NODE_DEFS.filter((d) => d.id !== 'core')
    .reduce((sum, d) => sum + (next.nodes[d.id].strength || 0), 0) / (NODE_DEFS.length - 1);
  next.nodes.core.strength = clamp01(0.4 + avg * 0.6);

  refreshReach(next);
  if (changed || (signals && signals.length)) {
    next.events = [
      {
        at: Date.now(),
        label: eventLabel || 'update',
        reach: next.reach,
        nodes: signals.map((s) => s.node),
      },
      ...(next.events || []),
    ].slice(0, 12);
  }
  return { web: next, changed, reach: next.reach };
}

function addCustomLink(web, from, to) {
  const next = JSON.parse(JSON.stringify(web));
  if (!next.nodes[from] || !next.nodes[to] || from === to) {
    return { web: next, ok: false, reason: 'bad_nodes' };
  }
  if (!Array.isArray(next.customLinks)) next.customLinks = [];
  const key = edgeKey(from, to);
  const existsBase = (next.edges || []).some((e) => edgeKey(e.from, e.to) === key);
  const existsCustom = next.customLinks.some((e) => edgeKey(e.from, e.to) === key);
  if (existsBase || existsCustom) {
    return { web: next, ok: false, reason: 'exists' };
  }
  next.customLinks.push({ from, to, kind: 'custom', at: Date.now() });
  // Drawing a link affirms both sides of the relationship
  bump(next.nodes[from], 0.08, null);
  bump(next.nodes[to], 0.08, null);
  const avg = NODE_DEFS.filter((d) => d.id !== 'core')
    .reduce((sum, d) => sum + (next.nodes[d.id].strength || 0), 0) / (NODE_DEFS.length - 1);
  next.nodes.core.strength = clamp01(0.4 + avg * 0.6);
  refreshReach(next);
  next.events = [
    { at: Date.now(), label: `link:${from}-${to}`, reach: next.reach, nodes: [from, to] },
    ...(next.events || []),
  ].slice(0, 12);
  return { web: next, ok: true };
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
  const allowed = new Set(NODE_DEFS.map((d) => d.id));
  base.customLinks = Array.isArray(raw.customLinks)
    ? raw.customLinks
      .filter((e) => e && allowed.has(e.from) && allowed.has(e.to) && e.from !== e.to)
      .map((e) => ({ from: e.from, to: e.to, kind: 'custom', at: e.at || Date.now() }))
      .slice(0, 40)
    : [];
  // Deduplicate
  const seen = new Set();
  base.customLinks = base.customLinks.filter((e) => {
    const k = edgeKey(e.from, e.to);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  base.reach = computeReach(base);
  base.reachHistory = Array.isArray(raw.reachHistory)
    ? raw.reachHistory.map((n) => Math.round(Number(n) || 0)).slice(-24)
    : [base.reach];
  if (!base.reachHistory.length) base.reachHistory = [base.reach];
  base.events = Array.isArray(raw.events) ? raw.events.slice(0, 12) : [];
  return base;
}

function layoutPositions() {
  // Slightly irregular constellation — reads more like a real network
  return {
    core: { x: 50, y: 50 },
    domain: { x: 22, y: 24 },
    process: { x: 78, y: 22 },
    material: { x: 90, y: 48 },
    quotes: { x: 76, y: 78 },
    contact: { x: 34, y: 84 },
    lead: { x: 12, y: 62 },
    export: { x: 58, y: 14 },
    quality: { x: 66, y: 64 },
    capacity: { x: 28, y: 42 },
  };
}

/** Quadratic curve control point offset for organic edges */
function curveControl(a, b, bend) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mag = (bend == null ? 1 : bend) * Math.min(10, len * 0.18);
  return { x: mx + nx * mag, y: my + ny * mag };
}

module.exports = {
  NODE_DEFS,
  EDGES,
  emptyWeb,
  extractSignals,
  applySignals,
  addCustomLink,
  normalizeClientWeb,
  computeReach,
  layoutPositions,
  curveControl,
  edgeKey,
};
