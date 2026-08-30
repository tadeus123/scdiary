-- Liquidity tracker — run once in Supabase SQL Editor (safe to re-run)

CREATE TABLE IF NOT EXISTS liquidity_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  starting_balance_usd NUMERIC(14, 2) NOT NULL DEFAULT -2.50,
  starting_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO liquidity_settings (id, starting_balance_usd, starting_at)
VALUES ('main', -2.50, NOW())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS liquidity_entries (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate NUMERIC(14, 6) NOT NULL DEFAULT 1,
  amount_usd NUMERIC(14, 2) NOT NULL,
  direction TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT liquidity_entries_currency_check CHECK (currency IN ('USD', 'EUR')),
  CONSTRAINT liquidity_entries_direction_check CHECK (direction IN ('in', 'out')),
  CONSTRAINT liquidity_entries_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_liquidity_entries_timestamp ON liquidity_entries (timestamp ASC);

CREATE TABLE IF NOT EXISTS liquidity_recurring (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  direction TEXT NOT NULL,
  day_of_month INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT liquidity_recurring_currency_check CHECK (currency IN ('USD', 'EUR')),
  CONSTRAINT liquidity_recurring_direction_check CHECK (direction IN ('in', 'out')),
  CONSTRAINT liquidity_recurring_amount_positive CHECK (amount > 0),
  CONSTRAINT liquidity_recurring_day_check CHECK (day_of_month >= 1 AND day_of_month <= 31)
);

CREATE INDEX IF NOT EXISTS idx_liquidity_recurring_start ON liquidity_recurring (start_date ASC);

ALTER TABLE liquidity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_recurring ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON liquidity_settings;
CREATE POLICY "Allow public read access" ON liquidity_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON liquidity_settings;
CREATE POLICY "Allow all operations" ON liquidity_settings
  FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read access" ON liquidity_entries;
CREATE POLICY "Allow public read access" ON liquidity_entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON liquidity_entries;
CREATE POLICY "Allow all operations" ON liquidity_entries
  FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read access" ON liquidity_recurring;
CREATE POLICY "Allow public read access" ON liquidity_recurring
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON liquidity_recurring;
CREATE POLICY "Allow all operations" ON liquidity_recurring
  FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS liquidity_liabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate NUMERIC(14, 6) NOT NULL DEFAULT 1,
  amount_usd NUMERIC(14, 2) NOT NULL,
  due_date DATE,
  entry_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT liquidity_liabilities_currency_check CHECK (currency IN ('USD', 'EUR')),
  CONSTRAINT liquidity_liabilities_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_liquidity_liabilities_due ON liquidity_liabilities (due_date ASC NULLS FIRST);

ALTER TABLE liquidity_liabilities
  ADD COLUMN IF NOT EXISTS entry_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_liquidity_liabilities_entry_id
  ON liquidity_liabilities (entry_id)
  WHERE entry_id IS NOT NULL;

ALTER TABLE liquidity_entries
  ADD COLUMN IF NOT EXISTS recurring_id TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_liquidity_entries_monthly_occurrence
  ON liquidity_entries (recurring_id, occurrence_date)
  WHERE recurring_id IS NOT NULL;

ALTER TABLE liquidity_liabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON liquidity_liabilities;
CREATE POLICY "Allow public read access" ON liquidity_liabilities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON liquidity_liabilities;
CREATE POLICY "Allow all operations" ON liquidity_liabilities
  FOR ALL USING (true);
