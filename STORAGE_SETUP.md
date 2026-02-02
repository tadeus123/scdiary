# Supabase Storage Setup for Book Covers

## Quick Setup (Via Dashboard - Easiest)

### Option 1: Use Supabase Dashboard (30 seconds)

1. Go to: https://supabase.com/dashboard/project/mvtrinbmwtpniavdcspk/storage/buckets
2. Click "New bucket"
3. Name: `book-covers`
4. **Check** "Public bucket" ✅
5. Click "Create bucket"

That's it! The bucket is ready.

---

## Option 2: Using SQL (if you prefer)

1. Go to: https://supabase.com/dashboard/project/mvtrinbmwtpniavdcspk/sql/new
2. Paste this SQL:

```sql
-- Create storage bucket for book covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies
CREATE POLICY "Public can view book covers" ON storage.objects
  FOR SELECT USING (bucket_id = 'book-covers');

CREATE POLICY "Authenticated can upload book covers" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'book-covers');

CREATE POLICY "Authenticated can delete book covers" ON storage.objects
  FOR DELETE USING (bucket_id = 'book-covers');
```

3. Click "Run"

---

## What This Does

- Creates a **public** storage bucket called `book-covers`
- Allows anyone to **view** book cover images
- Allows the server to **upload** and **delete** images
- Images get a public URL automatically

---

## After Setup

Once the bucket is created, the bookshelf will work perfectly on Vercel!

Images will be stored at URLs like:
`https://mvtrinbmwtpniavdcspk.supabase.co/storage/v1/object/public/book-covers/book-123456.jpg`
