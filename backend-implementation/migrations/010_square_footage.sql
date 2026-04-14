-- Migration 010: square footage on jobs
--
-- Used to compute cost/sqft and bid/sqft metrics in the Estimating tab.
-- "Closing" a job is handled via the existing stage='Closed' value — no
-- new soft-delete column needed.

BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS square_footage NUMERIC(10,2);

COMMIT;
