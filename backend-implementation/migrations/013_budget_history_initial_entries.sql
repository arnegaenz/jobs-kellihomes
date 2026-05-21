-- Migration: Backfill initial budget entries into budget_history
-- Date: 2026-05-21
-- Description: For every line item with a budget > 0 and empty history,
--              prepend an entry of type='initial' so the History column
--              always shows where the budget started. The budget value
--              itself is untouched; no dollars move.

UPDATE line_items
SET budget_history = jsonb_build_array(jsonb_build_object(
  'amount', budget,
  'type', 'initial',
  'date', to_char(NOW(), 'YYYY-MM-DD'),
  'reason', 'Initial budget'
))
WHERE (budget_history IS NULL OR budget_history = '[]'::jsonb)
  AND budget IS NOT NULL
  AND budget > 0;

-- Verification (run after):
--   SELECT job_id, code, budget, budget_history
--   FROM line_items
--   WHERE budget > 0
--   LIMIT 10;
