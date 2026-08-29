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

function formatDateLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function timeTicks(startMs, endMs) {
  const span = Math.max(1, endMs - startMs);
  const count = span > 1000 * 60 * 60 * 24 * 180 ? 6 : 5;
  const ticks = [];
  for (let i = 0; i < count; i++) {
    ticks.push(startMs + (span * i) / (count - 1));
  }
  return ticks;
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

  const width = window.innerWidth;
  const height = window.innerHeight;
  const padding = {
    top: Math.max(96, height * 0.16),
    right: 48,
    bottom: 72,
    left: width < 640 ? 56 : 72
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

  const yScale = niceTicks(minBalance, maxBalance, 5);
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
  const xTickValues = timeTicks(startMs, endMs);

  container.innerHTML = `
    <svg class="liquidity-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Liquidity over time">
      ${yScale.ticks.map((tick) => `
        <line x1="${padding.left}" y1="${yOf(tick)}" x2="${width - padding.right}" y2="${yOf(tick)}" class="timeline-grid-line" />
        <text x="${padding.left - 10}" y="${yOf(tick) + 4}" class="timeline-axis-label" text-anchor="end">${escapeXml(formatAxisUsd(tick))}</text>
      `).join('')}
      ${zeroY !== null ? `<line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" class="liquidity-zero-line" />` : ''}
      <path d="${path}" class="timeline-line" />
      ${mapped.filter((point) => point.kind === 'entry' || point.kind === 'monthly').map((point) => `
        <circle cx="${point.x}" cy="${point.y}" r="4.5" class="timeline-marker-dot" data-at="${escapeXml(point.at)}" data-balance="${point.balance}" data-note="${escapeXml(point.note || '')}" />
      `).join('')}
      ${xTickValues.map((ms) => `
        <text x="${xOf(ms)}" y="${height - 28}" class="timeline-axis-label" text-anchor="middle">${escapeXml(formatDateLabel(ms))}</text>
      `).join('')}
      <text x="${padding.left + graphWidth / 2}" y="${height - 10}" class="timeline-axis-title" text-anchor="middle">time</text>
      <text x="18" y="${padding.top + graphHeight / 2}" class="timeline-axis-title" text-anchor="middle" transform="rotate(-90 18 ${padding.top + graphHeight / 2})">USD</text>
    </svg>
  `;

  const tooltip = document.getElementById('liquidity-tooltip');
  container.querySelectorAll('.timeline-marker-dot').forEach((dot) => {
    dot.addEventListener('mouseenter', (event) => {
      if (!tooltip) return;
      const note = event.target.getAttribute('data-note');
      const at = event.target.getAttribute('data-at');
      const balance = event.target.getAttribute('data-balance');
      tooltip.innerHTML = `${escapeXml(formatDateLabel(at))}<br>${escapeXml(formatUsd(balance))}${note ? `<br>${escapeXml(note)}` : ''}`;
      tooltip.classList.remove('hidden');
    });
    dot.addEventListener('mousemove', (event) => {
      if (!tooltip) return;
      tooltip.style.left = `${event.clientX + 12}px`;
      tooltip.style.top = `${event.clientY + 12}px`;
    });
    dot.addEventListener('mouseleave', () => {
      tooltip?.classList.add('hidden');
    });
  });
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
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(loadLiquidity, 150);
});

document.addEventListener('themeChanged', loadLiquidity);
loadLiquidity();
