const { berlinDateKey, toNumber } = require('./liquidity');

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

function monthlyItemEur(item) {
  const eur = Number(item.amount_usd);
  if (Number.isFinite(eur)) return eur;
  const amount = Math.abs(Number(item.amount) || 0);
  return item.direction === 'in' ? amount : -amount;
}

function sortMonthlyItems(recurring = []) {
  return [...recurring].sort((a, b) => {
    const eurDiff = monthlyItemEur(a) - monthlyItemEur(b);
    if (eurDiff !== 0) return eurDiff;
    const dayDiff = Number(a.day_of_month) - Number(b.day_of_month);
    if (dayDiff !== 0) return dayDiff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function emptyPayload() {
  return {
    success: true,
    series: null,
    recurring: [],
    runway: null
  };
}

function jsonForPage(payload) {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function buildLiquidityFetchView({ series = null, recurring = [], runway = null } = {}) {
  const items = sortMonthlyItems(recurring);
  const expenses = items.filter((item) => item.direction !== 'in');
  const expensesEur = Number(runway?.expenses_usd);
  const total = Number.isFinite(expensesEur)
    ? expensesEur
    : expenses.reduce((sum, item) => sum + Math.abs(monthlyItemEur(item)), 0);
  const points = Array.isArray(series?.points) ? series.points : [];

  return {
    now: formatEur(series?.current ?? 0),
    bank: formatEur(series?.bank ?? 0),
    cash: formatEur(series?.cash ?? 0),
    open: formatEur(series?.open ?? 0),
    runway: runway?.label || 'cash runway: —',
    monthlyTotal: formatEur(-Math.abs(total)),
    monthly: items.map((item) => ({
      name: String(item.name || '').trim() || 'untitled',
      day: String(item.day_of_month ?? ''),
      amount: formatSignedEur(monthlyItemEur(item))
    })),
    points: points.map((point) => ({
      day: berlinDateKey(point.at) || String(point.at || '').slice(0, 10),
      note: String(point.note || '').trim(),
      delta: point.kind === 'start' ? formatEur(toNumber(point.balance, 0)) : formatDeltaWithNative(point),
      balance: formatEur(point.balance),
      bank: formatEur(point.bank),
      cash: formatEur(point.cash),
      open: formatEur(point.open)
    }))
  };
}

module.exports = {
  emptyPayload,
  jsonForPage,
  buildLiquidityFetchView
};
