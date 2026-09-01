const {
  getLiquiditySettings,
  getLiquidityEntries,
  getLiquidityRecurring,
  getLiquidityLiabilities,
  createLiquidityEntries,
  deleteLiquidityEntry,
  updateLiquidityLiability
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
  isTapeEntry
} = require('./liquidity');

function occurrenceKey(entry) {
  if (entry.recurring_id && entry.occurrence_date) {
    return `${entry.recurring_id}|${String(entry.occurrence_date).slice(0, 10)}`;
  }
  return entry.id;
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
    if (missing.some((log) => String(log.item.currency).toUpperCase() === 'EUR')) {
      latestRate = await getLatestEurUsdRate();
    }
  } catch (error) {
    console.error('Monthly FX conversion failed:', error);
  }

  const rows = missing.map((log) => {
    const item = log.item;
    const currency = String(item.currency || 'USD').toUpperCase();
    const fx_rate = currency === 'EUR' ? latestRate : 1;
    return {
      id: log.id,
      timestamp: `${log.occurrence_date}T12:00:00.000Z`,
      amount: toNumber(item.amount),
      currency: item.currency,
      fx_rate,
      amount_usd: signedUsd(item.amount, item.direction, fx_rate),
      direction: item.direction,
      note: item.name || '',
      recurring_id: item.id,
      occurrence_date: log.occurrence_date
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

async function stripReservationLogs(liabilities = [], entries = []) {
  const ids = new Set();
  for (const entry of entries) {
    if (!isTapeEntry(entry)) ids.add(entry.id);
  }
  for (const item of liabilities) {
    if (item?.entry_id) ids.add(item.entry_id);
  }
  if (!ids.size) {
    return { liabilities, entries: entries.filter(isTapeEntry) };
  }

  for (const id of ids) {
    await deleteLiquidityEntry(id);
  }
  for (const item of liabilities) {
    if (item?.entry_id) {
      await updateLiquidityLiability(item.id, { entry_id: null });
    }
  }

  const [nextLiabilities, nextEntries] = await Promise.all([
    getLiquidityLiabilities(),
    getLiquidityEntries()
  ]);
  return {
    liabilities: nextLiabilities,
    entries: nextEntries.filter(isTapeEntry)
  };
}

async function resolveEurUsdRate(items = []) {
  try {
    return await getLatestEurUsdRate();
  } catch (error) {
    console.error('Latest FX rate failed:', error);
    const fallback = [...items]
      .filter((item) => String(item?.currency || '').toUpperCase() === 'EUR')
      .map((item) => toNumber(item.fx_rate, 0))
      .find((rate) => rate > 0);
    return fallback || 1;
  }
}

async function loadLiquidityGraph(now = new Date()) {
  await materializeDueMonthlyLogs(now);

  const [settings, rawEntries, recurring, rawLiabilities] = await Promise.all([
    getLiquiditySettings(),
    getLiquidityEntries(),
    getLiquidityRecurring(),
    getLiquidityLiabilities()
  ]);

  const stripped = await stripReservationLogs(rawLiabilities, rawEntries);
  const liabilities = stripped.liabilities;
  const tapeEntries = stripped.entries;

  const latestRate = await resolveEurUsdRate([...tapeEntries, ...recurring, ...liabilities]);
  const entries = tapeEntries.map((item) => withLiveEur(item, latestRate, item.direction));
  const liabilitiesView = liabilities.map((item) => withLiveEur(item, latestRate, 'out'));
  const series = buildLiquiditySeries({
    entries: tapeEntries,
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

  return { settings, entries, recurring: recurringView, liabilities: liabilitiesView, series, runway };
}

module.exports = {
  materializeDueMonthlyLogs,
  loadLiquidityGraph
};
