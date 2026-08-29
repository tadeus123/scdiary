const {
  getLiquiditySettings,
  getLiquidityEntries,
  getLiquidityRecurring
} = require('../db/supabase');
const { getLatestEurUsdRate, getEurUsdRates } = require('./fx');
const { buildLiquiditySeries, dateKey } = require('./liquidity');

async function loadLiquidityGraph(now = new Date()) {
  const [settings, entries, recurring] = await Promise.all([
    getLiquiditySettings(),
    getLiquidityEntries(),
    getLiquidityRecurring()
  ]);

  const needsFx = recurring.some((item) => String(item.currency).toUpperCase() === 'EUR');
  let ratesByDate = {};
  let latestRate = 1;

  if (needsFx) {
    latestRate = await getLatestEurUsdRate();
    const startKey = dateKey(settings.starting_at) || dateKey(now);
    const endKey = dateKey(now);
    ratesByDate = await getEurUsdRates(startKey, endKey);
  }

  const series = buildLiquiditySeries({
    settings,
    entries,
    recurring,
    ratesByDate,
    latestRate,
    now
  });

  return { settings, entries, recurring, series };
}

module.exports = {
  loadLiquidityGraph
};
