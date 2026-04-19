-- Migration 012: Multiple estimates per job
--
-- Introduces an `estimates` parent container so a single job can hold many
-- bids (drafts, sent-to-client, accepted, declined, archived). This is the
-- structural half of the change; a later migration (013) will drop the
-- now-deprecated `jobs.estimate_*` columns and the `job_id` columns on
-- `estimate_line_items` / `estimate_revisions` once the backend + frontend
-- are fully migrated to read/write via `estimate_id`.
--
-- Safety properties:
--   * Wrapped in a single transaction — schema + backfill commit atomically.
--   * Additive only. No columns or rows are dropped or mutated in place.
--   * `estimate_line_items` and `estimate_revisions` keep their `job_id`
--     columns so the existing backend code continues to work unchanged.
--   * `jobs.estimate_*` columns are preserved for the same reason.
--   * Backfill row count expectation (based on 2026-04-19 prod audit):
--       estimates:            1 new row (Mochan/Scheidegger Outdoor Living)
--       estimate_line_items:  1 row updated (estimate_id populated)
--       estimate_revisions:   0 rows (table is empty in prod)

BEGIN;

-- ─── Estimates container table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimates (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL DEFAULT 'Estimate',
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','accepted','declined','archived')),
  description     TEXT DEFAULT '',
  markup_mode     TEXT DEFAULT 'fixed',
  markup_percent  NUMERIC(5,2) DEFAULT 30,
  prepared_by     TEXT,
  ai_prompt       TEXT DEFAULT '',
  ai_verbose      BOOLEAN DEFAULT FALSE,
  current_version INT DEFAULT 0,
  sent_at         TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  accepted_total  NUMERIC(12,2),
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_estimates_job_id ON estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);

-- ─── Add nullable estimate_id to existing child tables ─────────────────────
ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS estimate_id TEXT REFERENCES estimates(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate_id
  ON estimate_line_items(estimate_id);

ALTER TABLE estimate_revisions
  ADD COLUMN IF NOT EXISTS estimate_id TEXT REFERENCES estimates(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_estimate_revisions_estimate_id
  ON estimate_revisions(estimate_id);

-- ─── Jobs: pointer to the currently-active accepted estimate (nullable) ────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS active_estimate_id TEXT REFERENCES estimates(id);

-- ─── Backfill: one `estimates` row per job that has existing estimate data ─
INSERT INTO estimates (
  id, job_id, label, status, description, markup_mode, markup_percent,
  prepared_by, ai_prompt, ai_verbose, current_version
)
SELECT
  'est-' || substring(md5(j.id || random()::text || clock_timestamp()::text) FROM 1 FOR 16),
  j.id,
  'Estimate',
  CASE WHEN COALESCE(j.estimate_current_version, 0) > 0 THEN 'accepted' ELSE 'draft' END,
  COALESCE(j.estimate_description, ''),
  COALESCE(j.estimate_markup_mode, 'fixed'),
  COALESCE(j.estimate_markup_percent, 30),
  j.estimate_prepared_by,
  COALESCE(j.estimate_ai_prompt, ''),
  COALESCE(j.estimate_ai_verbose, FALSE),
  COALESCE(j.estimate_current_version, 0)
FROM jobs j
WHERE EXISTS (SELECT 1 FROM estimate_line_items eli WHERE eli.job_id = j.id)
   OR EXISTS (SELECT 1 FROM estimate_revisions er WHERE er.job_id = j.id)
   OR COALESCE(j.estimate_current_version, 0) > 0
   OR COALESCE(j.estimate_description, '') <> '';

-- Wire existing line items to their new parent estimates row
UPDATE estimate_line_items eli
SET estimate_id = e.id
FROM estimates e
WHERE e.job_id = eli.job_id
  AND eli.estimate_id IS NULL;

-- Wire existing revisions (zero rows today, but future-proof)
UPDATE estimate_revisions er
SET estimate_id = e.id
FROM estimates e
WHERE e.job_id = er.job_id
  AND er.estimate_id IS NULL;

-- For any job where the backfilled estimate landed as 'accepted',
-- set jobs.active_estimate_id so the current in-effect estimate is known.
UPDATE jobs j
SET active_estimate_id = e.id
FROM estimates e
WHERE e.job_id = j.id
  AND e.status = 'accepted'
  AND j.active_estimate_id IS NULL;

COMMIT;
