# Supabase Setup - Quick Instructions

## Step 1: Create the Database Table

1. Go to your Supabase project dashboard
2. Click on **"SQL Editor"** in the left sidebar
3. Click **"New query"** (or the + button)
4. Copy and paste the SQL below into the editor:

```sql
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp DESC);

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON entries;
CREATE POLICY "Allow public read access" ON entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations" ON entries;
CREATE POLICY "Allow all operations" ON entries
  FOR ALL USING (true);
```

5. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)
6. You should see a success message

## Step 2: Migrate Existing Entries (Optional)

If you have existing entries in `server/data/entries.json`, run this after creating the table:

```bash
node server/scripts/setup-supabase.js
```

This will migrate your existing entries to Supabase.

## Step 3: Verify Setup

After creating the table:
1. Your Vercel environment variables are already set ✅
2. Redeploy your Vercel project (or it will auto-deploy on next push)
3. Test creating a new entry on your live site

## That's it! 🎉

Once the table is created, your diary will start using Supabase for storage.

