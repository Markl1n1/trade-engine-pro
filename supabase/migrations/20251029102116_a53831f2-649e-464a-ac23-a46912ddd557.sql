-- Make backtest result columns nullable with defaults for zero-trade scenarios
ALTER TABLE strategy_backtest_results 
ALTER COLUMN winning_trades SET DEFAULT 0,
ALTER COLUMN winning_trades DROP NOT NULL,
ALTER COLUMN losing_trades SET DEFAULT 0,
ALTER COLUMN losing_trades DROP NOT NULL,
ALTER COLUMN total_trades SET DEFAULT 0,
ALTER COLUMN total_trades DROP NOT NULL,
ALTER COLUMN win_rate SET DEFAULT 0,
ALTER COLUMN win_rate DROP NOT NULL,
ALTER COLUMN max_drawdown SET DEFAULT 0,
ALTER COLUMN max_drawdown DROP NOT NULL,
ALTER COLUMN total_return SET DEFAULT 0,
ALTER COLUMN total_return DROP NOT NULL;

-- Update existing NULL values to 0
UPDATE strategy_backtest_results 
SET 
  winning_trades = COALESCE(winning_trades, 0),
  losing_trades = COALESCE(losing_trades, 0),
  total_trades = COALESCE(total_trades, 0),
  win_rate = COALESCE(win_rate, 0),
  max_drawdown = COALESCE(max_drawdown, 0),
  total_return = COALESCE(total_return, 0)
WHERE winning_trades IS NULL 
   OR losing_trades IS NULL 
   OR total_trades IS NULL 
   OR win_rate IS NULL 
   OR max_drawdown IS NULL 
   OR total_return IS NULL;