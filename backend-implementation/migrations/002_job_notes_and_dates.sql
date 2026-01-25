-- Migration: Add Job Notes and Actual Completion Date
-- Date: 2026-01-25
-- Description: Adds overall job notes and actual completion tracking

-- Step 1: Add new columns with defaults
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS actual_completion DATE;

-- Step 2: Add comment documentation
COMMENT ON COLUMN jobs.notes IS 'Overall job notes (separate from line item notes)';
COMMENT ON COLUMN jobs.actual_completion IS 'Actual completion date (vs target_completion)';

-- Verification Query (run after migration to check)
-- SELECT
--   id,
--   name,
--   notes,
--   target_completion,
--   actual_completion
-- FROM jobs
-- LIMIT 5;
