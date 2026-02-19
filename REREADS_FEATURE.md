# Re-reads Feature

Track when you read a book multiple times. Each re-read appears on the timeline graph and adds to total reading time.

## Setup

1. **Run the migration** in Supabase SQL Editor:
   - Open `server/scripts/create-book-rereads-table.sql`
   - Copy the SQL and run it in Supabase Dashboard → SQL Editor

2. That's it! The feature is ready.

## How to use

1. Go to **Admin → Bookshelf**
2. Make sure Connection Mode and Delete Mode are **OFF**
3. Click a book in the network
4. The book detail panel opens with all read dates
5. Pick a date and click **"I read it again"** to add a re-read

## What changes

- **Public bookshelf** (click book): Shows all read dates stacked (Read: Aug 27, 2025 / Read: Jan 15, 2026 / …)
- **Timeline graph**: Re-reads appear as additional points; cumulative count includes all reads
- **Total reading time**: Each re-read adds the book’s duration again
