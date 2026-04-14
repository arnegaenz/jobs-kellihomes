-- Migration 009: Estimating workflow + bid/revision tracking
--
-- Introduces a separate Estimating layer that lives alongside line_items/job-costing.
-- Users build up an estimate (description + line items + markup) in the Estimating tab,
-- then "Publish" to lock a revision and seed the budget in line_items.
-- Re-publishing shows a diff and creates a new revision.

BEGIN;

-- ─── Jobs: estimate draft state ────────────────────────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS estimate_description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimate_markup_mode TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS estimate_markup_percent NUMERIC(5,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS estimate_prepared_by TEXT,
  ADD COLUMN IF NOT EXISTS estimate_current_version INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_value NUMERIC(12,2);

-- ─── Estimate line items (working draft) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_line_items (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  code          TEXT,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  cost          NUMERIC(12,2) DEFAULT 0,
  group_code    TEXT,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_job_id ON estimate_line_items(job_id);

-- ─── Estimate revisions (frozen snapshots at publish time) ─────────────────
CREATE TABLE IF NOT EXISTS estimate_revisions (
  id                     TEXT PRIMARY KEY,
  job_id                 TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version                INT NOT NULL,
  published_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by           TEXT NOT NULL,
  prepared_by            TEXT,
  description_snapshot   TEXT DEFAULT '',
  markup_mode_snapshot   TEXT,
  markup_percent_snapshot NUMERIC(5,2),
  total_cost_snapshot    NUMERIC(12,2) DEFAULT 0,
  total_bid_snapshot     NUMERIC(12,2) DEFAULT 0,
  UNIQUE (job_id, version)
);
CREATE INDEX IF NOT EXISTS idx_estimate_revisions_job_id ON estimate_revisions(job_id);

-- ─── Estimate revision line items (frozen per-revision) ────────────────────
CREATE TABLE IF NOT EXISTS estimate_revision_items (
  id            TEXT PRIMARY KEY,
  revision_id   TEXT NOT NULL REFERENCES estimate_revisions(id) ON DELETE CASCADE,
  code          TEXT,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  cost          NUMERIC(12,2) DEFAULT 0,
  group_code    TEXT,
  sort_order    INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_estimate_revision_items_rev_id ON estimate_revision_items(revision_id);

COMMIT;
