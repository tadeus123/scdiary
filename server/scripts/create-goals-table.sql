-- Create goals table for Supabase
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries (sorted by created_at)
CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at ASC);

-- Enable Row Level Security
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anyone can read goals)
DROP POLICY IF EXISTS "Allow public read access" ON goals;
CREATE POLICY "Allow public read access" ON goals
  FOR SELECT USING (true);

-- Allow all operations (server will handle auth)
DROP POLICY IF EXISTS "Allow all operations" ON goals;
CREATE POLICY "Allow all operations" ON goals
  FOR ALL USING (true);

