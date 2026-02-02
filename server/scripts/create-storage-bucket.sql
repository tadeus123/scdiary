-- Create storage bucket for book covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for public access
CREATE POLICY "Public can view book covers" ON storage.objects
  FOR SELECT USING (bucket_id = 'book-covers');

CREATE POLICY "Authenticated can upload book covers" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'book-covers');

CREATE POLICY "Authenticated can delete book covers" ON storage.objects
  FOR DELETE USING (bucket_id = 'book-covers');
