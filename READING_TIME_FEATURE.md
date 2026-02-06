# Total Reading Time Feature

## Overview
This feature calculates and displays the total time spent reading all books in your bookshelf. It appears in the **Timeline View** (when you toggle the bookshelf switch).

## Features

### Display Location
- **Timeline View Only**: The reading time summary appears as a floating card in the bottom-right corner of the timeline view
- Shows: Total formatted time, number of books, and total hours

### Calculation Method
The system calculates reading time using a priority-based approach:

1. **Priority 1 - Audio Duration** (Most Accurate)
   - If an audiobook duration is available, it uses that directly
   - This is the most accurate representation of reading time

2. **Priority 2 - Page Count Estimation**
   - If no audio duration is available, estimates based on page count
   - Average reading speed: ~250 words per minute
   - Average words per page: ~250-300 words
   - Roughly 1 minute per page

3. **Priority 3 - Default Average**
   - If neither audio duration nor page count is available
   - Uses a default of 300 minutes (~5 hours) per book
   - Average book length estimate

## Database Changes

### New Fields Added to `books` Table
```sql
-- Add these fields to your books table
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS page_count INTEGER,
ADD COLUMN IF NOT EXISTS audio_duration_minutes INTEGER;
```

**Run this SQL in your Supabase Dashboard:**
1. Go to: SQL Editor in Supabase
2. Copy and paste the contents of `server/scripts/add-reading-time-fields.sql`
3. Click "Run"

## Usage

### For Users (Public Bookshelf)
1. Navigate to `/bookshelf`
2. Toggle the switch in the bottom-left corner to **Timeline View**
3. The reading time summary will appear in the bottom-right corner

### For Admins (Adding Books)
When adding a new book in `/admin/bookshelf`, you can now optionally provide:

1. **Page Count** (optional)
   - Enter the number of pages in the book
   - Used for reading time estimation if no audio duration

2. **Audio Duration** (optional, in minutes)
   - Enter the length of the audiobook in minutes
   - Example: For a 7-hour audiobook, enter `420` minutes
   - This is the preferred method for accurate reading time

**Example:**
- For "Atomic Habits" by James Clear:
  - Page Count: 320
  - Audio Duration: 318 (5 hours 18 minutes)

## API Endpoint

### GET `/api/books/total-reading-time`

Returns calculated reading time for all books:

```json
{
  "success": true,
  "totalMinutes": 4560,
  "totalHours": 76,
  "totalDays": 3.2,
  "totalBooks": 15,
  "booksWithAudioDuration": 8,
  "booksEstimated": 7,
  "formattedTime": "3 days 4 hours"
}
```

## Styling

The reading time card is styled to match your existing bookshelf aesthetic:
- Floating card with backdrop blur
- Accent color for the time value
- Responsive design for mobile devices
- Automatically adapts to dark/light theme

## Implementation Files Changed

### Backend
- `server/routes/diary.js` - Added API endpoint and updated book creation
- `server/scripts/add-reading-time-fields.sql` - Database migration

### Frontend
- `public/js/bookshelf.js` - Fetches and displays reading time
- `public/css/style.css` - Styling for reading time summary
- `views/admin-bookshelf.ejs` - Added form fields for page count and audio duration

## Future Enhancements

Possible improvements:
1. **Automatic Audio Duration Lookup**: Integrate with Audible or Google Books API to automatically fetch audio durations
2. **Reading Speed Customization**: Allow users to customize their reading speed
3. **Reading Statistics**: Track reading progress over time, books per month, etc.
4. **Export Statistics**: Generate reports of reading habits

## Notes

- Existing books without page count or audio duration will use the default estimate (5 hours)
- You can update existing books in Supabase to add these fields retroactively
- The calculation happens server-side for consistency and performance
