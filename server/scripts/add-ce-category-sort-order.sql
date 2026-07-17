-- Add manual sort order for Company Education categories
ALTER TABLE ce_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, name ASC) - 1 AS ord
  FROM ce_categories
)
UPDATE ce_categories c
SET sort_order = o.ord
FROM ordered o
WHERE c.id = o.id;

CREATE INDEX IF NOT EXISTS idx_ce_categories_sort_order ON ce_categories(sort_order);
