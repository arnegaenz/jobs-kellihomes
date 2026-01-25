-- Migration: Remove Status and Health fields from jobs
-- Date: 2026-01-25
-- Description: Removes redundant status and health columns (Stage already tracks workflow)

-- Step 1: Remove status and health columns
ALTER TABLE jobs
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS health;

-- Verification Query (run after migration to check)
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'jobs'
-- ORDER BY ordinal_position;
