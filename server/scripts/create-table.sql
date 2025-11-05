-- Create entries table for Supabase
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries (sorted by timestamp DESC)
CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp DESC);

-- Enable Row Level Security
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anyone can read entries)
CREATE POLICY "Allow public read access" ON entries
  FOR SELECT USING (true);

-- Allow authenticated insert/update/delete (server will handle auth)
-- Since we're using server-side auth, we can allow all operations
CREATE POLICY "Allow all operations" ON entries
  FOR ALL USING (true);

