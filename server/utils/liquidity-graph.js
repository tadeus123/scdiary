const {
  getLiquiditySettings,
  getLiquidityEntries,
  getLiquidityRecurring,
  getLiquidityLiabilities,
  createLiquidityEntries
} = require('../db/supabase');
const { getEurUsdRate, getLatestEurUsdRate } = require('./fx');
const {
  buildLiquiditySeries,
  dueMonthlyLogs,
  signedUsd,
  toNumber,
  cashRunwayMonths,
  formatCashRunway
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

  const rows = [];
  for (const log of missing) {
    const item = log.item;
    let fx_rate = 1;
    try {
      if (String(item.currency).toUpperCase() === 'EUR') {
        fx_rate = await getEurUsdRate(log.occurrence_date);
      }
    } catch (error) {
      console.error('Monthly FX conversion failed:', error);
      continue;
    }

    rows.push({
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
    });
  }

  if (!rows.length) return { inserted: 0 };

  const result = await createLiquidityEntries(rows);
  if (!result.success) {
    console.error('Failed to materialize monthly logs:', result.error);
    return { inserted: 0 };
  }
  return { inserted: rows.length };
}

async function loadLiquidityGraph(now = new Date()) {
  await materializeDueMonthlyLogs(now);

  const [settings, entries, recurring, liabilities] = await Promise.all([
    getLiquiditySettings(),
    getLiquidityEntries(),
    getLiquidityRecurring(),
    getLiquidityLiabilities()
  ]);

  const series = buildLiquiditySeries({
    entries,
    liabilities
  });

  let latestRate = 1;
  if (recurring.some((item) => String(item.currency).toUpperCase() === 'EUR')) {
    try {
      latestRate = await getLatestEurUsdRate();
    } catch (error) {
      console.error('Latest FX rate failed:', error);
    }
  }

  const months = cashRunwayMonths(series.current, recurring, latestRate);
  const runway = {
    months,
    label: formatCashRunway(months)
  };

  return { settings, entries, recurring, liabilities, series, runway };
}

module.exports = {
  materializeDueMonthlyLogs,
  loadLiquidityGraph
};
