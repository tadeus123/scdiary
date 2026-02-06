-- Reset all audio_duration_minutes to NULL
-- This allows AI to research fresh from Audible.com for all books

UPDATE books 
SET audio_duration_minutes = NULL;

-- Verify the reset
SELECT 
  id,
  title,
  author,
  audio_duration_minutes
FROM books
ORDER BY date_read DESC;

-- Expected: All audio_duration_minutes should now be NULL
