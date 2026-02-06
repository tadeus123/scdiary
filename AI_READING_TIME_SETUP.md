# 🤖 AI-Powered Reading Time - Setup Guide

## Quick Start (3 Steps)

### Step 1: Run Database Migration
1. Open your **Supabase Dashboard** → SQL Editor
2. Create a new query
3. Copy and paste this SQL:

```sql
-- Add reading time fields to books table
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS page_count INTEGER,
ADD COLUMN IF NOT EXISTS audio_duration_minutes INTEGER;

-- Add comments
COMMENT ON COLUMN books.page_count IS 'Number of pages (AI-researched)';
COMMENT ON COLUMN books.audio_duration_minutes IS 'Audiobook duration in minutes (AI-researched, priority)';
```

4. Click **Run**
5. Should see "Success. No rows returned" ✅

### Step 2: Verify Environment Variables
Make sure your `.env` file has:
```env
OPENAI_API_KEY=your_openai_api_key_here
```
(This is the same key used for book categorization - it should already be there!)

### Step 3: Restart Server
```bash
# Stop current server (Ctrl+C)
npm start
```

## ✅ That's It!

Now when you add a book:
1. Go to `/admin/bookshelf`
2. Add a book (title, author, date, cover)
3. 🤖 AI automatically researches audiobook duration & page count
4. Check console to see what AI finds!
5. Go to `/bookshelf` → Toggle to Timeline View
6. See total reading time in bottom-right corner! 🎉

## 🧪 Test It

Try adding a popular book like:
- **"Atomic Habits"** by James Clear
- **"Sapiens"** by Yuval Noah Harari  
- **"The Lean Startup"** by Eric Ries

Watch the console logs:
```
🔍 AI researching book info for "Atomic Habits" by James Clear...
🤖 AI Response: {"audioDurationMinutes": 318, "pageCount": 320, ...}
📚 Google Books found 320 pages
✅ Research complete:
   - Audio Duration: 318 min
   - Page Count: 320
```

## 🎯 What Changed

### Removed:
- ❌ Manual "Page Count" input field
- ❌ Manual "Audio Duration" input field

### Added:
- ✅ AI-powered automatic research
- ✅ OpenAI integration for audiobook lookup
- ✅ Google Books API fallback for page count
- ✅ Beautiful reading time display in timeline view
- ✅ Automatic calculation and updates

## 📝 Console Output Example

When adding "Atomic Habits":
```
🔍 AI researching book info for "Atomic Habits" by James Clear...
🔍 AI searching for audiobook/book info...
🤖 AI Response: {"audioDurationMinutes":318,"pageCount":320,"confidence":"high","source":"Audible"}
📚 Google Books found 320 pages
✅ Research complete:
   - Audio Duration: 318 min
   - Page Count: 320
   - Confidence: high
   - Source: Audible

🤖 Categorizing "Atomic Habits" by James Clear...
✅ Category: Self-Help
```

## 🎨 UI Preview

**Timeline View** will show:
```
┌─────────────────────────┐
│  TOTAL READING TIME     │
│                         │
│      3 days 4 hours     │
│                         │
│  15 books • 76 hours    │
└─────────────────────────┘
```

Position: Bottom-right corner, floating card, matches your theme!

## 🐛 Troubleshooting

**AI not finding info?**
→ Check OPENAI_API_KEY in `.env`
→ Check console logs for errors
→ Some obscure books may not have audiobooks

**Reading time not showing?**
→ Make sure you're in **Timeline View** (toggle switch)
→ Check browser console for errors
→ Verify SQL migration ran successfully

**Already have books in database?**
→ They'll use default estimate (5 hours) until:
   1. You re-add them (AI will research), OR
   2. You manually update in Supabase

## 📖 Full Documentation

See `READING_TIME_FEATURE.md` for complete technical documentation.

---

**That's it! Enjoy your fully automated AI-powered reading time tracker! 🚀**
