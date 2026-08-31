const {
  getLiquiditySettings,
  getLiquidityEntries,
  getLiquidityRecurring,
  getLiquidityLiabilities,
  createLiquidityEntries,
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
  monthlyFlowUsd,
  reservationEntryFromLiability,
  withLiveUsd
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

async function ensureLiabilityReservationLogs(liabilities = []) {
  const missing = (liabilities || []).filter((item) => item && item.id && !item.entry_id);
  if (!missing.length) return liabilities;

  const rows = missing.map((item) => (
    reservationEntryFromLiability(item, item.created_at || new Date().toISOString())
  ));
  const logged = await createLiquidityEntries(rows);
  if (!logged.success) {
    console.error('Failed to backfill liability reservation logs:', logged.error);
    return liabilities;
  }

  for (const item of missing) {
    const updated = await updateLiquidityLiability(item.id, {
      entry_id: reservationEntryFromLiability(item).id
    });
    if (!updated.success) {
      console.error('Failed to link liability reservation log:', item.id, updated.error);
    }
  }

  return getLiquidityLiabilities();
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

  const liabilities = await ensureLiabilityReservationLogs(rawLiabilities);
  const rawLoadedEntries = liabilities === rawLiabilities
    ? rawEntries
    : await getLiquidityEntries();

  const latestRate = await resolveEurUsdRate([...rawLoadedEntries, ...recurring, ...liabilities]);
  const entries = rawLoadedEntries.map((item) => withLiveUsd(item, latestRate, item.direction));
  const liabilitiesView = liabilities.map((item) => withLiveUsd(item, latestRate, 'out'));
  const series = buildLiquiditySeries({
    entries: rawLoadedEntries,
    eurUsdRate: latestRate
  });

  const flow = monthlyFlowUsd(recurring, latestRate);
  const months = cashRunwayMonths(series.current, recurring, latestRate);
  const runway = {
    months,
    label: formatCashRunway(months),
    incoming_usd: flow.incoming,
    expenses_usd: flow.outgoing,
    combined_usd: flow.combined
  };

  const recurringView = recurring.map((item) => withLiveUsd(item, latestRate, item.direction));

  return { settings, entries, recurring: recurringView, liabilities: liabilitiesView, series, runway };
}

module.exports = {
  materializeDueMonthlyLogs,
  loadLiquidityGraph
};
