-- Remove page_count field - we only use Audible audiobook durations
ALTER TABLE books DROP COLUMN IF EXISTS page_count;

-- Verify the column is removed
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'books'
ORDER BY ordinal_position;
