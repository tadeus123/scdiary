-- Create books table
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  cover_image_url TEXT NOT NULL,
  date_read DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create book_connections table
CREATE TABLE IF NOT EXISTS book_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  to_book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(from_book_id, to_book_id),
  CHECK (from_book_id != to_book_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_books_date_read ON books(date_read DESC);
CREATE INDEX IF NOT EXISTS idx_book_connections_from ON book_connections(from_book_id);
CREATE INDEX IF NOT EXISTS idx_book_connections_to ON book_connections(to_book_id);

-- Enable Row Level Security (RLS)
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_connections ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Public can view books" ON books
  FOR SELECT USING (true);

CREATE POLICY "Public can view book connections" ON book_connections
  FOR SELECT USING (true);

-- Note: Insert/Update/Delete policies should be added based on your auth setup
-- For now, you'll need to insert/update/delete via the Supabase dashboard or service role key
