-- Add typed blocks to eisenkind notes (run once in Supabase SQL Editor)
ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]'::jsonb;
