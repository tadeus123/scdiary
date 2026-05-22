-- Quick fix if eisenkind_notes exists but save fails (missing headline column)
ALTER TABLE eisenkind_notes
  ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT 'How to make humanoid robots that we love and that spread love?';
