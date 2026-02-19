-- Create book_rereads table for tracking when books are read multiple times
-- Each re-read adds to total reading time and appears on the timeline graph

CREATE TABLE IF NOT EXISTS book_rereads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  date_read DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_rereads_book_id ON book_rereads(book_id);
CREATE INDEX IF NOT EXISTS idx_book_rereads_date ON book_rereads(date_read DESC);

ALTER TABLE book_rereads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view book rereads" ON book_rereads
  FOR SELECT USING (true);

-- Allow all operations (backend uses service role; adjust per your auth setup)
DROP POLICY IF EXISTS "Allow all operations on book_rereads" ON book_rereads;
CREATE POLICY "Allow all operations on book_rereads" ON book_rereads
  FOR ALL USING (true) WITH CHECK (true);
