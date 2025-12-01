-- Optimize ATH Guard and 4H Reentry strategies for 50%+ win rate
-- ATH Guard: Increase SL/TP for volatility, widen parameters
UPDATE strategies 
SET 
  stop_loss_percent = 3.5,     -- Increased from 2.5% for 1m volatility
  take_profit_percent = 7.0,   -- 2:1 R:R ratio
  adx_threshold = 15,          -- Lowered from 20 (less restrictive)
  max_position_time = 120      -- 2 hours max position time
WHERE strategy_type = 'ath_guard_scalping';

-- 4H Reentry: Relax filters for more entries
UPDATE strategies 
SET 
  stop_loss_percent = 3.0,     -- Increased from 2.5%
  take_profit_percent = 6.0,   -- 2:1 R:R ratio
  adx_threshold = 12,          -- Lowered from 18 (less restrictive)
  rsi_oversold = 15,           -- Widened from 20
  rsi_overbought = 85,         -- Widened from 80
  momentum_threshold = 5,      -- Lowered from 8
  volume_multiplier = 1.0      -- Lowered from 1.1 (any volume OK)
WHERE strategy_type = '4h_reentry';

-- Also update default values for new strategies
ALTER TABLE strategies ALTER COLUMN adx_threshold SET DEFAULT 15;