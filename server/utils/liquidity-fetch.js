const { berlinDateKey, formatDayDe, toNumber } = require('./liquidity');

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
    runway: null,
    entries: [],
    pending: [],
    openLiabilities: []
  };
}

function jsonForPage(payload) {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function isOpenAiFetcher(req) {
  const ua = String((req && req.get && req.get('user-agent')) || '').toLowerCase();
  return /gptbot|chatgpt-user|oai-searchbot|oai-adsbot|openai/.test(ua);
}

function prefersPlainText(req) {
  const accept = String((req && req.get && req.get('accept')) || '').toLowerCase();
  if (!accept) return false;
  const html = accept.indexOf('text/html');
  const plain = accept.indexOf('text/plain');
  if (plain === -1) return false;
  if (html === -1) return true;
  return plain < html;
}

function ledgerRows(entries = []) {
  return [...entries].map((item) => ({
    day: formatDayDe(item.timestamp) || berlinDateKey(item.timestamp) || '',
    amount: formatSignedEur(monthlyItemEur(item)),
    note: String(item.note || '').trim(),
    account: String(item.account || 'bank') === 'cash' ? 'cash' : 'bank'
  }));
}

function liabilityRows(items = []) {
  return [...items].map((item) => ({
    day: formatDayDe(item.created_at) || berlinDateKey(item.created_at) || '',
    amount: formatSignedEur(-Math.abs(monthlyItemEur({ ...item, direction: 'out' }))),
    note: String(item.name || '').trim()
  }));
}

function buildLiquidityFetchView({
  series = null,
  recurring = [],
  runway = null,
  entries = [],
  pending = [],
  openLiabilities = []
} = {}) {
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
    transactions: ledgerRows(entries),
    pending: ledgerRows(pending),
    liabilities: liabilityRows(openLiabilities),
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

function lineForRow(row) {
  const note = row.note ? `  ${row.note}` : '';
  const account = row.account === 'cash' ? '  cash' : '';
  return `${row.day}  ${row.amount}${note}${account}`;
}

function toPlainText(view) {
  const lines = [
    'Tade Mehl — liquidity',
    'https://www.tademehl.com/liquidity',
    '',
    `now: ${view.now}`,
    `bank: ${view.bank}`,
    `cash: ${view.cash}`,
    `open: ${view.open}`,
    view.runway,
    '',
    'monthly'
  ];
  if (!view.monthly.length) {
    lines.push('no monthly expenses yet');
  } else {
    for (const item of view.monthly) {
      lines.push(`${item.name}  day ${item.day}  ${item.amount}`);
    }
  }
  lines.push(`total monthly lost money: ${view.monthlyTotal}`);
  lines.push('');
  lines.push('transactions');
  if (!view.transactions.length) {
    lines.push('no transactions yet');
  } else {
    for (const row of view.transactions) lines.push(lineForRow(row));
  }
  if (view.pending.length) {
    lines.push('');
    lines.push('pending');
    for (const row of view.pending) lines.push(lineForRow(row));
  }
  if (view.liabilities.length) {
    lines.push('');
    lines.push('open liabilities');
    for (const row of view.liabilities) lines.push(`${row.day}  ${row.amount}  ${row.note}`);
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  emptyPayload,
  jsonForPage,
  isOpenAiFetcher,
  prefersPlainText,
  buildLiquidityFetchView,
  toPlainText
};
