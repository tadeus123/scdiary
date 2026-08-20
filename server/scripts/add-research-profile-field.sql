-- Independent research notes for intellectual book matching
ALTER TABLE books ADD COLUMN IF NOT EXISTS research_profile JSONB;
COMMENT ON COLUMN books.research_profile IS 'Independent AI research notes used for intellectual matching of book connections';

-- Why two books were connected
ALTER TABLE book_connections ADD COLUMN IF NOT EXISTS reason TEXT;
COMMENT ON COLUMN book_connections.reason IS 'Why these two books were connected';
