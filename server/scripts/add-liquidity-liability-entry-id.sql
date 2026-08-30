-- Link each open liability to the reservation log that dropped the graph.
-- Safe to re-run.

ALTER TABLE liquidity_liabilities
  ADD COLUMN IF NOT EXISTS entry_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_liquidity_liabilities_entry_id
  ON liquidity_liabilities (entry_id)
  WHERE entry_id IS NOT NULL;

INSERT INTO liquidity_entries (
  id, timestamp, amount, currency, fx_rate, amount_usd, direction, note
)
SELECT
  'lq-lb-' || l.id,
  COALESCE(l.created_at, NOW()),
  l.amount,
  l.currency,
  COALESCE(l.fx_rate, 1),
  -ABS(l.amount_usd),
  'out',
  l.name
FROM liquidity_liabilities l
WHERE l.entry_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM liquidity_entries e WHERE e.id = 'lq-lb-' || l.id
  );

UPDATE liquidity_liabilities l
SET entry_id = 'lq-lb-' || l.id
WHERE l.entry_id IS NULL;
