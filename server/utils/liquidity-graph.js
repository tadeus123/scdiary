const {
  getLiquiditySettings,
  getLiquidityEntries,
  getLiquidityRecurring,
  getLiquidityLiabilities,
  createLiquidityEntries
} = require('../db/supabase');
const { getLatestEurUsdRate } = require('./fx');
const {
  buildLiquiditySeries,
  dueMonthlyLogs,
  signedUsd,
  toNumber,
  cashRunwayMonths,
  formatCashRunway,
  monthlyFlowEur,
  withLiveEur,
  berlinNoonIso,
  berlinDateKey,
  normalizeStatus
} = require('./liquidity');

function occurrenceKey(entry) {
  if (entry.recurring_id && entry.occurrence_date) {
    return `${entry.recurring_id}|${String(entry.occurrence_date).slice(0, 10)}`;
  }
  return entry.id;
}

function isApproved(entry) {
  return normalizeStatus(entry?.status || 'approved') === 'approved';
}

async function materializeDueMonthlyLogs(now = new Date()) {
  const [recurring, entries] = await Promise.all([
    getLiquidityRecurring(),
    getLiquidityEntries()
  ]);

  if (!recurring.length) return { inserted: 0 };

  const existing = new Set(entries.map(occurrenceKey));
  const due = dueMonthlyLogs(recurring, now);
  const missing = due.filter((log) => {
    return !existing.has(log.id) && !existing.has(`${log.recurring_id}|${log.occurrence_date}`);
  });

  if (!missing.length) return { inserted: 0 };

  let latestRate = 1;
  try {
    if (missing.some((log) => String(log.item.currency).toUpperCase() === 'USD')) {
      latestRate = await getLatestEurUsdRate();
    }
  } catch (error) {
    console.error('Monthly FX conversion failed:', error);
  }

  const rows = missing.map((log) => {
    const item = log.item;
    const currency = String(item.currency || 'EUR').toUpperCase();
    const fx_rate = currency === 'USD' ? latestRate : 1;
    return {
      id: log.id,
      timestamp: berlinNoonIso(log.occurrence_date),
      amount: toNumber(item.amount),
      currency: item.currency,
      fx_rate,
      amount_usd: signedUsd(item.amount, item.direction, fx_rate),
      direction: item.direction,
      note: item.name || '',
      recurring_id: item.id,
      occurrence_date: log.occurrence_date,
      status: 'pending',
      account: 'bank',
      liability_id: null
    };
  });

  if (!rows.length) return { inserted: 0 };

  const result = await createLiquidityEntries(rows);
  if (!result.success) {
    console.error('Failed to materialize monthly logs:', result.error);
    return { inserted: 0 };
  }
  return { inserted: rows.length };
}

async function resolveEurUsdRate(items = []) {
  try {
    return await getLatestEurUsdRate();
  } catch (error) {
    console.error('Latest FX rate failed:', error);
    const fallback = [...items]
      .filter((item) => String(item?.currency || '').toUpperCase() === 'USD')
      .map((item) => toNumber(item.fx_rate, 0))
      .find((rate) => rate > 0);
    return fallback || 1;
  }
}

function sortByTime(rows, direction = 'asc') {
  const sign = direction === 'desc' ? -1 : 1;
  return [...(rows || [])].sort((a, b) => {
    const diff = new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime();
    return sign * diff;
  });
}

async function loadLiquidityGraph(now = new Date()) {
  await materializeDueMonthlyLogs(now);

  const [settings, rawEntries, recurring, liabilities] = await Promise.all([
    getLiquiditySettings(),
    getLiquidityEntries(),
    getLiquidityRecurring(),
    getLiquidityLiabilities()
  ]);

  const latestRate = await resolveEurUsdRate([...rawEntries, ...recurring, ...liabilities]);
  const entries = rawEntries.map((item) => withLiveEur(item, latestRate, item.direction));
  const liabilitiesView = liabilities.map((item) => withLiveEur(item, latestRate, 'out'));
  const pending = sortByTime(entries.filter((item) => !isApproved(item)), 'asc');
  const approved = sortByTime(entries.filter(isApproved), 'desc');
  const openLiabilities = liabilitiesView.filter((item) => String(item.status || 'open') !== 'paid');

  const series = buildLiquiditySeries({
    startingBank: toNumber(settings.starting_bank_eur, settings.starting_balance_usd),
    startingAt: settings.starting_at,
    cashEur: toNumber(settings.cash_eur, 0),
    entries: rawEntries,
    liabilities,
    eurUsdRate: latestRate
  });

  const flow = monthlyFlowEur(recurring, latestRate);
  const months = cashRunwayMonths(series.current, recurring, latestRate);
  const runway = {
    months,
    label: formatCashRunway(months),
    incoming_usd: flow.incoming,
    expenses_usd: flow.outgoing,
    combined_usd: flow.combined
  };

  const recurringView = recurring.map((item) => withLiveEur(item, latestRate, item.direction));
  const snapshot = {
    bank: series.bank,
    cash: series.cash,
    open: series.open,
    current: series.current
  };

  return {
    settings,
    entries: approved,
    pending,
    recurring: recurringView,
    liabilities: liabilitiesView,
    openLiabilities,
    series,
    snapshot,
    runway,
    today: berlinDateKey(now)
  };
}

module.exports = {
  materializeDueMonthlyLogs,
  loadLiquidityGraph
};
