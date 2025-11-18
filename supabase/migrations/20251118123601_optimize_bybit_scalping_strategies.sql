-- Optimize scalping strategies for Bybit trading
-- This migration updates parameters for scalping strategies (ATH Guard, FVG) to be optimized for Bybit scalping

-- Update ATH Guard scalping strategy (ETH-1m)
-- Optimize for fast scalping: smaller SL/TP, shorter position time, smaller position size
UPDATE strategies
SET 
  -- Risk management - optimized for scalping
  stop_loss_percent = 0.8,           -- Reduced from 1.0% for faster exits
  take_profit_percent = 1.5,         -- Reduced from 2.0% for quick profits
  position_size_percent = 3.0,        -- Reduced from 5.0% for scalping (smaller positions)
  max_position_time = 15,             -- Reduced from 30 minutes for scalping (15 min max)
  
  -- ATR multipliers - optimized for scalping
  atr_sl_multiplier = 1.0,           -- Tighter stop loss (was 1.2)
  ath_guard_atr_tp1_multiplier = 0.6, -- Quick first TP (was 0.8)
  ath_guard_atr_tp2_multiplier = 1.2, -- Second TP (was 1.5)
  
  -- Trailing stop - more aggressive for scalping
  trailing_stop_percent = 0.4,        -- More aggressive trailing (was 0.5)
  
  -- Volume and momentum filters - stricter for scalping
  volume_multiplier = 1.3,           -- Higher volume requirement (was 1.2)
  momentum_threshold = 15,            -- Higher momentum requirement (was 12)
  min_volume_spike = 1.3,            -- Higher volume spike requirement (was 1.2)
  
  updated_at = NOW()
WHERE strategy_type = 'ath_guard_scalping' 
  AND symbol = 'ETHUSDT' 
  AND timeframe = '1m'
  AND status = 'active';

-- Update FVG scalping strategy (SOL-5m)
-- Optimize for scalping with FVG strategy
UPDATE strategies
SET 
  -- Risk management - optimized for scalping
  stop_loss_percent = 1.0,           -- Slightly higher for FVG (was 1.2)
  take_profit_percent = 2.0,          -- Quick profit target (was 2.0, keep)
  position_size_percent = 4.0,        -- Moderate position size for scalping (was 5.0)
  max_position_time = 20,             -- Shorter position time for scalping (was 60)
  
  -- ATR multipliers - optimized for scalping
  atr_sl_multiplier = 1.2,           -- Standard stop loss (was 2.0)
  atr_tp_multiplier = 2.0,           -- Quick take profit (was 3.0)
  
  -- Trailing stop - more aggressive
  trailing_stop_percent = 0.5,        -- Aggressive trailing (was 8.0 - too high)
  
  -- Volume filters - stricter for scalping
  volume_multiplier = 1.5,            -- Higher volume requirement (was 1.2)
  min_volume_spike = 1.4,            -- Higher volume spike (was 1.5, keep similar)
  momentum_threshold = 12,            -- Standard momentum (was 12, keep)
  
  -- FVG specific - optimize for scalping
  fvg_risk_reward_ratio = 2.5,        -- Slightly lower RR for faster exits (was 3.0)
  
  updated_at = NOW()
WHERE strategy_type = 'fvg_scalping' 
  AND symbol = 'SOLUSDT' 
  AND timeframe = '5m'
  AND status = 'active';

-- Update EMA Crossover scalping strategy (ETH-1h) - if used for scalping
-- Note: 1h timeframe is not ideal for scalping, but optimize if needed
UPDATE strategies
SET 
  -- Risk management
  stop_loss_percent = 1.0,           -- Standard for 1h timeframe
  take_profit_percent = 2.0,          -- Standard for 1h timeframe
  position_size_percent = 5.0,        -- Standard position size
  max_position_time = 480,            -- 8 hours for 1h timeframe (standard)
  
  -- ATR multipliers
  atr_sl_multiplier = 1.5,           -- Standard for 1h
  atr_tp_multiplier = 2.0,           -- Standard for 1h
  
  -- Trailing stop
  trailing_stop_percent = 0.75,       -- Standard trailing
  
  updated_at = NOW()
WHERE strategy_type = 'ema_crossover_scalping' 
  AND timeframe = '1h'
  AND status = 'active'
  AND (symbol = 'ETHUSDT' OR symbol LIKE '%USDT');

-- Add comments explaining the optimizations
COMMENT ON COLUMN strategies.stop_loss_percent IS 'Stop loss percentage. For scalping: 0.5-1.0%, for swing: 1.0-2.0%';
COMMENT ON COLUMN strategies.take_profit_percent IS 'Take profit percentage. For scalping: 1.0-2.0%, for swing: 2.0-4.0%';
COMMENT ON COLUMN strategies.max_position_time IS 'Maximum time in position (minutes). For scalping: 5-30 min, for swing: 60-480 min';
COMMENT ON COLUMN strategies.position_size_percent IS 'Position size as percentage of capital. For scalping: 2-5%, for swing: 5-10%';
COMMENT ON COLUMN strategies.trailing_stop_percent IS 'Trailing stop percentage. For scalping: 0.3-0.5%, for swing: 0.5-1.0%';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Optimized scalping strategies for Bybit trading';
  RAISE NOTICE 'Updated ATH Guard (ETH-1m) - optimized for 1m scalping';
  RAISE NOTICE 'Updated FVG (SOL-5m) - optimized for 5m scalping';
  RAISE NOTICE 'All parameters adjusted for faster entries/exits and smaller position sizes';
END $$;

