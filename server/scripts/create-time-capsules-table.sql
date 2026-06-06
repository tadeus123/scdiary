-- Time capsules — run once in Supabase SQL Editor
-- Publishes hidden future diary entries via pg_cron (no app changes on page load).
--
-- Before running:
--   1. Supabase Dashboard → Database → Extensions → enable "pg_cron"
--   2. Run this script
--   3. node server/scripts/seed-time-capsules.js  (requires SUPABASE_SERVICE_ROLE_KEY in .env)

CREATE TABLE IF NOT EXISTS time_capsules (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  html TEXT NOT NULL,
  publish_at TIMESTAMPTZ NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  sealed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_capsules_publish
  ON time_capsules (publish_at)
  WHERE NOT published;

-- No public access — table invisible via PostgREST / anon key
ALTER TABLE time_capsules ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION publish_due_time_capsules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO entries (id, timestamp, content, html)
  SELECT tc.entry_id, tc.publish_at, tc.content, tc.html
  FROM time_capsules tc
  WHERE NOT tc.published
    AND tc.publish_at <= NOW()
  ON CONFLICT (id) DO NOTHING;

  UPDATE time_capsules tc
  SET published = true,
      published_at = NOW()
  WHERE NOT tc.published
    AND tc.publish_at <= NOW();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Hourly at :05 UTC — publishes within ~1h of due time (06 Jun 01:00 Europe/Berlin)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'publish-time-capsules';

    PERFORM cron.schedule(
      'publish-time-capsules',
      '5 * * * *',
      $$SELECT publish_due_time_capsules();$$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled — enable it in Dashboard → Database → Extensions, then re-run the cron.schedule block.';
  END IF;
END;
$$;
