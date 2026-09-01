const PHOTO_R = 34;
const NAME_GAP = 22;
const OPEN_TARGET = 2;
const MIN_SCALE = 0.28;
const MAX_SCALE = 2.8;
const ZOOM_FACTOR = 0.0012;
const FIT_PAD = 72;
const LANG_KEY = 'graph-lang';

const COPY = {
  en: {
    title: 'graph',
    questionLines: [
      'Who are the 2 best hardware people',
      'you have personally worked with',
      'who are stronger than you?'
    ],
    seal: '中',
    switchTo: 'Switch to Chinese',
    back: 'Back to Diary',
    theme: 'Toggle theme',
    graph: 'People intro graph',
    close: 'Close',
    from: (name) => `from ${name}`,
    starting: 'starting node',
    added: (date) => `added ${date}`,
    href: '/graph'
  },
  zh: {
    title: '图谱',
    questionLines: [
      '你亲自共事过、比你更强的',
      '两位硬件人是谁？'
    ],
    seal: '英',
    switchTo: '切换为英文',
    back: '返回日记',
    theme: '切换主题',
    graph: '引荐图谱',
    close: '关闭',
    from: (name) => `由 ${name} 引荐`,
    starting: '起点',
    added: (date) => `${date}加入`,
    href: '/graph/zh'
  }
};

let nodes = [];
let edges = [];
let positions = new Map();
let viewport = { x: 0, y: 0, scale: 1 };
let viewWidth = 0;
let viewHeight = 0;
let lang = document.documentElement.getAttribute('data-graph-lang') === 'zh' ? 'zh' : 'en';
let openDetailsId = null;

const graphEl = document.getElementById('people-graph');
const worldEl = document.getElementById('people-graph-world');
const svgEl = document.getElementById('people-graph-svg');
const nodesEl = document.getElementById('people-graph-nodes');
const detailsEl = document.getElementById('people-details');
const detailsPhoto = document.getElementById('people-details-photo');
const detailsName = document.getElementById('people-details-name');
const detailsFrom = document.getElementById('people-details-from');
const detailsAdded = document.getElementById('people-details-added');
const detailsDesc = document.getElementById('people-details-desc');
const detailsClose = document.getElementById('people-details-close');
const titleEl = document.getElementById('people-graph-title');
const questionTextEl = document.getElementById('people-graph-question-text');
const langToggle = document.getElementById('people-lang-toggle');
const langSeal = document.getElementById('people-lang-seal');
const themeToggle = document.getElementById('theme-toggle');
const backLink = document.querySelector('.corner-btn-left');

function hashId(id) {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) | 0;
  return Math.abs(h);
}

function clampScale(s) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function edgeStroke() {
  return isDark() ? '#C4B6A4' : '#9A7B5A';
}

function outgoingMap() {
  const map = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!map.has(e.from_id)) map.set(e.from_id, []);
    map.get(e.from_id).push(e.to_id);
  }
  return map;
}

function incomingMap() {
  const map = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!map.has(e.to_id)) map.set(e.to_id, []);
    map.get(e.to_id).push(e.from_id);
  }
  return map;
}

function isOpen(id, outgoing) {
  return (outgoing.get(id) || []).length < OPEN_TARGET;
}

function computeLayout() {
  const outgoing = outgoingMap();
  const incoming = incomingMap();
  const pos = new Map();
  if (nodes.length === 0) return pos;

  const roots = nodes.filter((n) => (incoming.get(n.id) || []).length === 0);
  const start = roots.length ? roots : nodes;

  const depth = new Map();
  const parent = new Map();
  const queue = [];
  for (const n of start) {
    depth.set(n.id, 0);
    queue.push(n.id);
  }
  while (queue.length) {
    const id = queue.shift();
    const d = depth.get(id);
    for (const child of outgoing.get(id) || []) {
      if (!depth.has(child)) {
        depth.set(child, d + 1);
        parent.set(child, id);
        queue.push(child);
      }
    }
  }
  for (const n of nodes) {
    if (!depth.has(n.id)) depth.set(n.id, 0);
  }

  const byDepth = new Map();
  let maxDepth = 0;
  for (const n of nodes) {
    const d = depth.get(n.id);
    maxDepth = Math.max(maxDepth, d);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(n);
  }

  const d0 = byDepth.get(0) || [];
  const closedRoots = d0.filter((n) => !isOpen(n.id, outgoing));
  const ring0 = Math.max(70, (Math.max(closedRoots.length, 1) * 86) / (Math.PI * 2));
  const ringGap = 148;
  const outerR = ring0 + Math.max(maxDepth, 1) * ringGap + 28;

  if (closedRoots.length <= 1 && d0.length <= 1) {
    const n = d0[0];
    if (n) pos.set(n.id, { x: 0, y: 0, angle: -Math.PI / 2 });
  } else {
    d0.forEach((n, i) => {
      const angle = -Math.PI / 2 + (i / d0.length) * Math.PI * 2;
      const r = isOpen(n.id, outgoing) && maxDepth > 0
        ? outerR + ((hashId(n.id) % 17) - 8)
        : ring0 + ((hashId(n.id) % 17) - 8);
      pos.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle });
    });
  }

  for (let d = 1; d <= maxDepth; d++) {
    const level = byDepth.get(d) || [];
    const groups = new Map();
    for (const n of level) {
      const pid = parent.get(n.id);
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid).push(n);
    }
    for (const [pid, children] of groups) {
      const ppos = pos.get(pid) || { x: 0, y: 0, angle: -Math.PI / 2 };
      const baseAngle = Math.hypot(ppos.x, ppos.y) < 4 ? -Math.PI / 2 : Math.atan2(ppos.y, ppos.x);
      const spread = Math.min(1.15, 0.42 + children.length * 0.28);
      children.forEach((n, i) => {
        const t = children.length === 1 ? 0 : i / (children.length - 1) - 0.5;
        const angle = baseAngle + t * spread + ((hashId(n.id) % 11) - 5) * 0.018;
        const r = (isOpen(n.id, outgoing) ? outerR : ring0 + d * ringGap) + (hashId(n.id) % 16);
        pos.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle });
      });
    }
  }

  const minDist = 92;
  for (let iter = 0; iter < 80; iter++) {
    const t = 1 - iter / 80;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id);
        const b = pos.get(nodes[j].id);
        if (!a || !b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist >= minDist) continue;
        const push = ((minDist - dist) / dist) * 0.28 * t;
        dx *= push;
        dy *= push;
        a.x -= dx;
        a.y -= dy;
        b.x += dx;
        b.y += dy;
      }
    }
  }

  return pos;
}

function boundsFromPositions(pos) {
  if (pos.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x - PHOTO_R - 8);
    maxX = Math.max(maxX, p.x + PHOTO_R + 8);
    minY = Math.min(minY, p.y - PHOTO_R - 8);
    maxY = Math.max(maxY, p.y + PHOTO_R + NAME_GAP + 8);
  }
  return { minX, minY, maxX, maxY };
}

function fitViewport(pos) {
  const bounds = boundsFromPositions(pos);
  if (!bounds || viewWidth <= 0 || viewHeight <= 0) {
    return { x: viewWidth / 2, y: viewHeight / 2, scale: 1 };
  }
  const boundsW = bounds.maxX - bounds.minX + FIT_PAD * 2;
  const boundsH = bounds.maxY - bounds.minY + FIT_PAD * 2;
  const scale = clampScale(Math.min(viewWidth / boundsW, viewHeight / boundsH, 1));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: viewWidth / 2 - cx * scale,
    y: viewHeight / 2 - cy * scale
  };
}

function applyViewport() {
  worldEl.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
}

function circleAnchor(x1, y1, x2, y2, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: x1 + (dx / len) * radius,
    y: y1 + (dy / len) * radius
  };
}

function t() {
  return COPY[lang] || COPY.en;
}

function displayName(node) {
  if (!node) return '';
  if (lang === 'zh' && node.name_zh) return node.name_zh;
  return node.name || '';
}

function displayDesc(node) {
  if (!node) return '';
  if (lang === 'zh' && node.description_zh) return node.description_zh;
  return node.description || '';
}

function initialFor(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const first = trimmed.charAt(0);
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

function nodeById(id) {
  return nodes.find((n) => n.id === id) || null;
}

function parentName(id) {
  const incoming = incomingMap();
  const parents = incoming.get(id) || [];
  if (!parents.length) return '';
  return parents
    .map((pid) => displayName(nodeById(pid)))
    .filter(Boolean)
    .join(lang === 'zh' ? '、' : ', ');
}

function formatAdded(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (lang === 'zh') {
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function pathForLang(next) {
  return next === 'zh' ? '/graph/zh' : '/graph';
}

function applyChrome() {
  const copy = t();
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
  document.documentElement.setAttribute('data-graph-lang', lang);
  document.body.classList.toggle('is-zh', lang === 'zh');
  document.title = lang === 'zh' ? 'Tade Mehl — 图谱' : 'Tade Mehl — graph';
  if (titleEl) {
    titleEl.textContent = copy.title;
    titleEl.setAttribute('href', copy.href);
  }
  if (questionTextEl) {
    questionTextEl.innerHTML = copy.questionLines
      .map((line) => `<span class="people-graph-q-line">${escapeHtml(line)}</span>`)
      .join('');
  }
  if (langSeal) langSeal.textContent = copy.seal;
  if (langToggle) langToggle.setAttribute('aria-label', copy.switchTo);
  if (graphEl) graphEl.setAttribute('aria-label', copy.graph);
  if (detailsClose) detailsClose.setAttribute('aria-label', copy.close);
  if (themeToggle) themeToggle.setAttribute('aria-label', copy.theme);
  if (backLink) backLink.setAttribute('aria-label', copy.back);
}

function setLang(next, { stamp = false, updateHistory = true } = {}) {
  if (next !== 'zh' && next !== 'en') return;
  const changed = next !== lang;
  lang = next;
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  applyChrome();
  if (stamp && langSeal) {
    langSeal.classList.remove('is-stamping');
    void langSeal.offsetWidth;
    langSeal.classList.add('is-stamping');
    questionTextEl?.classList.remove('is-inking');
    void questionTextEl?.offsetWidth;
    questionTextEl?.classList.add('is-inking');
  }
  if (updateHistory) {
    const url = pathForLang(lang);
    if (location.pathname.replace(/\/$/, '') !== url) {
      history.pushState({ graphLang: lang }, '', url);
    }
  }
  if (changed) render({ keepView: true });
  if (openDetailsId) showDetails(openDetailsId);
}

function render(options = {}) {
  const outgoing = outgoingMap();
  if (!options.keepView || positions.size === 0) {
    positions = computeLayout();
    viewport = fitViewport(positions);
  }
  applyViewport();

  const color = edgeStroke();
  const parts = [
    '<defs>' +
      edges.map((edge) => {
        const from = positions.get(edge.from_id);
        const to = positions.get(edge.to_id);
        if (!from || !to) return '';
        const s = circleAnchor(from.x, from.y, to.x, to.y, PHOTO_R + 3);
        const e = circleAnchor(to.x, to.y, from.x, from.y, PHOTO_R + 3);
        const gid = `pg-grad-${edge.id}`;
        return `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${s.x}" y1="${s.y}" x2="${e.x}" y2="${e.y}">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.95"/>
        </linearGradient>`;
      }).join('') +
    '</defs>'
  ];

  for (const edge of edges) {
    const from = positions.get(edge.from_id);
    const to = positions.get(edge.to_id);
    if (!from || !to) continue;
    const s = circleAnchor(from.x, from.y, to.x, to.y, PHOTO_R + 3);
    const e = circleAnchor(to.x, to.y, from.x, from.y, PHOTO_R + 3);
    parts.push(
      `<path d="M ${s.x} ${s.y} L ${e.x} ${e.y}" fill="none" stroke="url(#pg-grad-${edge.id})" stroke-width="2" stroke-linecap="round"/>`
    );
  }
  svgEl.innerHTML = parts.join('');

  nodesEl.innerHTML = nodes.map((node) => {
    const p = positions.get(node.id);
    if (!p) return '';
    const open = isOpen(node.id, outgoing);
    const given = (outgoing.get(node.id) || []).length;
    const name = displayName(node);
    const photo = node.photo_url
      ? `<img src="${escapeAttr(node.photo_url)}" alt="">`
      : `<span>${escapeHtml(initialFor(name))}</span>`;
    const slots = [0, 1].map((i) =>
      `<span class="people-node-slot${i < given ? ' is-filled' : ''}"></span>`
    ).join('');
    return `<button type="button" class="people-node${open ? ' is-open' : ''}" data-id="${escapeAttr(node.id)}" style="left:${p.x}px;top:${p.y}px">
      <span class="people-node-photo">${photo}</span>
      <span class="people-node-name">${escapeHtml(name)}</span>
      <span class="people-node-slots" aria-hidden="true">${slots}</span>
    </button>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showDetails(id) {
  const node = nodeById(id);
  if (!node) return;
  openDetailsId = id;
  const copy = t();
  const name = displayName(node);
  const desc = displayDesc(node);
  detailsName.textContent = name;
  detailsDesc.textContent = desc;
  detailsDesc.classList.toggle('hidden', !desc);
  const from = parentName(id);
  detailsFrom.textContent = from ? copy.from(from) : copy.starting;
  const added = formatAdded(node.created_at);
  detailsAdded.textContent = added ? copy.added(added) : '';
  detailsAdded.classList.toggle('hidden', !added);
  detailsPhoto.innerHTML = node.photo_url
    ? `<img src="${escapeAttr(node.photo_url)}" alt="">`
    : `<span>${escapeHtml(initialFor(name))}</span>`;
  detailsEl.classList.remove('hidden');
}

function hideDetails() {
  openDetailsId = null;
  detailsEl.classList.add('hidden');
}

function measure() {
  viewWidth = graphEl.clientWidth;
  viewHeight = graphEl.clientHeight;
}

async function loadGraph() {
  const response = await fetch(`/api/graph?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });
  const data = await response.json();
  if (!data.success) return;
  nodes = data.nodes || [];
  edges = data.edges || [];
  measure();
  render();
}

function setupPanZoom() {
  let pan = null;

  graphEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.people-node, .people-details, .people-graph-question, button, a')) return;
    hideDetails();
    pan = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: viewport.x,
      origY: viewport.y
    };
    graphEl.classList.add('is-panning');
    graphEl.setPointerCapture(e.pointerId);
  });

  graphEl.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.pointerId) return;
    viewport.x = pan.origX + (e.clientX - pan.startX);
    viewport.y = pan.origY + (e.clientY - pan.startY);
    applyViewport();
  });

  const endPan = (e) => {
    if (!pan || e.pointerId !== pan.pointerId) return;
    pan = null;
    graphEl.classList.remove('is-panning');
  };
  graphEl.addEventListener('pointerup', endPan);
  graphEl.addEventListener('pointercancel', endPan);

  graphEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = graphEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -e.deltaY * ZOOM_FACTOR;
    const newScale = clampScale(viewport.scale * (1 + delta));
    const ratio = newScale / viewport.scale;
    viewport = {
      scale: newScale,
      x: mx - (mx - viewport.x) * ratio,
      y: my - (my - viewport.y) * ratio
    };
    applyViewport();
  }, { passive: false });
}

nodesEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.people-node');
  if (!btn) return;
  e.stopPropagation();
  showDetails(btn.dataset.id);
});

detailsClose.addEventListener('click', hideDetails);
detailsEl.addEventListener('click', (e) => {
  if (e.target === detailsEl) hideDetails();
});

if (langToggle) {
  langToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setLang(lang === 'zh' ? 'en' : 'zh', { stamp: true });
  });
}

window.addEventListener('popstate', () => {
  const next = location.pathname.replace(/\/$/, '').endsWith('/zh') ? 'zh' : 'en';
  setLang(next, { updateHistory: false });
});

document.addEventListener('themeChanged', () => render({ keepView: true }));
window.addEventListener('resize', () => {
  measure();
  render();
});

setupPanZoom();
measure();

(function rememberLang() {
  let stored = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch {}
  const pathZh = location.pathname.replace(/\/$/, '').endsWith('/zh');
  if (pathZh) {
    setLang('zh', { updateHistory: false });
    return;
  }
  if (stored === 'zh' || stored === 'en') {
    if (stored !== lang) setLang(stored, { updateHistory: true });
    return;
  }
  const browserZh = String(navigator.language || '').toLowerCase().startsWith('zh');
  if (browserZh) setLang('zh', { updateHistory: true });
})();

loadGraph().catch((error) => console.error('Failed to load graph', error));
