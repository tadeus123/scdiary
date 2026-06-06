-- Brain dump + AI-generated Lennon story (run once in Supabase SQL Editor)
ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS brain_dump TEXT NOT NULL DEFAULT '';

ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS story TEXT NOT NULL DEFAULT '';

ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS story_updated_at TIMESTAMPTZ;
