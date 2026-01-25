-- Migration: Document Line Item Actual Dates Support
-- Date: 2026-01-25
-- Description: Documents actualEndDate support in line_items.schedule JSONB column

-- No schema changes needed - schedule is already JSONB, so it can flexibly
-- store the new actualEndDate field without a migration.

-- Update documentation to reflect new structure
COMMENT ON COLUMN line_items.schedule IS 'JSON object: {startDate, endDate, actualEndDate}';

-- Example schedule object structure:
-- {
--   "startDate": "2026-01-15",
--   "endDate": "2026-02-28",
--   "actualEndDate": "2026-03-02"
-- }

-- Verification Query (run to check existing data)
-- SELECT
--   code,
--   name,
--   schedule,
--   status
-- FROM line_items
-- WHERE schedule IS NOT NULL
-- LIMIT 10;
