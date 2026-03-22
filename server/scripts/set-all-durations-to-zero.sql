-- Set all books' audio_duration_minutes to 0 (not NULL)
-- This will make the timeline show "0 hours" instead of using estimates
-- Run this in Supabase SQL Editor

UPDATE books 
SET audio_duration_minutes = 0
WHERE audio_duration_minutes IS NULL;

-- Verify the update
SELECT 
  COUNT(*) as total_books,
  COUNT(CASE WHEN audio_duration_minutes = 0 THEN 1 END) as books_set_to_zero,
  COUNT(CASE WHEN audio_duration_minutes IS NULL THEN 1 END) as books_still_null,
  COUNT(CASE WHEN audio_duration_minutes > 0 THEN 1 END) as books_with_duration
FROM books;
