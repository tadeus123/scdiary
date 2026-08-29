const {
  getLiquiditySettings,
  getLiquidityEntries,
  getLiquidityRecurring,
  getLiquidityLiabilities
} = require('../db/supabase');
const { buildLiquiditySeries } = require('./liquidity');

async function loadLiquidityGraph() {
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

  return { settings, entries, recurring, liabilities, series };
}

module.exports = {
  loadLiquidityGraph
};
