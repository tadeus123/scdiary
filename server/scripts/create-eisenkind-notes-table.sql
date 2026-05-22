-- Eisenkind manifesto / notes (single document, edited in /admin/eisenkind)
CREATE TABLE IF NOT EXISTS eisenkind_notes (
  id TEXT PRIMARY KEY DEFAULT 'main',
  headline TEXT NOT NULL DEFAULT 'How to make humanoid robots that we love and that spread love?',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO eisenkind_notes (id, headline, content)
VALUES (
  'main',
  'How to make humanoid robots that we love and that spread love?',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- If table already exists without headline (re-run safe):
ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT 'How to make humanoid robots that we love and that spread love?';

ALTER TABLE eisenkind_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON eisenkind_notes;
CREATE POLICY "Allow public read access" ON eisenkind_notes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON eisenkind_notes;
CREATE POLICY "Allow all operations" ON eisenkind_notes
  FOR ALL USING (true);
