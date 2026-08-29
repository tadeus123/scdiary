function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  const formatted = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${n < 0 ? '−' : ''}$${formatted}`;
}

function formatAxisUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const compact = (abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '');
    return `${n < 0 ? '−' : ''}$${compact}k`;
  }
  return `${n < 0 ? '−' : ''}$${abs.toFixed(abs >= 100 ? 0 : 2)}`;
}

function formatDateLabel(iso, mode = false) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (mode === 'time') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', mode
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function niceTicks(min, max, count = 5) {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.2);
    min -= pad;
    max += pad;
  }

  const range = max - min;
  const rough = range / Math.max(1, count - 1);
  const exponent = Math.floor(Math.log10(rough));
  const fraction = rough / Math.pow(10, exponent);
  let niceFraction = 1;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  const step = niceFraction * Math.pow(10, exponent);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return { min: niceMin, max: niceMax, ticks };
}

function timeTicks(startMs, endMs, count = 5) {
  const span = Math.max(1, endMs - startMs);
  const ticks = [];
  const steps = Math.max(2, count);
  for (let i = 0; i < steps; i++) {
    ticks.push(startMs + (span * i) / (steps - 1));
  }
  return ticks;
}

function uniqueLabeledTicks(ticks, formatter) {
  const seen = new Set();
  const unique = [];
  for (const tick of ticks) {
    const label = formatter(tick);
    if (seen.has(label)) continue;
    seen.add(label);
    unique.push(tick);
  }
  if (unique.length >= 2) return unique;
  return [ticks[0], ticks[ticks.length - 1]].filter((tick, index, list) => list.indexOf(tick) === index);
}

function viewportSize() {
  const visual = window.visualViewport;
  return {
    width: Math.round(visual?.width || window.innerWidth),
    height: Math.round(visual?.height || window.innerHeight)
  };
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, ' ');
}

function renderChart(series) {
  const container = document.getElementById('liquidity-chart');
  const balanceEl = document.getElementById('liquidity-balance');
  if (!container || !series?.points?.length) return;

  if (balanceEl) {
    balanceEl.textContent = `now: ${formatUsd(series.current)}`;
  }

  const { width, height } = viewportSize();
  const compact = width < 700;
  const padding = {
    top: compact ? 108 : Math.max(96, height * 0.16),
    right: compact ? 20 : 48,
    bottom: compact ? 64 : 72,
    left: compact ? 52 : 72
  };
  const graphWidth = Math.max(40, width - padding.left - padding.right);
  const graphHeight = Math.max(40, height - padding.top - padding.bottom);

  const times = series.points.map((point) => new Date(point.at).getTime());
  const startMs = times[0];
  const endMs = times[times.length - 1];
  const span = Math.max(1, endMs - startMs);
  const balances = series.points.map((point) => Number(point.balance));
  let minBalance = Math.min(...balances);
  let maxBalance = Math.max(...balances);
  if (minBalance > 0) minBalance = 0;
  if (maxBalance < 0) maxBalance = 0;

  const yScale = niceTicks(minBalance, maxBalance, compact ? 4 : 5);
  const xOf = (ms) => padding.left + ((ms - startMs) / span) * graphWidth;
  const yOf = (value) => padding.top + ((yScale.max - value) / (yScale.max - yScale.min || 1)) * graphHeight;

  const mapped = series.points.map((point, index) => ({
    ...point,
    x: xOf(times[index]),
    y: yOf(Number(point.balance))
  }));

  let path = `M ${mapped[0].x} ${mapped[0].y}`;
  for (let i = 1; i < mapped.length; i++) {
    path += ` H ${mapped[i].x} V ${mapped[i].y}`;
  }

  const zeroY = yScale.min <= 0 && yScale.max >= 0 ? yOf(0) : null;
  const sameDay = new Date(startMs).toDateString() === new Date(endMs).toDateString();
  const labelMode = sameDay ? 'time' : compact;
  const xTickValues = uniqueLabeledTicks(
    timeTicks(startMs, endMs, compact ? 3 : (span > 1000 * 60 * 60 * 24 * 180 ? 6 : 5)),
    (ms) => formatDateLabel(ms, labelMode)
  );
  const yTitleX = compact ? 14 : 18;
  const xLabelY = height - (compact ? 22 : 28);
  const xTitleY = height - (compact ? 8 : 10);
  const dotRadius = compact ? 6 : 4.5;
  const hitRadius = compact ? 18 : 10;

  container.innerHTML = `
    <svg class="liquidity-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Liquidity over time">
      ${yScale.ticks.map((tick) => `
        <line x1="${padding.left}" y1="${yOf(tick)}" x2="${width - padding.right}" y2="${yOf(tick)}" class="timeline-grid-line" />
        <text x="${padding.left - 8}" y="${yOf(tick) + 4}" class="timeline-axis-label" text-anchor="end">${escapeXml(formatAxisUsd(tick))}</text>
      `).join('')}
      ${zeroY !== null ? `<line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" class="liquidity-zero-line" />` : ''}
      <path d="${path}" class="timeline-line" />
      ${mapped.filter((point) => point.kind === 'entry' || point.kind === 'monthly').map((point) => `
        <g class="liquidity-marker">
          <circle cx="${point.x}" cy="${point.y}" r="${hitRadius}" class="liquidity-hit" data-at="${escapeXml(point.at)}" data-balance="${point.balance}" data-note="${escapeXml(point.note || '')}" />
          <circle cx="${point.x}" cy="${point.y}" r="${dotRadius}" class="timeline-marker-dot" />
        </g>
      `).join('')}
      ${xTickValues.map((ms) => `
        <text x="${xOf(ms)}" y="${xLabelY}" class="timeline-axis-label" text-anchor="middle">${escapeXml(formatDateLabel(ms, labelMode))}</text>
      `).join('')}
      <text x="${padding.left + graphWidth / 2}" y="${xTitleY}" class="timeline-axis-title" text-anchor="middle">time</text>
      <text x="${yTitleX}" y="${padding.top + graphHeight / 2}" class="timeline-axis-title" text-anchor="middle" transform="rotate(-90 ${yTitleX} ${padding.top + graphHeight / 2})">USD</text>
    </svg>
  `;

  const tooltip = document.getElementById('liquidity-tooltip');
  const showTip = (event, target) => {
    if (!tooltip || !target) return;
    const note = target.getAttribute('data-note');
    const at = target.getAttribute('data-at');
    const balance = target.getAttribute('data-balance');
    tooltip.innerHTML = `${escapeXml(formatDateLabel(at))}<br>${escapeXml(formatUsd(balance))}${note ? `<br>${escapeXml(note)}` : ''}`;
    tooltip.classList.remove('hidden');
    const x = event.clientX ?? (target.getBoundingClientRect().left);
    const y = event.clientY ?? (target.getBoundingClientRect().top);
    const tipWidth = 160;
    tooltip.style.left = `${Math.min(width - tipWidth - 12, Math.max(12, x + 12))}px`;
    tooltip.style.top = `${Math.max(12, y - 72)}px`;
  };

  container.querySelectorAll('.liquidity-hit').forEach((hit) => {
    hit.addEventListener('mouseenter', (event) => showTip(event, event.target));
    hit.addEventListener('mousemove', (event) => showTip(event, event.target));
    hit.addEventListener('mouseleave', () => tooltip?.classList.add('hidden'));
    hit.addEventListener('click', (event) => {
      event.stopPropagation();
      if (tooltip && !tooltip.classList.contains('hidden') && tooltip.dataset.at === event.target.getAttribute('data-at')) {
        tooltip.classList.add('hidden');
        return;
      }
      if (tooltip) tooltip.dataset.at = event.target.getAttribute('data-at') || '';
      showTip(event, event.target);
    });
  });

  container.onclick = (event) => {
    if (event.target.closest('.liquidity-hit')) return;
    tooltip?.classList.add('hidden');
  };
}

async function loadLiquidity() {
  try {
    const response = await fetch(`/api/liquidity?t=${Date.now()}`, {
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await response.json();
    if (!data.success) {
      document.getElementById('liquidity-balance').textContent = 'could not load liquidity';
      return;
    }
    renderChart(data.series);
  } catch (error) {
    console.error('Error loading liquidity:', error);
    const balanceEl = document.getElementById('liquidity-balance');
    if (balanceEl) balanceEl.textContent = 'could not load liquidity';
  }
}

let resizeTimer = null;
function scheduleRedraw() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(loadLiquidity, 150);
}
window.addEventListener('resize', scheduleRedraw);
window.visualViewport?.addEventListener('resize', scheduleRedraw);

document.addEventListener('themeChanged', loadLiquidity);
loadLiquidity();
