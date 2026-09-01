-- People intro graph for /graph — run once. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.people_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  name_zh TEXT NOT NULL DEFAULT '',
  description_zh TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.people_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id UUID NOT NULL REFERENCES public.people_graph_nodes(id) ON DELETE CASCADE,
  to_id UUID NOT NULL REFERENCES public.people_graph_nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_id, to_id),
  CHECK (from_id <> to_id)
);

CREATE INDEX IF NOT EXISTS idx_people_graph_nodes_created_at
  ON public.people_graph_nodes (created_at ASC);
CREATE INDEX IF NOT EXISTS idx_people_graph_edges_from
  ON public.people_graph_edges (from_id);
CREATE INDEX IF NOT EXISTS idx_people_graph_edges_to
  ON public.people_graph_edges (to_id);

ALTER TABLE public.people_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_graph_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view people graph nodes" ON public.people_graph_nodes;
DROP POLICY IF EXISTS "Public can manage people graph nodes" ON public.people_graph_nodes;
DROP POLICY IF EXISTS "Public can view people graph edges" ON public.people_graph_edges;
DROP POLICY IF EXISTS "Public can manage people graph edges" ON public.people_graph_edges;

CREATE POLICY "Public can view people graph nodes"
  ON public.people_graph_nodes FOR SELECT USING (true);
CREATE POLICY "Public can manage people graph nodes"
  ON public.people_graph_nodes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public can view people graph edges"
  ON public.people_graph_edges FOR SELECT USING (true);
CREATE POLICY "Public can manage people graph edges"
  ON public.people_graph_edges FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('people-photos', 'people-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view people photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload people photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update people photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete people photos" ON storage.objects;

CREATE POLICY "Public can view people photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'people-photos');
CREATE POLICY "Anyone can upload people photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'people-photos');
CREATE POLICY "Anyone can update people photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'people-photos')
  WITH CHECK (bucket_id = 'people-photos');
CREATE POLICY "Anyone can delete people photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'people-photos');
