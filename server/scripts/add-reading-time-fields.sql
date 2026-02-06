-- Add reading time fields to books table
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS page_count INTEGER,
ADD COLUMN IF NOT EXISTS audio_duration_minutes INTEGER;

-- Add comments to explain the fields
COMMENT ON COLUMN books.page_count IS 'Number of pages in the book (used for fallback time calculation)';
COMMENT ON COLUMN books.audio_duration_minutes IS 'Duration of audiobook in minutes (preferred for time calculation)';
