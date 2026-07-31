// Kind hours timeline — same visual language as bookshelf timeline,
// with cumulative hours on the Y-axis and time on the X-axis.

let kindEntries = [];
let timelineEntriesByPosition = {};
let currentEntryIndexByPosition = {};
let timelinePoints = [];

function formatHours(value) {
  const n = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(n) ? String(n) : String(n);
}

function formatDate(dateStr) {
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function hideKindDetails() {
  const detailsDiv = document.getElementById('kind-details');
  if (detailsDiv) detailsDiv.classList.add('hidden');
}

function showKindDetails(entry) {
  const detailsDiv = document.getElementById('kind-details');
  const hoursEl = document.getElementById('kind-details-hours');
  const dateEl = document.getElementById('kind-details-date');
  if (!detailsDiv || !hoursEl || !dateEl || !entry) return;

  hoursEl.textContent = `${formatHours(entry.hours)} hour${Number(entry.hours) === 1 ? '' : 's'}`;
  dateEl.innerHTML = `<p class="book-date">${formatDate(entry.date_logged)}</p>`;
  detailsDiv.classList.remove('hidden');
}

window.showTimelineKindEntry = function (positionKey) {
  const indexes = timelineEntriesByPosition[positionKey];
  if (!indexes || indexes.length === 0) return;

  const currentIdx = currentEntryIndexByPosition[positionKey] || 0;
  const pointIndex = indexes[currentIdx];
  const point = timelinePoints[pointIndex];

  if (point && point.entry) {
    showKindDetails(point.entry);
    currentEntryIndexByPosition[positionKey] = (currentIdx + 1) % indexes.length;
  }
};

function renderKindTimeline() {
  const container = document.getElementById('kind-timeline');
  if (!container) return;

  if (!kindEntries.length) {
    container.innerHTML = `
      <div class="kind-empty-state">
        <p>no hours logged yet.</p>
      </div>
    `;
    return;
  }

  const sorted = [...kindEntries].sort((a, b) => {
    const da = new Date(a.date_logged).getTime();
    const db = new Date(b.date_logged).getTime();
    if (da !== db) return da - db;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  let cumulative = 0;
  const events = sorted.map((entry) => {
    cumulative += Number(entry.hours) || 0;
    return { entry, cumulative };
  });

  const totalHours = cumulative;
  const maxHours = Math.max(totalHours, 1);

  const minWidth = 1200;
  const pixelsPerEntry = 25;
  const svgWidth = Math.max(minWidth, events.length * pixelsPerEntry);
  const svgHeight = 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 60 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const firstDate = new Date(events[0].entry.date_logged.includes('T')
    ? events[0].entry.date_logged
    : `${events[0].entry.date_logged}T12:00:00`);
  const lastDate = new Date(events[events.length - 1].entry.date_logged.includes('T')
    ? events[events.length - 1].entry.date_logged
    : `${events[events.length - 1].entry.date_logged}T12:00:00`);
  let timeRange = lastDate - firstDate;
  if (timeRange === 0) {
    timeRange = 86400000;
  }

  timelinePoints = events.map((event, index) => {
    const date = new Date(event.entry.date_logged.includes('T')
      ? event.entry.date_logged
      : `${event.entry.date_logged}T12:00:00`);
    let x = padding.left + ((date - firstDate) / timeRange) * graphWidth;
    if (lastDate - firstDate === 0) {
      x = padding.left + graphWidth / 2;
    }
    const y = padding.top + graphHeight - (event.cumulative / maxHours) * graphHeight;
    return { x, y, entry: event.entry, cumulative: event.cumulative, index };
  });

  timelineEntriesByPosition = {};
  currentEntryIndexByPosition = {};

  timelinePoints.forEach((point) => {
    const date = new Date(point.entry.date_logged.includes('T')
      ? point.entry.date_logged
      : `${point.entry.date_logged}T12:00:00`);
    if (isNaN(date.getTime())) return;
    const dateKey = date.toDateString();
    if (!timelineEntriesByPosition[dateKey]) {
      timelineEntriesByPosition[dateKey] = [];
      currentEntryIndexByPosition[dateKey] = 0;
    }
    timelineEntriesByPosition[dateKey].push(point.index);
    point.dateKey = dateKey;
  });

  const linePath = timelinePoints.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ');

  const gridRatios = [0, 0.25, 0.5, 0.75, 1];

  container.innerHTML = `
    <svg class="timeline-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
      ${gridRatios.map((ratio) => {
        const hoursLabel = formatHours(maxHours * ratio);
        return `
        <line x1="${padding.left}" y1="${padding.top + graphHeight * (1 - ratio)}"
              x2="${svgWidth - padding.right}" y2="${padding.top + graphHeight * (1 - ratio)}"
              class="timeline-grid-line" />
        <text x="${padding.left - 10}" y="${padding.top + graphHeight * (1 - ratio) + 5}"
              class="timeline-axis-label" text-anchor="end">
          ${hoursLabel}
        </text>
      `;
      }).join('')}

      <path d="${linePath}" class="timeline-line" />

      ${timelinePoints.map((p) => `
        <g class="timeline-marker">
          <line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${svgHeight - padding.bottom}"
                class="timeline-marker-line"
                onclick="window.showTimelineKindEntry('${p.dateKey}')" />
          <circle cx="${p.x}" cy="${p.y}" r="5"
                  class="timeline-marker-dot"
                  onclick="window.showTimelineKindEntry('${p.dateKey}')" />
        </g>
      `).join('')}

      <text x="${svgWidth / 2}" y="${svgHeight - 10}" class="timeline-axis-title" text-anchor="middle">
        Time
      </text>
      <text x="20" y="${svgHeight / 2}" class="timeline-axis-title" text-anchor="middle"
            transform="rotate(-90 20 ${svgHeight / 2})">
        Hours
      </text>
    </svg>
    <div class="reading-time-summary">
      total kind time: ${formatHours(totalHours)} hours
    </div>
  `;
}

async function loadKindHours() {
  try {
    const response = await fetch(`/api/kind/hours?t=${Date.now()}`, {
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await response.json();
    if (!data.success) {
      console.error('Failed to load kind hours');
      return;
    }
    kindEntries = data.entries || [];
    renderKindTimeline();
  } catch (error) {
    console.error('Error loading kind hours:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close-kind-details');
  if (closeBtn) closeBtn.addEventListener('click', hideKindDetails);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideKindDetails();
  });

  loadKindHours();
});
