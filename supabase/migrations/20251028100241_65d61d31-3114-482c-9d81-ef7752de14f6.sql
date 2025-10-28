-- Soften strategy parameters to generate more trades in backtests
-- This addresses "Zero Trades Executed" errors by reducing entry barriers

-- Update SMA Crossover strategies
UPDATE strategies 
SET 
  volume_multiplier = 1.2,  -- down from 1.3
  atr_sl_multiplier = 1.5,  -- down from 2.0
  atr_tp_multiplier = 2.5   -- down from 3.0
WHERE strategy_type = 'sma_crossover';

-- Update ATH Guard strategies  
UPDATE strategies
SET
  ath_guard_volume_multiplier = 1.2,     -- down from 1.8
  ath_guard_ema_slope_threshold = 0.10,  -- down from 0.15
  ath_guard_pullback_tolerance = 0.20,   -- up from 0.15
  ath_guard_rsi_threshold = 75,          -- up from 70
  ath_guard_atr_sl_multiplier = 1.2,     -- down from 1.5
  ath_guard_atr_tp1_multiplier = 0.8,    -- down from 1.0
  ath_guard_atr_tp2_multiplier = 1.5     -- down from 2.0
WHERE strategy_type = 'ath_guard_scalping';

-- Update MTF Momentum strategies
UPDATE strategies
SET
  mtf_volume_multiplier = 1.1,  -- down from 1.2
  mtf_rsi_entry_threshold = 50  -- down from 55
WHERE strategy_type = 'mtf_momentum';

-- Update FVG strategies parameters
UPDATE strategies
SET
  fvg_risk_reward_ratio = 2.0,  -- down from 3.0
  fvg_tick_size = 0.005         -- down from 0.01
WHERE strategy_type = 'fvg_scalping';

-- Add system setting to track backtest optimization
INSERT INTO system_settings (setting_key, setting_value, updated_by)
VALUES ('backtest_parameters_optimized', 'true', auth.uid())
ON CONFLICT (setting_key) 
DO UPDATE SET 
  setting_value = 'true',
  updated_at = now();

COMMENT ON COLUMN strategies.volume_multiplier IS 'Volume filter multiplier - lower = more trades';
COMMENT ON COLUMN strategies.ath_guard_volume_multiplier IS 'ATH Guard volume multiplier - lower = more trades';
COMMENT ON COLUMN strategies.mtf_volume_multiplier IS 'MTF volume multiplier - lower = more trades';