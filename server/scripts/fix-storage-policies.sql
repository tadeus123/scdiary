-- Fix storage policies for book-covers bucket
-- Run this in Supabase SQL Editor

-- First, drop any existing policies
DROP POLICY IF EXISTS "Public can view book covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload book covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete book covers" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload book covers" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete book covers" ON storage.objects;

-- Create new policies that allow public access
-- Allow anyone to view
CREATE POLICY "Public can view book covers" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'book-covers');

-- Allow anyone to insert (upload)
CREATE POLICY "Anyone can upload book covers" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'book-covers');

-- Allow anyone to delete
CREATE POLICY "Anyone can delete book covers" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'book-covers');
