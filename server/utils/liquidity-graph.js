const {
  getLiquiditySettings,
  getLiquidityEntries,
  getLiquidityRecurring,
  getLiquidityLiabilities
} = require('../db/supabase');
const { getLatestEurUsdRate, getEurUsdRates } = require('./fx');
const { buildLiquiditySeries, dateKey, utcDateFromKey, horizonEndAt } = require('./liquidity');

async function loadLiquidityGraph(now = new Date()) {
  const [settings, entries, recurring, liabilities] = await Promise.all([
    getLiquiditySettings(),
    getLiquidityEntries(),
    getLiquidityRecurring(),
    getLiquidityLiabilities()
  ]);

  const needsFx = recurring.some((item) => String(item.currency).toUpperCase() === 'EUR');
  let ratesByDate = {};
  let latestRate = 1;

  if (needsFx) {
    latestRate = await getLatestEurUsdRate();
    const startKey = dateKey(settings.starting_at) || dateKey(now);
    const startDay = utcDateFromKey(startKey);
    let lastEntryAt = null;
    for (const entry of entries) {
      const at = new Date(entry.timestamp);
      if (!Number.isNaN(at.getTime()) && (!lastEntryAt || at > lastEntryAt)) lastEntryAt = at;
    }
    const endKey = dateKey(horizonEndAt(startDay, now, lastEntryAt));
    ratesByDate = await getEurUsdRates(startKey, endKey);
  }

  const series = buildLiquiditySeries({
    settings,
    entries,
    recurring,
    liabilities,
    ratesByDate,
    latestRate,
    now
  });

  return { settings, entries, recurring, liabilities, series };
}

module.exports = {
  loadLiquidityGraph
};
