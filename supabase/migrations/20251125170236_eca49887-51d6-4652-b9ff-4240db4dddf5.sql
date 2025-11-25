-- Phase 1: Critical Parameter Fixes for Improved Win Rate

-- 1. Increase Stop Loss and Take Profit for all strategies
UPDATE strategies SET 
  stop_loss_percent = 2.5,
  take_profit_percent = 5.0
WHERE strategy_type IN ('ath_guard_scalping', 'fvg_scalping', '4h_reentry');

UPDATE strategies SET 
  stop_loss_percent = 2.0,
  take_profit_percent = 4.0
WHERE strategy_type IN ('sma_crossover', 'ema_crossover_scalping');

-- 2. Relax ATH Guard filters for more signals
UPDATE strategies SET 
  adx_threshold = 20,                    -- Reduced from 30
  ath_guard_volume_multiplier = 1.5,     -- Reduced from 2.0
  max_position_time = 60                 -- Increased from 30
WHERE strategy_type = 'ath_guard_scalping';

-- 3. Relax SMA Crossover filters
UPDATE strategies SET
  volume_multiplier = 0.9,               -- Reduced from 1.3
  min_trend_strength = 0.5              -- Reduced from 0.6
WHERE strategy_type = 'sma_crossover';

-- 4. Relax EMA Crossover filters
UPDATE strategies SET
  volume_multiplier = 1.0                -- Reduced from 1.2
WHERE strategy_type = 'ema_crossover_scalping';