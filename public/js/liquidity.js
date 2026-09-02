function formatEur(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '€0.00';
  const formatted = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${n < 0 ? '−' : ''}€${formatted}`;
}

function formatSignedEur(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '€0.00';
  const formatted = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${n < 0 ? '−' : '+'}€${formatted}`;
}

function formatDeltaWithNative(point) {
  const eur = formatSignedEur(point.delta);
  if (String(point.currency || '').toUpperCase() !== 'USD') return eur;
  const amount = Math.abs(Number(point.amount) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${eur} ($${amount})`;
}

function formatAxisEur(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '€0';
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const compact = (abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '');
    return `${n < 0 ? '−' : ''}€${compact}k`;
  }
  return `${n < 0 ? '−' : ''}€${abs.toFixed(abs >= 100 ? 0 : 2)}`;
}

function formatDateLabel(iso, compact = false) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const spanHint = typeof compact === 'string' ? compact : (compact ? 'short' : 'day');
  if (spanHint === 'month') {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  if (spanHint === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function berlinDayKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function berlinDayStartMs(iso) {
  const key = berlinDayKey(iso);
  if (!key) return 0;
  return new Date(`${key}T00:00:00+02:00`).getTime();
}

function formatTooltipWhen(iso) {
  const key = berlinDayKey(iso);
  if (!key) return '';
  const [year, month, day] = key.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
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

function dayAxisTicks(startMs, endMs, compact) {
  const spanDays = Math.max(1, (endMs - startMs) / (24 * 60 * 60 * 1000));
  const ticks = [startMs];
  const start = new Date(startMs);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;
  const monthStep = spanDays > 240 ? (compact ? 3 : 2) : 1;

  while (month > 11) {
    month -= 12;
    year += 1;
  }

  while (true) {
    const tick = Date.UTC(year, month, 1);
    if (tick >= endMs - 12 * 24 * 60 * 60 * 1000) break;
    if (tick > startMs) ticks.push(tick);
    month += monthStep;
    while (month > 11) {
      month -= 12;
      year += 1;
    }
  }

  ticks.push(endMs);
  return uniqueLabeledTicks(ticks, (ms) => formatDateLabel(ms, spanDays > 80 ? 'month' : (compact ? 'short' : 'day')));
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

function chartSize(container) {
  if (document.body.classList.contains('admin-liquidity-page')) {
    const rect = container.getBoundingClientRect();
    return {
      width: Math.max(280, Math.round(rect.width || window.innerWidth - 48)),
      height: Math.max(240, Math.round(rect.height || 360))
    };
  }
  return viewportSize();
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

function escapeTooltipNote(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

function monthlyItemUsd(item) {
  const usd = Number(item.amount_usd);
  if (Number.isFinite(usd)) return usd;
  const amount = Math.abs(Number(item.amount) || 0);
  return item.direction === 'in' ? amount : -amount;
}

function sortMonthlyItems(recurring = []) {
  return [...recurring].sort((a, b) => {
    const usdDiff = monthlyItemUsd(a) - monthlyItemUsd(b);
    if (usdDiff !== 0) return usdDiff;
    const dayDiff = Number(a.day_of_month) - Number(b.day_of_month);
    if (dayDiff !== 0) return dayDiff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function renderMonthlyOverlay(recurring = [], runway) {
  const list = document.getElementById('liquidity-monthly-list');
  const totals = document.getElementById('liquidity-monthly-totals');
  if (!list || !totals) return;

  const items = sortMonthlyItems(recurring);
  const expenses = items.filter((item) => item.direction !== 'in');
  if (!items.length) {
    list.innerHTML = '<p class="liquidity-monthly-empty">no monthly expenses yet</p>';
  } else {
    list.innerHTML = items.map((item) => {
      const usd = monthlyItemUsd(item);
      const sumClass = usd < 0 ? 'liquidity-monthly-sum' : 'liquidity-monthly-sum liquidity-monthly-sum-in';
      return `
        <div class="liquidity-monthly-row">
          <div class="liquidity-monthly-copy">
            <span class="liquidity-monthly-name">${escapeXml(item.name || '')}</span>
            <span class="liquidity-monthly-meta">day ${escapeXml(String(item.day_of_month))}</span>
          </div>
          <span class="${sumClass}">${escapeXml(formatSignedEur(usd))}</span>
        </div>
      `;
    }).join('');
  }

  const expensesUsd = Number(runway?.expenses_usd);
  const total = Number.isFinite(expensesUsd)
    ? expensesUsd
    : expenses.reduce((sum, item) => sum + Math.abs(monthlyItemUsd(item)), 0);

  totals.innerHTML = `
    <div class="liquidity-monthly-total">
      <span>total monthly lost money</span>
      <span class="liquidity-monthly-sum">${escapeXml(formatEur(-Math.abs(total)))}</span>
    </div>
    <p class="liquidity-runway">${escapeXml(runway?.label || 'cash runway: —')}</p>
  `;
}

function setMonthlyOverlayOpen(open) {
  const overlay = document.getElementById('liquidity-monthly-overlay');
  const toggle = document.getElementById('liquidity-monthly-toggle');
  if (!overlay || !toggle) return;
  overlay.classList.toggle('hidden', !open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.classList.toggle('liquidity-monthly-open', open);
}

function bindMonthlyToggle() {
  const toggle = document.getElementById('liquidity-monthly-toggle');
  const overlay = document.getElementById('liquidity-monthly-overlay');
  const close = document.getElementById('liquidity-monthly-close');
  if (!toggle || !overlay || toggle.dataset.bound === 'true') return;
  toggle.dataset.bound = 'true';

  toggle.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const isClosed = overlay.classList.contains('hidden');
    setMonthlyOverlayOpen(isClosed);
  };
  if (close) {
    close.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      setMonthlyOverlayOpen(false);
    };
  }
  overlay.onclick = (event) => {
    if (event.target === overlay) setMonthlyOverlayOpen(false);
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMonthlyOverlayOpen(false);
  });
}

function renderChart(series) {
  const container = document.getElementById('liquidity-chart');
  const balanceEl = document.getElementById('liquidity-balance');
  if (!container) return;

  if (balanceEl) {
    balanceEl.textContent = `now: ${formatEur(series?.current ?? 0)}`;
  }

  const points = series?.points || [];
  const { width, height } = chartSize(container);
  const compact = width < 700;
  const padding = {
    top: compact ? 108 : Math.max(96, height * 0.16),
    right: compact ? 20 : 48,
    bottom: compact ? 72 : 76,
    left: compact ? 52 : 72
  };
  const graphWidth = Math.max(40, width - padding.left - padding.right);
  const graphHeight = Math.max(40, height - padding.top - padding.bottom);
  const axisBottom = padding.top + graphHeight;
  const yTitleX = compact ? 14 : 18;
  const xLabelY = height - (compact ? 36 : 32);
  const xTitleY = height - (compact ? 16 : 12);

  if (!points.length) {
    container.innerHTML = `
      <svg class="liquidity-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Liquidity over time">
        <text x="${padding.left + graphWidth / 2}" y="${xTitleY}" class="timeline-axis-title" text-anchor="middle">Time</text>
        <text x="${yTitleX}" y="${padding.top + graphHeight / 2}" class="timeline-axis-title" text-anchor="middle" transform="rotate(-90 ${yTitleX} ${padding.top + graphHeight / 2})">EUR</text>
      </svg>
    `;
    return;
  }

  const dayMs = points.map((point) => berlinDayStartMs(point.at));
  const startMs = dayMs[0];
  const endMs = dayMs[dayMs.length - 1];
  const span = Math.max(24 * 60 * 60 * 1000, endMs - startMs);
  const xOf = (ms) => padding.left + ((ms - startMs) / span) * graphWidth;

  const logs = points.map((point, index) => ({
    ...point,
    dayKey: berlinDayKey(point.at),
    dayMs: dayMs[index]
  }));

  const pointsByDay = new Map();
  logs.forEach((point) => {
    const group = pointsByDay.get(point.dayKey) || [];
    group.push(point);
    pointsByDay.set(point.dayKey, group);
  });

  const dailyPoints = [...pointsByDay.values()].map((group) => {
    const last = group[group.length - 1];
    return {
      ...last,
      x: xOf(last.dayMs)
    };
  });

  const balances = dailyPoints.map((point) => Number(point.balance));
  let minBalance = Math.min(...balances);
  let maxBalance = Math.max(...balances);

  const yScale = niceTicks(minBalance, maxBalance, compact ? 4 : 5);
  const yOf = (value) => padding.top + ((yScale.max - value) / (yScale.max - yScale.min || 1)) * graphHeight;

  dailyPoints.forEach((point) => {
    point.y = yOf(Number(point.balance));
  });

  const sticks = dailyPoints.map((point) => ({
    dayKey: point.dayKey,
    x: point.x,
    topY: point.y
  }));

  const linePath = dailyPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const xTickValues = dayAxisTicks(startMs, endMs, compact);
  const labelMode = (endMs - startMs) / (24 * 60 * 60 * 1000) > 80 ? 'month' : (compact ? 'short' : 'day');
  const dotRadius = compact ? 6 : 5;
  const hitRadius = compact ? 22 : 16;

  container.innerHTML = `
    <svg class="liquidity-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Liquidity over time">
      ${yScale.ticks.map((tick) => `
        <line x1="${padding.left}" y1="${yOf(tick)}" x2="${width - padding.right}" y2="${yOf(tick)}" class="timeline-grid-line" />
        <text x="${padding.left - 8}" y="${yOf(tick) + 4}" class="timeline-axis-label" text-anchor="end">${escapeXml(formatAxisEur(tick))}</text>
      `).join('')}
      <path d="${linePath}" class="timeline-line" />
      ${sticks.map((stick) => `
        <line x1="${stick.x}" y1="${stick.topY}" x2="${stick.x}" y2="${axisBottom}" class="timeline-marker-line liquidity-hit" data-day="${escapeXml(stick.dayKey)}" />
      `).join('')}
      ${dailyPoints.map((point) => `
        <g class="timeline-marker liquidity-marker">
          <circle cx="${point.x}" cy="${point.y}" r="${hitRadius}" class="liquidity-hit" data-id="${escapeXml(point.id || point.at)}" data-day="${escapeXml(point.dayKey)}" data-at="${escapeXml(point.at)}" data-balance="${point.balance}" data-delta="${point.delta}" data-note="${escapeXml(point.note || '')}" data-amount="${point.amount}" data-currency="${escapeXml(point.currency || '')}" />
          <circle cx="${point.x}" cy="${point.y}" r="${dotRadius}" class="timeline-marker-dot" />
        </g>
      `).join('')}
      ${xTickValues.map((ms) => `
        <text x="${xOf(ms)}" y="${xLabelY}" class="timeline-axis-label" text-anchor="middle">${escapeXml(formatDateLabel(ms, labelMode))}</text>
      `).join('')}
      <text x="${padding.left + graphWidth / 2}" y="${xTitleY}" class="timeline-axis-title" text-anchor="middle">Time</text>
      <text x="${yTitleX}" y="${padding.top + graphHeight / 2}" class="timeline-axis-title" text-anchor="middle" transform="rotate(-90 ${yTitleX} ${padding.top + graphHeight / 2})">EUR</text>
    </svg>
  `;

  const tooltip = document.getElementById('liquidity-tooltip');
  let pinnedDay = null;

  const hideTip = () => {
    pinnedDay = null;
    tooltip?.classList.add('hidden');
  };

  const showDay = (dayKey, event, pin = false) => {
    if (!tooltip || !dayKey) return;
    const group = pointsByDay.get(dayKey) || [];
    if (!group.length) return;
    const last = group[group.length - 1];
    const daily = dailyPoints.find((point) => point.dayKey === dayKey) || last;
    const logs = group.filter((point) => point.kind !== 'start').map((point) => {
      const delta = Number(point.delta);
      const deltaClass = delta < 0 ? ' liquidity-tooltip-out' : '';
      const note = point.note
        ? `<span class="liquidity-tooltip-note">${escapeTooltipNote(point.note)}</span>`
        : '';
      return `
        <div class="liquidity-tooltip-log">
          ${note}
          <span class="liquidity-tooltip-delta${deltaClass}">${escapeXml(formatDeltaWithNative(point))}</span>
        </div>
      `;
    }).join('');
    tooltip.innerHTML = `
      <span class="liquidity-tooltip-when">${escapeXml(formatTooltipWhen(last.at))}</span>
      ${logs}
      <span class="liquidity-tooltip-balance">${escapeXml(formatEur(last.balance))}</span>
    `;
    tooltip.classList.remove('hidden');
    if (pin) pinnedDay = dayKey;
    const x = event.clientX ?? daily.x;
    const y = event.clientY ?? daily.y;
    const tipWidth = tooltip.offsetWidth || 200;
    const tipHeight = tooltip.offsetHeight || 72;
    tooltip.style.left = `${Math.min(width - tipWidth - 12, Math.max(12, x + 12))}px`;
    const above = y - tipHeight - 12;
    tooltip.style.top = `${above >= 12 ? above : Math.min(height - tipHeight - 12, y + 16)}px`;
  };

  container.querySelectorAll('.liquidity-hit').forEach((hit) => {
    hit.addEventListener('mouseenter', (event) => {
      if (pinnedDay) return;
      showDay(event.currentTarget.getAttribute('data-day'), event);
    });
    hit.addEventListener('mousemove', (event) => {
      if (pinnedDay) return;
      showDay(event.currentTarget.getAttribute('data-day'), event);
    });
    hit.addEventListener('mouseleave', () => {
      if (pinnedDay) return;
      tooltip?.classList.add('hidden');
    });
    hit.addEventListener('click', (event) => {
      event.stopPropagation();
      const day = event.currentTarget.getAttribute('data-day') || '';
      if (pinnedDay && pinnedDay === day) {
        hideTip();
        return;
      }
      showDay(day, event, true);
    });
  });

  container.onclick = (event) => {
    if (event.target.closest('.liquidity-hit')) return;
    hideTip();
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
    renderMonthlyOverlay(data.recurring || [], data.runway);
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
bindMonthlyToggle();
loadLiquidity();
