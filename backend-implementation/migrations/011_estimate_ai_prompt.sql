-- Migration 011: persist the last AI prompt + verbose flag on the estimate
--
-- Users often iterate on carefully-worded prompts. Losing them on refresh
-- is friction. Store the most recent prompt and verbose setting on the job
-- so the AI modal re-opens pre-populated.

BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS estimate_ai_prompt TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimate_ai_verbose BOOLEAN DEFAULT FALSE;

COMMIT;
