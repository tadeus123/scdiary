-- Add category field to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS category TEXT;

-- Create index for faster category queries
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);

-- Add comment
COMMENT ON COLUMN books.category IS 'Auto-assigned category: Biography, Technology, Business, Finance, Philosophy, Science Fiction, Science, Design, etc.';
