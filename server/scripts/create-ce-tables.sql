-- Company Education categories
CREATE TABLE IF NOT EXISTS ce_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Company Education videos
CREATE TABLE IF NOT EXISTS ce_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_url TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES ce_categories(id) ON DELETE CASCADE,
  custom_title TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_categories_name_lower ON ce_categories (lower(trim(name)));
CREATE INDEX IF NOT EXISTS idx_ce_categories_sort_order ON ce_categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_ce_videos_category_id ON ce_videos(category_id);
CREATE INDEX IF NOT EXISTS idx_ce_videos_created_at ON ce_videos(created_at ASC);

ALTER TABLE ce_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ce_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view ce categories" ON ce_categories
  FOR SELECT USING (true);

CREATE POLICY "Public can manage ce categories" ON ce_categories
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public can view ce videos" ON ce_videos
  FOR SELECT USING (true);

CREATE POLICY "Public can manage ce videos" ON ce_videos
  FOR ALL USING (true) WITH CHECK (true);
