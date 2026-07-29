-- Selfie wall for /corner: one optional image per year of life (1–100)
-- Safe to re-run. Does not modify any existing diary tables.

CREATE TABLE IF NOT EXISTS public.corner_selfies (
  year INTEGER PRIMARY KEY,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corner_selfies_year_range CHECK (year >= 1 AND year <= 100)
);

CREATE INDEX IF NOT EXISTS idx_corner_selfies_updated_at
  ON public.corner_selfies (updated_at DESC);

ALTER TABLE public.corner_selfies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view corner selfies" ON public.corner_selfies;
DROP POLICY IF EXISTS "Public can manage corner selfies" ON public.corner_selfies;

CREATE POLICY "Public can view corner selfies"
  ON public.corner_selfies
  FOR SELECT
  USING (true);

-- Matches existing diary tables (admin writes via anon key)
CREATE POLICY "Public can manage corner selfies"
  ON public.corner_selfies
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Public storage bucket for selfie uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('corner-selfies', 'corner-selfies', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view corner selfies files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload corner selfies" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update corner selfies" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete corner selfies" ON storage.objects;

CREATE POLICY "Public can view corner selfies files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'corner-selfies');

CREATE POLICY "Anyone can upload corner selfies"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'corner-selfies');

CREATE POLICY "Anyone can update corner selfies"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'corner-selfies')
  WITH CHECK (bucket_id = 'corner-selfies');

CREATE POLICY "Anyone can delete corner selfies"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'corner-selfies');
