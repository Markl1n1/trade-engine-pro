-- Add missing backtest metrics columns
ALTER TABLE strategy_backtest_results 
ADD COLUMN IF NOT EXISTS profit_factor numeric,
ADD COLUMN IF NOT EXISTS avg_win numeric,
ADD COLUMN IF NOT EXISTS avg_loss numeric;

COMMENT ON COLUMN strategy_backtest_results.profit_factor 
IS 'Profit Factor: (Total Wins / Total Losses). Values > 1 indicate profitability';

COMMENT ON COLUMN strategy_backtest_results.avg_win 
IS 'Average profit per winning trade';

COMMENT ON COLUMN strategy_backtest_results.avg_loss 
IS 'Average loss per losing trade (absolute value)';