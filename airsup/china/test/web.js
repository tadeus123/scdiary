/**
 * Floating note-web for /airsup/china/test.
 * Bookshelf-style: empty canvas → dumps spawn fine nodes → relevant ones link.
 * Concept only — not wired to live china publish.
 */
const crypto = require('crypto');

const KIND_WEIGHT = {
  site: 14,
  process: 12,
  material: 10,
  quote: 14,
  contact: 11,
  lead: 8,
  export: 7,
  quality: 7,
  capacity: 6,
  note: 5,
  seed: 3,
};

const AFFINITY = {
  site: ['export', 'contact', 'note'],
  process: ['material', 'quote', 'quality', 'capacity', 'note'],
  material: ['process', 'quote', 'quality', 'note'],
  quote: ['process', 'material', 'lead', 'export', 'note'],
  contact: ['lead', 'export', 'site', 'note'],
  lead: ['quote', 'capacity', 'contact', 'note'],
  export: ['site', 'quote', 'contact', 'note'],
  quality: ['process', 'material', 'note'],
  capacity: ['process', 'lead', 'note'],
  note: ['process', 'material', 'quote', 'contact', 'note', 'site'],
  seed: ['site', 'note', 'process'],
};

function emptyWeb() {
  return {
    nodes: {},
    edges: [],
    reach: 0,
    reachHistory: [0],
    events: [],
  };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function shortId() {
  return `n_${crypto.randomBytes(4).toString('hex')}`;
}

function hashAngle(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Soft cloud position — floating constellation, not a fixed ring. */
function placeNode(id, index, totalHint) {
  const h = hashAngle(id);
  const n = Math.max(1, totalHint || 1);
  const ring = 0.22 + (h % 7) * 0.06 + Math.min(0.28, n * 0.012);
  const angle = ((h % 360) / 180) * Math.PI + index * 0.7;
  const jitter = ((h >> 8) % 100) / 100;
  const x = 50 + Math.cos(angle) * ring * 42 + (jitter - 0.5) * 6;
  const y = 48 + Math.sin(angle) * ring * 36 + (((h >> 16) % 100) / 100 - 0.5) * 5;
  return {
    x: Math.max(6, Math.min(94, x)),
    y: Math.max(8, Math.min(88, y)),
  };
}

function nodeRadius(node) {
  const base = node.kind === 'seed' ? 0.32 : 0.38;
  return base + clamp01(node.strength) * 0.7;
}

function computeReach(web) {
  const nodes = Object.values(web.nodes || {});
  if (!nodes.length) return 0;
  let score = Math.min(18, nodes.length * 2.2);
  for (const node of nodes) {
    const w = KIND_WEIGHT[node.kind] || 4;
    score += w * clamp01(node.strength);
  }
  score += Math.min(22, (web.edges || []).length * 1.4);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function refreshReach(web) {
  web.reach = computeReach(web);
  if (!Array.isArray(web.reachHistory)) web.reachHistory = [web.reach];
  web.reachHistory = [...web.reachHistory, web.reach].slice(-24);
  return web;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff.+-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 40);
}

function overlapScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const setB = new Set(bTokens);
  let n = 0;
  for (const t of aTokens) if (setB.has(t)) n += 1;
  return n;
}

function detectKinds(message, files) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const kinds = [];

  if (/https?:\/\//i.test(text) || /\b[\w.-]+\.(com|cn|net|co)\b/i.test(text)) {
    const m = text.match(/https?:\/\/[^\s]+/i) || text.match(/\b[\w.-]+\.(com|cn|net|co)\b/i);
    kinds.push({ kind: 'site', hint: m ? m[0] : 'site' });
  }
  {
    const m = text.match(/SLA|SLS|FDM|MJF|CNC|注塑|机加|钣金|冲压|铸造|压铸|喷涂|阳极|3D\s*打印|树脂|铣削|车削/i)
      || lower.match(/\b(sla|sls|fdm|mjf|cnc|resin)\b/i);
    if (m || /工艺|打印|机加|注塑|压铸/.test(text)) {
      kinds.push({ kind: 'process', hint: m ? m[0] : 'process' });
    }
  }
  {
    const m = text.match(/铝合金|不锈钢|钛|铜|塑料|树脂|尼龙|aluminum|aluminium|steel|resin|nylon|ABS|PEEK/i);
    if (m || /材料/.test(text)) {
      kinds.push({ kind: 'material', hint: m ? m[0] : 'material' });
    }
  }
  if (/wechat|微信|whatsapp|电话|sales@|联系人/i.test(text)) {
    kinds.push({ kind: 'contact', hint: /微信/.test(text) ? '微信' : 'contact' });
  }
  {
    const m = text.match(/交期|样品|MOQ|moq|lead\s*time|sample|working\s*days/i);
    if (m) kinds.push({ kind: 'lead', hint: m[0] });
  }
  if (/export|出口|欧美|海外|incoterm|fob|exw/i.test(text)) {
    kinds.push({ kind: 'export', hint: /出口|海外/.test(text) ? '出口' : 'export' });
  }
  if (/iso|证书|cert|qc|品质|公差|tolerance|inspection/i.test(text)) {
    kinds.push({ kind: 'quality', hint: /品质|证书|公差/.test(text) ? '品质' : 'quality' });
  }
  if (/产能|capacity|pcs\/|月产|台设备|machines?/i.test(text)) {
    kinds.push({ kind: 'capacity', hint: /产能|设备/.test(text) ? '产能' : 'capacity' });
  }

  for (const file of files || []) {
    const name = String(file.name || 'file');
    kinds.push({ kind: 'quote', hint: name.slice(0, 48), file: true });
  }

  if (!kinds.length && text.trim().length > 2) {
    kinds.push({ kind: 'note', hint: text.trim().slice(0, 48) });
  }
  return kinds;
}

function labelFor(kind, hint, lang) {
  const h = String(hint || '').trim();
  if (h && h.length <= 28) return h;
  if (h) return `${h.slice(0, 26)}…`;
  const fallback = {
    site: lang === 'en' ? 'site' : '网站',
    process: lang === 'en' ? 'process' : '工艺',
    material: lang === 'en' ? 'material' : '材料',
    quote: lang === 'en' ? 'quote' : '报价',
    contact: lang === 'en' ? 'contact' : '联系',
    lead: lang === 'en' ? 'lead' : '交期',
    export: lang === 'en' ? 'export' : '出口',
    quality: lang === 'en' ? 'quality' : '品质',
    capacity: lang === 'en' ? 'capacity' : '产能',
    note: lang === 'en' ? 'note' : '笔记',
    seed: lang === 'en' ? 'seed' : '种子',
  };
  return fallback[kind] || (lang === 'en' ? 'note' : '笔记');
}

function makeNode({ kind, hint, detail, lang, index, total }) {
  const id = shortId();
  const pos = placeNode(id, index, total);
  return {
    id,
    kind,
    label: labelFor(kind, hint, lang),
    detail: String(detail || hint || '').slice(0, 160),
    strength: kind === 'seed' ? 0.22 : 0.55,
    x: pos.x,
    y: pos.y,
    at: Date.now(),
    tokens: tokenize(`${hint || ''} ${detail || ''}`),
  };
}

function edgeKey(a, b) {
  return [a, b].sort().join('::');
}

function linkRelevant(web, newNode, maxLinks) {
  const others = Object.values(web.nodes || {}).filter((n) => n.id !== newNode.id);
  if (!others.length) return [];
  const prefer = new Set(AFFINITY[newNode.kind] || ['note']);
  const scored = others.map((n) => {
    let score = overlapScore(newNode.tokens || [], n.tokens || []) * 3;
    if (prefer.has(n.kind)) score += 2;
    if (n.kind === newNode.kind) score += 1.2;
    // Prefer nearby floating neighbors so the web looks local
    const dx = (n.x || 50) - (newNode.x || 50);
    const dy = (n.y || 50) - (newNode.y || 50);
    const dist = Math.sqrt(dx * dx + dy * dy);
    score += Math.max(0, 3 - dist / 18);
    return { n, score };
  }).filter((row) => row.score >= 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLinks == null ? 3 : maxLinks);

  const added = [];
  if (!Array.isArray(web.edges)) web.edges = [];
  for (const row of scored) {
    const key = edgeKey(newNode.id, row.n.id);
    if (web.edges.some((e) => edgeKey(e.from, e.to) === key)) continue;
    web.edges.push({ from: newNode.id, to: row.n.id, kind: 'auto', at: Date.now() });
    added.push(row.n.id);
  }
  return added;
}

/** Tiny seeds when a company/domain is known (scrape / login). */
function seedFromCompany(web, company, lang) {
  const next = normalizeClientWeb(web, lang);
  if (!company) return { web: next, added: [] };
  const domain = String(company.domain || '').trim();
  const name = String(company.company_name || company.company_name_en || company.name || '').trim();
  const existingKinds = new Set(Object.values(next.nodes).map((n) => n.kind));
  const added = [];
  const want = [];
  if (domain && !existingKinds.has('site')) {
    want.push({ kind: 'seed', hint: domain, detail: domain });
  }
  if (name && name.length > 1) {
    const hasName = Object.values(next.nodes).some((n) => n.label === name);
    if (!hasName) want.push({ kind: 'seed', hint: name.slice(0, 28), detail: name });
  }
  const total = Object.keys(next.nodes).length + want.length;
  want.forEach((w, i) => {
    const node = makeNode({
      kind: 'seed',
      hint: w.hint,
      detail: w.detail,
      lang,
      index: Object.keys(next.nodes).length + i,
      total,
    });
    node.strength = 0.2;
    next.nodes[node.id] = node;
    added.push(node.id);
    linkRelevant(next, node, 2);
  });
  if (added.length) {
    refreshReach(next);
    next.events = [
      { at: Date.now(), label: 'seed', reach: next.reach, nodes: added },
      ...(next.events || []),
    ].slice(0, 12);
  }
  return { web: next, added };
}

/**
 * Apply a dump: spawn fine note nodes + auto-link relevant ones.
 * Returns { web, signals } where signals are { node: id } for bloom.
 */
function applyDump(web, { message, files, lang }) {
  const next = normalizeClientWeb(web, lang);
  const kinds = detectKinds(message, files);
  const signals = [];
  const created = [];
  const total = Object.keys(next.nodes).length + Math.max(1, kinds.length);

  kinds.forEach((row, i) => {
    const detail = row.file
      ? String(row.hint || '')
      : String(message || '').trim().slice(0, 120);
    const node = makeNode({
      kind: row.kind,
      hint: row.hint,
      detail,
      lang,
      index: Object.keys(next.nodes).length + i,
      total,
    });
    next.nodes[node.id] = node;
    created.push(node.id);
    signals.push({ node: node.id, kind: node.kind });
    linkRelevant(next, node, 3);
  });

  // Soft bump strength on linked neighbors
  for (const id of created) {
    const node = next.nodes[id];
    for (const e of next.edges) {
      const other = e.from === id ? e.to : (e.to === id ? e.from : null);
      if (!other || !next.nodes[other]) continue;
      next.nodes[other].strength = clamp01(next.nodes[other].strength + 0.04);
    }
    node.strength = clamp01(node.strength + 0.05);
  }

  refreshReach(next);
  const eventLabel = (files && files[0] && files[0].name)
    || String(message || '').trim().slice(0, 40)
    || 'dump';
  next.events = [
    { at: Date.now(), label: eventLabel, reach: next.reach, nodes: created },
    ...(next.events || []),
  ].slice(0, 12);

  return { web: next, signals, changed: created.length > 0, reach: next.reach };
}

/** @deprecated name kept for chat.js — maps to applyDump */
function extractSignals(args) {
  return detectKinds(args.message, args.files).map((k) => ({ node: k.kind, amount: 0.3, hint: k.hint }));
}

function applySignals(web, signals, eventLabel) {
  // Legacy path: treat as a synthetic note dump from signal hints
  const message = (signals || []).map((s) => s.hint || s.node).filter(Boolean).join(' · ');
  return applyDump(web, { message: message || eventLabel || 'note', files: [], lang: 'zh' });
}

function addCustomLink(web, from, to) {
  const next = normalizeClientWeb(web);
  if (!next.nodes[from] || !next.nodes[to] || from === to) {
    return { web: next, ok: false, reason: 'bad_nodes' };
  }
  if (!Array.isArray(next.edges)) next.edges = [];
  const key = edgeKey(from, to);
  if (next.edges.some((e) => edgeKey(e.from, e.to) === key)) {
    return { web: next, ok: false, reason: 'exists' };
  }
  next.edges.push({ from, to, kind: 'custom', at: Date.now() });
  next.nodes[from].strength = clamp01(next.nodes[from].strength + 0.06);
  next.nodes[to].strength = clamp01(next.nodes[to].strength + 0.06);
  refreshReach(next);
  next.events = [
    { at: Date.now(), label: `link:${from}-${to}`, reach: next.reach, nodes: [from, to] },
    ...(next.events || []),
  ].slice(0, 12);
  return { web: next, ok: true };
}

function normalizeClientWeb(raw) {
  const base = emptyWeb();
  if (!raw || typeof raw !== 'object') return base;
  const nodesIn = raw.nodes && typeof raw.nodes === 'object' ? raw.nodes : {};
  // Ignore legacy typed skeleton (core/domain/…)
  const legacyIds = new Set(['core', 'domain', 'process', 'material', 'quotes', 'contact', 'lead', 'export', 'quality', 'capacity']);
  let i = 0;
  for (const [id, incoming] of Object.entries(nodesIn)) {
    if (!incoming || typeof incoming !== 'object') continue;
    if (legacyIds.has(id) && !String(id).startsWith('n_')) continue;
    const kind = String(incoming.kind || 'note').slice(0, 24);
    const nodeId = String(incoming.id || id).slice(0, 40);
    if (!nodeId.startsWith('n_') && !nodeId.startsWith('seed_')) {
      // allow only our generated ids
      if (!/^n_[a-f0-9]+$/i.test(nodeId)) continue;
    }
    const pos = (incoming.x != null && incoming.y != null)
      ? { x: Number(incoming.x), y: Number(incoming.y) }
      : placeNode(nodeId, i, Object.keys(nodesIn).length);
    base.nodes[nodeId] = {
      id: nodeId,
      kind,
      label: String(incoming.label || kind).slice(0, 48),
      detail: String(incoming.detail || '').slice(0, 160),
      strength: clamp01(incoming.strength),
      x: Math.max(4, Math.min(96, pos.x)),
      y: Math.max(4, Math.min(96, pos.y)),
      at: Number(incoming.at) || Date.now(),
      tokens: Array.isArray(incoming.tokens)
        ? incoming.tokens.map((t) => String(t).slice(0, 32)).slice(0, 40)
        : tokenize(`${incoming.label || ''} ${incoming.detail || ''}`),
    };
    i += 1;
  }
  const allowed = new Set(Object.keys(base.nodes));
  const edgeSrc = Array.isArray(raw.edges)
    ? raw.edges
    : [...(Array.isArray(raw.customLinks) ? raw.customLinks : [])];
  const seen = new Set();
  base.edges = edgeSrc
    .filter((e) => e && allowed.has(e.from) && allowed.has(e.to) && e.from !== e.to)
    .map((e) => ({ from: e.from, to: e.to, kind: e.kind === 'custom' ? 'custom' : 'auto', at: e.at || Date.now() }))
    .filter((e) => {
      const k = edgeKey(e.from, e.to);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 120);
  refreshReach(base);
  base.reachHistory = Array.isArray(raw.reachHistory)
    ? raw.reachHistory.map((n) => Math.round(Number(n) || 0)).slice(-24)
    : [base.reach];
  if (!base.reachHistory.length) base.reachHistory = [base.reach];
  base.events = Array.isArray(raw.events) ? raw.events.slice(0, 12) : [];
  return base;
}

/** Client may still ask — positions live on each node now. */
function layoutPositions(web) {
  const out = {};
  const nodes = (web && web.nodes) || {};
  for (const [id, n] of Object.entries(nodes)) {
    out[id] = { x: n.x, y: n.y };
  }
  return out;
}

module.exports = {
  KIND_WEIGHT,
  emptyWeb,
  extractSignals,
  applySignals,
  applyDump,
  seedFromCompany,
  addCustomLink,
  normalizeClientWeb,
  computeReach,
  layoutPositions,
  nodeRadius,
  placeNode,
  edgeKey,
  detectKinds,
};
