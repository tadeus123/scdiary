-- Add manual sort order for Company Education videos within each category
ALTER TABLE ce_videos ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY category_id
      ORDER BY created_at ASC
    ) - 1 AS ord
  FROM ce_videos
)
UPDATE ce_videos v
SET sort_order = o.ord
FROM ordered o
WHERE v.id = o.id;

CREATE INDEX IF NOT EXISTS idx_ce_videos_category_sort_order ON ce_videos(category_id, sort_order);
