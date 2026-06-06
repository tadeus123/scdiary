-- Eisenkind notes — run once in Supabase SQL Editor
-- Safe to re-run (fixes tables created without headline column)

CREATE TABLE IF NOT EXISTS eisenkind_notes (
  id TEXT PRIMARY KEY DEFAULT 'main',
  content TEXT NOT NULL DEFAULT '',
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  brain_dump TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL DEFAULT '',
  story_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add headline BEFORE any insert that uses it (fixes existing tables)
ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT 'How to make humanoid robots that we love and that spread love?';

ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS brain_dump TEXT NOT NULL DEFAULT '';

ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS story TEXT NOT NULL DEFAULT '';

ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS story_updated_at TIMESTAMPTZ;

INSERT INTO eisenkind_notes (id, headline, content)
VALUES (
  'main',
  'How to make humanoid robots that we love and that spread love?',
  ''
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE eisenkind_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON eisenkind_notes;
CREATE POLICY "Allow public read access" ON eisenkind_notes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON eisenkind_notes;
CREATE POLICY "Allow all operations" ON eisenkind_notes
  FOR ALL USING (true);
