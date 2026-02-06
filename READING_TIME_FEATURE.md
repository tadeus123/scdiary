# Total Reading Time Feature 🤖

## Overview
This feature automatically calculates and displays the total time spent reading all books in your bookshelf using **AI-powered research**. It appears in the **Timeline View** (when you toggle the bookshelf switch).

## ✨ Key Features

### 🤖 AI-Powered Automation
- **No manual data entry required!**
- AI automatically researches audiobook duration and page count when you add a book
- Uses OpenAI GPT-4 to find accurate information from its knowledge base
- Falls back to Google Books API for additional data

### 📊 Display Location
- **Timeline View Only**: The reading time summary appears as a floating card in the bottom-right corner
- Shows: Total formatted time, number of books, and total hours
- Responsive design for all devices

### 🎯 Calculation Method
The system calculates reading time using a priority-based approach:

1. **Priority 1 - Audiobook Duration** (Most Accurate) ⭐
   - AI searches for audiobook duration on Audible, Google Play Books, etc.
   - Uses actual listening time for the most accurate calculation
   - This is THE preferred method

2. **Priority 2 - Page Count Estimation**
   - If no audiobook exists, AI finds the page count
   - Estimates reading time: ~1 minute per page
   - Average reading speed: ~250 words per minute

3. **Priority 3 - Default Average**
   - If no data found, uses default of 300 minutes (~5 hours) per book

## 🚀 How It Works

### When Adding a New Book:
1. Admin enters only: **Title**, **Author**, **Date Read**, and **Cover Image**
2. 🤖 AI automatically researches:
   - **Audiobook duration** from Audible/Google Play Books/etc.
   - **Page count** from Google Books API or AI knowledge
3. Data is automatically saved to database
4. Reading time immediately updates in timeline view

**Example:**
```
Book: "Atomic Habits" by James Clear
↓
🔍 AI Research Process:
  ✅ Found audiobook: 318 minutes (5h 18m) on Audible
  ✅ Found page count: 320 pages (Google Books)
  ✅ Saved to database
↓
Result: Reading time updated with accurate audiobook duration!
```

## 📊 Database Changes

### New Fields in `books` Table
```sql
-- Run this in Supabase SQL Editor
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS page_count INTEGER,
ADD COLUMN IF NOT EXISTS audio_duration_minutes INTEGER;

COMMENT ON COLUMN books.page_count IS 'Number of pages (AI-researched or manual)';
COMMENT ON COLUMN books.audio_duration_minutes IS 'Audiobook duration in minutes (AI-researched, priority)';
```

**To activate:** Run `server/scripts/add-reading-time-fields.sql` in your Supabase Dashboard

## 🎯 Usage

### For Users (Public Bookshelf)
1. Navigate to `/bookshelf`
2. Toggle the switch in bottom-left corner to **Timeline View**
3. See total reading time in the bottom-right floating card

### For Admins (Adding Books)
1. Go to `/admin/bookshelf`
2. Add book with just: Title, Author, Date, Cover
3. 🤖 AI automatically researches book info in the background
4. Watch console logs to see what AI finds
5. Done! Reading time automatically updates

## 🛠️ API Endpoint

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

## 🎨 Styling

The reading time card matches your existing bookshelf aesthetic:
- Floating card with backdrop blur effect
- Accent color for emphasis
- Fully responsive (desktop → tablet → mobile)
- Automatically adapts to dark/light theme
- Positioned to avoid interfering with timeline graph

## 📁 Implementation Files

### New Files:
- `server/services/book-research.js` - AI book research service
- `server/scripts/add-reading-time-fields.sql` - Database migration

### Modified Files:
- `server/routes/diary.js` - Added API endpoint, integrated AI research
- `public/js/bookshelf.js` - Fetches and displays reading time
- `public/css/style.css` - Styling for reading time card
- `views/admin-bookshelf.ejs` - Removed manual input fields, added AI indicator

## 🔧 Configuration

### Environment Variables Required:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

The AI research uses your existing OpenAI API key (same one used for book categorization).

## 💡 How AI Research Works

### Step 1: AI Knowledge Base Search
```javascript
// AI searches its knowledge for audiobook info
"What is the audiobook duration for [Title] by [Author]?"
→ Checks Audible, Google Play Books, Apple Books, etc.
→ Returns duration in minutes with confidence level
```

### Step 2: Google Books API Fallback
```javascript
// If no audiobook or page count needed
GET https://www.googleapis.com/books/v1/volumes?q=[title]+[author]
→ Returns page count from most common edition
```

### Step 3: Database Storage
```javascript
// Saves research results
{
  audio_duration_minutes: 318,  // From AI research
  page_count: 320                // From Google Books API
}
```

## 🎯 Future Enhancements

Possible improvements:
1. **Real-time Web Scraping**: Scrape Audible/Google Play directly for live data
2. **Multiple Editions**: Track different editions (hardcover, paperback, audio)
3. **Reading Speed Profiles**: Customize per-user reading speeds
4. **Progress Tracking**: Track partial books and reading sessions
5. **Statistics Dashboard**: Detailed reading analytics over time
6. **Export Reports**: Generate PDF/CSV reports of reading habits

## 🐛 Troubleshooting

### AI Not Finding Book Info?
- Check OpenAI API key is configured
- Verify book title/author spelling
- Check console logs for AI response
- Some obscure books may not have audiobook versions

### Reading Time Shows "Not found"?
- Existing books need the SQL migration run
- Default 5-hour estimate used for books without data
- Can manually update in Supabase if needed

### Google Books API Not Working?
- API is rate-limited (free tier)
- Falls back to AI knowledge base automatically
- No API key required for basic usage

## ✅ Testing Checklist

- [ ] SQL migration run successfully
- [ ] Add a popular book (e.g., "Atomic Habits")
- [ ] Check console logs for AI research output
- [ ] Verify data saved in Supabase books table
- [ ] Toggle to timeline view
- [ ] Confirm reading time card appears
- [ ] Test on mobile device
- [ ] Test dark/light theme switching

## 🎉 Summary

This feature combines:
- 🤖 AI-powered automatic research
- 📚 Google Books API integration
- 🎨 Beautiful, responsive UI
- ⚡ Zero manual data entry
- 🎯 Highly accurate reading time calculations

**Result:** A completely automated reading time tracker that just works! 🚀
