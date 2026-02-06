-- ============================================
-- VERIFICATION SCRIPT FOR READING TIME FEATURE
-- Run this in Supabase SQL Editor to verify setup
-- ============================================

-- 1. Check if new columns exist in books table
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'books'
ORDER BY ordinal_position;

-- Expected Result: Should show these columns:
-- id                         | uuid          | NO
-- title                      | text          | NO
-- author                     | text          | NO
-- cover_image_url            | text          | NO
-- date_read                  | date          | NO
-- created_at                 | timestamp     | YES
-- category                   | text          | YES
-- page_count                 | integer       | YES  ← NEW!
-- audio_duration_minutes     | integer       | YES  ← NEW!

-- ============================================

-- 2. Check column comments (optional)
SELECT 
    col.column_name,
    pgd.description
FROM pg_catalog.pg_statio_all_tables AS st
INNER JOIN pg_catalog.pg_description pgd ON (pgd.objoid = st.relid)
INNER JOIN information_schema.columns col ON (
    pgd.objsubid = col.ordinal_position AND
    col.table_schema = st.schemaname AND
    col.table_name = st.relname
)
WHERE st.relname = 'books' 
AND col.column_name IN ('page_count', 'audio_duration_minutes');

-- Expected Result: Should show descriptions for the new columns

-- ============================================

-- 3. Test the columns by checking existing books
SELECT 
    id,
    title,
    author,
    page_count,
    audio_duration_minutes,
    date_read
FROM books
ORDER BY date_read DESC
LIMIT 5;

-- Expected Result: 
-- - Should show your books with NULL values for page_count and audio_duration_minutes
-- - This is normal for existing books (they'll use default 5-hour estimate)
-- - New books added after setup will have AI-researched values

-- ============================================

-- 4. Verify the books table structure is complete
SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'books'
ORDER BY ordinal_position;

-- ============================================
-- ✅ IF ALL QUERIES RUN SUCCESSFULLY, YOU'RE READY!
-- ============================================
