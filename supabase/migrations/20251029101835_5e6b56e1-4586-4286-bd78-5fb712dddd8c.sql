-- Add missing columns to strategy_backtest_results table
ALTER TABLE strategy_backtest_results 
ADD COLUMN IF NOT EXISTS trades jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS confidence_avg numeric,
ADD COLUMN IF NOT EXISTS adx_avg numeric,
ADD COLUMN IF NOT EXISTS momentum_avg numeric,
ADD COLUMN IF NOT EXISTS session_strength_avg numeric;

-- Add comment explaining the trades structure
COMMENT ON COLUMN strategy_backtest_results.trades IS 'Array of trade objects with entry/exit prices, profit, and metadata';