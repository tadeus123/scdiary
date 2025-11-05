# Supabase Setup Guide

## Step 1: Create Supabase Project

1. Go to **https://supabase.com** and sign up/login
2. Click **"New Project"**
3. Fill in:
   - **Name**: `scdiary` (or your choice)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free tier is fine
4. Click **"Create new project"**
5. Wait 2-3 minutes for setup to complete

## Step 2: Get Your Credentials

Once your project is ready:

1. Go to **Project Settings** (gear icon)
2. Click **"API"** in the sidebar
3. Copy these values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## Step 3: Create Database Table

In Supabase dashboard:

1. Click **"SQL Editor"** in the sidebar
2. Click **"New query"**
3. Paste this SQL and run it:

```sql
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp DESC);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON entries
  FOR SELECT USING (true);

-- Allow authenticated insert/update/delete (we'll control this via server)
CREATE POLICY "Allow authenticated modifications" ON entries
  FOR ALL USING (true);
```

4. Click **"Run"** to execute

## Step 4: Add Environment Variables to Vercel

In your Vercel project settings:

1. Go to **Settings → Environment Variables**
2. Add these:
   - `SUPABASE_URL` = Your Project URL
   - `SUPABASE_ANON_KEY` = Your anon/public key

3. **Redeploy** your project after adding variables

## That's it! 

Once you provide the credentials, I'll update the code to use Supabase instead of file storage.

---

**Need help?** Share your Supabase Project URL and anon key, and I'll complete the setup!

