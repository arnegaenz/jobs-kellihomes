-- Migration: Enhanced Job Costing for Line Items
-- Date: 2026-01-25
-- Description: Adds budget tracking, schedule, and notes to line items

-- Step 1: Add new columns with defaults
ALTER TABLE line_items
  ADD COLUMN IF NOT EXISTS budget_history JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes_text TEXT DEFAULT '';

-- Step 2: Convert budget and actual from TEXT to NUMERIC
-- This will convert valid numbers and set invalid/empty values to NULL
ALTER TABLE line_items
  ALTER COLUMN budget TYPE NUMERIC(10,2) USING
    CASE
      WHEN budget ~ '^[0-9]+\.?[0-9]*$' THEN budget::numeric
      ELSE NULL
    END,
  ALTER COLUMN actual TYPE NUMERIC(10,2) USING
    CASE
      WHEN actual ~ '^[0-9]+\.?[0-9]*$' THEN actual::numeric
      ELSE NULL
    END;

-- Step 3: Set default values for NULL numeric fields
UPDATE line_items SET budget = 0 WHERE budget IS NULL;
UPDATE line_items SET actual = 0 WHERE actual IS NULL;

-- Step 4: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_line_items_job_id ON line_items(job_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code ON line_items(code);

-- Step 5: Add comment documentation
COMMENT ON COLUMN line_items.budget IS 'Current total budget (original + increases)';
COMMENT ON COLUMN line_items.actual IS 'Actual costs incurred';
COMMENT ON COLUMN line_items.budget_history IS 'JSON array of budget increases: [{amount, date, reason}]';
COMMENT ON COLUMN line_items.schedule IS 'JSON object with startDate and endDate';
COMMENT ON COLUMN line_items.notes_text IS 'Editable notes for this line item';

-- Verification Query (run after migration to check)
-- SELECT
--   job_id,
--   code,
--   name,
--   budget,
--   actual,
--   budget_history,
--   schedule,
--   notes_text
-- FROM line_items
-- LIMIT 5;
