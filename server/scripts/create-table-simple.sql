CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp DESC);

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON entries;
CREATE POLICY "Allow public read access" ON entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON entries;
CREATE POLICY "Allow all operations" ON entries
  FOR ALL USING (true);

