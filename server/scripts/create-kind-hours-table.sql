-- Hours spent on kind: cumulative timeline at /kind
-- Safe to re-run. Does not modify any existing diary tables.

CREATE TABLE IF NOT EXISTS public.kind_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hours NUMERIC NOT NULL CHECK (hours > 0),
  date_logged DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kind_hours_date_logged
  ON public.kind_hours (date_logged ASC);

ALTER TABLE public.kind_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view kind hours" ON public.kind_hours;
DROP POLICY IF EXISTS "Public can manage kind hours" ON public.kind_hours;

CREATE POLICY "Public can view kind hours"
  ON public.kind_hours
  FOR SELECT
  USING (true);

-- Matches existing diary tables (admin writes via anon key)
CREATE POLICY "Public can manage kind hours"
  ON public.kind_hours
  FOR ALL
  USING (true)
  WITH CHECK (true);
