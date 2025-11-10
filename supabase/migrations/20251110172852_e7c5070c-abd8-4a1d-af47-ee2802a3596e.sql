-- Add diagnostics column to store strategy-specific metrics
ALTER TABLE strategy_backtest_results 
ADD COLUMN IF NOT EXISTS diagnostics jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN strategy_backtest_results.diagnostics IS 'Strategy-specific diagnostics: FVG detection rates, retest rates, entry rates, etc.';