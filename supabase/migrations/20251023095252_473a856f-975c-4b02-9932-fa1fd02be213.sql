-- Fix duplicate strategy_live_states records
-- Remove duplicate records keeping only the latest one for each strategy_id

WITH duplicates AS (
  SELECT 
    strategy_id,
    MAX(created_at) as latest_created_at
  FROM strategy_live_states
  GROUP BY strategy_id
  HAVING COUNT(*) > 1
),
records_to_delete AS (
  SELECT sls.id
  FROM strategy_live_states sls
  JOIN duplicates d ON sls.strategy_id = d.strategy_id
  WHERE sls.created_at < d.latest_created_at
)
DELETE FROM strategy_live_states 
WHERE id IN (SELECT id FROM records_to_delete);

-- Add comment
COMMENT ON TABLE strategy_live_states IS 'Live strategy states - one record per strategy, fixed duplicate key issues';