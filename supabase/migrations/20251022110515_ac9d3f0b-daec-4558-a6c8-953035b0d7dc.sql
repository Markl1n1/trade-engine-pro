-- Add balance_history column to strategy_backtest_results for equity curve visualization
ALTER TABLE strategy_backtest_results 
ADD COLUMN IF NOT EXISTS balance_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN strategy_backtest_results.balance_history 
IS 'Time-series balance data for equity curve visualization. Format: [{time: timestamp, balance: number}]';