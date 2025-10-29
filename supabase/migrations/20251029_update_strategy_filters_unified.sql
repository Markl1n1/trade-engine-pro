-- Update strategy filters to unified configuration
-- This migration adds missing filter fields and updates all strategy configurations
-- to ensure consistency between backtest and real-time monitoring

-- Part 1: Add missing filter fields to strategies table
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS adx_threshold numeric DEFAULT 22,
ADD COLUMN IF NOT EXISTS bollinger_period integer DEFAULT 20,
ADD COLUMN IF NOT EXISTS bollinger_std numeric DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS min_trend_strength numeric DEFAULT 0.3,
ADD COLUMN IF NOT EXISTS trailing_stop_percent numeric DEFAULT 0.75,
ADD COLUMN IF NOT EXISTS max_position_time integer DEFAULT 480,
ADD COLUMN IF NOT EXISTS momentum_threshold numeric DEFAULT 12,
ADD COLUMN IF NOT EXISTS support_resistance_lookback integer DEFAULT 20,
ADD COLUMN IF NOT EXISTS min_volume_spike numeric DEFAULT 1.1,
ADD COLUMN IF NOT EXISTS min_profit_percent numeric DEFAULT 0.2;

-- Add helpful comments for new columns
COMMENT ON COLUMN strategies.adx_threshold IS 'ADX threshold for trend strength validation';
COMMENT ON COLUMN strategies.bollinger_period IS 'Bollinger Bands period for volatility analysis';
COMMENT ON COLUMN strategies.bollinger_std IS 'Bollinger Bands standard deviation multiplier';
COMMENT ON COLUMN strategies.min_trend_strength IS 'Minimum trend strength required for signal validation';
COMMENT ON COLUMN strategies.trailing_stop_percent IS 'Trailing stop percentage for position management';
COMMENT ON COLUMN strategies.max_position_time IS 'Maximum time in position (minutes)';
COMMENT ON COLUMN strategies.momentum_threshold IS 'Momentum threshold for signal validation';
COMMENT ON COLUMN strategies.support_resistance_lookback IS 'Lookback period for support/resistance analysis';
COMMENT ON COLUMN strategies.min_volume_spike IS 'Minimum volume spike multiplier';
COMMENT ON COLUMN strategies.min_profit_percent IS 'Minimum profit percentage for position closure';

-- Part 2: Update strategy configurations according to DeepSeek recommendations

-- 4h Reentry BR (BTC-5m) - bfba21d8-f93f-4be8-af02-826375af645c
UPDATE strategies SET
  mstg_weight_momentum = 0.25,
  mstg_weight_trend = 0.35,
  mstg_weight_volatility = 0.20,
  mstg_weight_relative = 0.20,
  mstg_long_threshold = 30,
  mstg_short_threshold = -30,
  mstg_exit_threshold = 0,
  mstg_extreme_threshold = 60,
  atr_sl_multiplier = 1.5,
  atr_tp_multiplier = 2.0,
  trailing_stop_percent = 0.5,
  max_position_time = 240,
  adx_threshold = 20,
  bollinger_period = 20,
  bollinger_std = 2.0,
  rsi_oversold = 30,
  rsi_overbought = 70,
  momentum_threshold = 10,
  volume_multiplier = 1.2
WHERE id = 'bfba21d8-f93f-4be8-af02-826375af645c';

-- ATH Guard (ETH-1m) - b81dd6d0-ae56-4dbf-9e6a-3a16b4d23b06
UPDATE strategies SET
  ath_guard_ema_slope_threshold = 0.10,
  ath_guard_pullback_tolerance = 0.20,
  ath_guard_volume_multiplier = 1.2,
  ath_guard_stoch_oversold = 25,
  ath_guard_stoch_overbought = 75,
  ath_guard_atr_sl_multiplier = 1.2,
  ath_guard_atr_tp1_multiplier = 0.8,
  ath_guard_atr_tp2_multiplier = 1.5,
  ath_guard_ath_safety_distance = 0.2,
  ath_guard_rsi_threshold = 75,
  trailing_stop_percent = 0.5,
  max_position_time = 60,
  adx_threshold = 20,
  min_volume_spike = 1.2,
  momentum_threshold = 15,
  support_resistance_lookback = 20
WHERE id = 'b81dd6d0-ae56-4dbf-9e6a-3a16b4d23b06';

-- SMA 20/200 RSI (Scalp) - b84615f0-eb01-40f2-97f4-cde9d8a8d84e
UPDATE strategies SET
  sma_fast_period = 20,
  sma_slow_period = 200,
  rsi_period = 14,
  rsi_overbought = 70,
  rsi_oversold = 30,
  volume_multiplier = 1.2,
  atr_sl_multiplier = 2.0,
  atr_tp_multiplier = 3.0,
  mtf_rsi_period = 14,
  mtf_rsi_entry_threshold = 55,
  mtf_macd_fast = 12,
  mtf_macd_slow = 26,
  mtf_macd_signal = 9,
  mtf_volume_multiplier = 1.2,
  trailing_stop_percent = 1.0,
  max_position_time = 240,
  adx_threshold = 20,
  min_trend_strength = 0.4
WHERE id = 'b84615f0-eb01-40f2-97f4-cde9d8a8d84e';

-- SMA 20/200 Cross (DOGE-15m) - 1ef4e3c9-33dd-43bf-a090-ec8df7f64e56
UPDATE strategies SET
  sma_fast_period = 20,
  sma_slow_period = 200,
  rsi_period = 14,
  rsi_overbought = 70,
  rsi_oversold = 30,
  volume_multiplier = 1.2,
  atr_sl_multiplier = 1.5,
  atr_tp_multiplier = 2.5,
  trailing_stop_percent = 1.0,
  max_position_time = 240,
  adx_threshold = 20,
  bollinger_period = 20,
  bollinger_std = 2,
  min_trend_strength = 0.4
WHERE id = '1ef4e3c9-33dd-43bf-a090-ec8df7f64e56';

-- MTF Momentum (Scalp) - 521c9d9d-ea0f-4d0a-854b-2c9a2fa54b93
UPDATE strategies SET
  mtf_rsi_period = 14,
  mtf_rsi_entry_threshold = 50,
  mtf_macd_fast = 8,
  mtf_macd_slow = 21,
  mtf_macd_signal = 5,
  mtf_volume_multiplier = 1.1,
  atr_sl_multiplier = 1.5,
  atr_tp_multiplier = 2.0,
  trailing_stop_percent = 0.5,
  max_position_time = 30,
  min_profit_percent = 0.2
WHERE id = '521c9d9d-ea0f-4d0a-854b-2c9a2fa54b93';

-- FVG (SOL-5m) - 5a3ffb4e-e688-48d5-8f2a-cdee25463096
UPDATE strategies SET
  fvg_key_candle_time = '09:30-09:35',
  fvg_key_timeframe = '5m',
  fvg_analysis_timeframe = '1m',
  fvg_risk_reward_ratio = 2.0,
  fvg_tick_size = 0.005,
  max_position_time = 60
WHERE id = '5a3ffb4e-e688-48d5-8f2a-cdee25463096';

-- Create index for performance on new columns
CREATE INDEX IF NOT EXISTS idx_strategies_adx_threshold ON strategies(adx_threshold);
CREATE INDEX IF NOT EXISTS idx_strategies_trailing_stop ON strategies(trailing_stop_percent);
CREATE INDEX IF NOT EXISTS idx_strategies_max_position_time ON strategies(max_position_time);

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Strategy filters unified successfully. Updated 6 strategies with new filter configurations.';
END $$;
