-- Cause effect map graph — run once in Supabase SQL Editor
-- Safe to re-run

CREATE TABLE IF NOT EXISTS cause_graph (
  id TEXT PRIMARY KEY DEFAULT 'main',
  graph JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cause_graph (id, graph)
VALUES (
  'main',
  '{
    "points": [
      { "id": "a", "title": "POINT A", "description": "", "condition": "" },
      { "id": "b", "title": "POINT B", "description": "", "condition": "@POINT A" }
    ],
    "edges": []
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE cause_graph ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON cause_graph;
CREATE POLICY "Allow public read access" ON cause_graph
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON cause_graph;
CREATE POLICY "Allow all operations" ON cause_graph
  FOR ALL USING (true);
