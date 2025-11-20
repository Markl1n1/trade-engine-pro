-- Create Optimized Strategy Copies
-- Based on consensus recommendations from GPT, Grok, and DeepSeek analyses
-- Creates "_optimized" versions of strategies with improved parameters for better win rates

-- ============================================
-- 1. ATH Guard (ETH-1m) Optimized
-- ============================================
INSERT INTO strategies (
  id, user_id, name, description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, status,
  -- ATH Guard specific (optimized)
  ath_guard_ema_slope_threshold, ath_guard_pullback_tolerance,
  ath_guard_volume_multiplier, ath_guard_stoch_oversold, ath_guard_stoch_overbought,
  ath_guard_atr_sl_multiplier, ath_guard_atr_tp1_multiplier, ath_guard_atr_tp2_multiplier,
  ath_guard_ath_safety_distance, ath_guard_rsi_threshold,
  -- General filters
  adx_threshold, bollinger_period, bollinger_std, min_trend_strength,
  trailing_stop_percent, max_position_time, momentum_threshold,
  support_resistance_lookback, min_volume_spike, min_profit_percent,
  general_filter_flags
)
SELECT
  gen_random_uuid(), user_id, name || ' (Optimized)', description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, 'draft',
  -- ATH Guard optimized parameters
  0.18,  -- ema_slope_threshold: 0.25 → 0.18 (catch quality trends)
  0.20,  -- pullback_tolerance: 0.15 → 0.20 (reduce noise)
  2.0,   -- volume_multiplier: keep at 2.0 (consensus split)
  25,    -- stoch_oversold: 20 → 25 (standard level)
  75,    -- stoch_overbought: 80 → 75 (standard level)
  1.2,   -- atr_sl_multiplier: keep existing
  0.8,   -- atr_tp1_multiplier: keep existing
  1.5,   -- atr_tp2_multiplier: keep existing
  0.2,   -- ath_safety_distance: keep existing
  70,    -- rsi_threshold: 65 → 70 (filter weak impulses)
  -- General filters
  30, 20, 2, 0.3, 0.5, 30, 15, 20, 1.8, 0.2,
  '{}'::jsonb
FROM strategies
WHERE id = 'b81dd6d0-ae56-4dbf-9e6a-3a16b4d23b06';

-- ============================================
-- 2. EMA 9/21 (ETH-1h) Optimized
-- ============================================
INSERT INTO strategies (
  id, user_id, name, description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, benchmark_symbol, status,
  -- Add RSI and volume filters
  rsi_period, rsi_overbought, rsi_oversold, volume_multiplier,
  atr_sl_multiplier, atr_tp_multiplier,
  -- General filters
  min_trend_strength, trailing_stop_percent, max_position_time,
  general_filter_flags
)
SELECT
  gen_random_uuid(), user_id, name || ' (Optimized)', description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, benchmark_symbol, 'draft',
  -- Add missing parameters
  14,   -- rsi_period: add
  68,   -- rsi_overbought: add (consensus ~65-70)
  32,   -- rsi_oversold: add (consensus ~30-35)
  1.4,  -- volume_multiplier: add (consensus 1.3-1.5)
  1.8,  -- atr_sl_multiplier: 1.5 → 1.8 (wider SL for 1h)
  2.2,  -- atr_tp_multiplier: 2.0 → 2.2 (better R:R)
  -- General filters
  0.4, 0.5, 30,
  '{"rsi":true,"timeWindow":true,"trend":true,"volume":true}'::jsonb
FROM strategies
WHERE id = '21b19c9e-1c9d-41a3-8b4c-af0104afb887';

-- ============================================
-- 3. 4h Reentry BR (BTC-5m) Optimized
-- ============================================
INSERT INTO strategies (
  id, user_id, name, description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, status,
  -- Optimized RSI and ATR parameters
  rsi_overbought, rsi_oversold, volume_multiplier,
  atr_sl_multiplier, atr_tp_multiplier,
  -- General filters
  adx_threshold, bollinger_period, bollinger_std, min_trend_strength,
  trailing_stop_percent, max_position_time, momentum_threshold,
  support_resistance_lookback, min_volume_spike, min_profit_percent,
  general_filter_flags
)
SELECT
  gen_random_uuid(), user_id, name || ' (Optimized)', description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, 'draft',
  -- Optimized parameters
  70,   -- rsi_overbought: 80 → 70 (realistic threshold)
  28,   -- rsi_oversold: 20 → 28 (realistic threshold)
  1.3,  -- volume_multiplier: 1.1 → 1.3 (better confirmation)
  1.6,  -- atr_sl_multiplier: 1.1 → 1.6 (wider SL)
  2.0,  -- atr_tp_multiplier: 1.5 → 2.0 (better R:R)
  -- General filters
  18, 20, 2.0, 0.3, 0.75, 480, 12, 20, 1.1, 0.2,
  '{}'::jsonb
FROM strategies
WHERE id = 'bfba21d8-f93f-4be8-af02-826375af645c';

-- ============================================
-- 4. 4h Reentry BR (BTC-5m) Alex Text Optimized
-- ============================================
INSERT INTO strategies (
  id, user_id, name, description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, status,
  -- Optimized RSI and ATR parameters
  rsi_overbought, rsi_oversold, volume_multiplier,
  atr_sl_multiplier, atr_tp_multiplier,
  -- General filters
  adx_threshold, bollinger_period, bollinger_std, min_trend_strength,
  trailing_stop_percent, max_position_time, momentum_threshold,
  support_resistance_lookback, min_volume_spike, min_profit_percent,
  general_filter_flags
)
SELECT
  gen_random_uuid(), user_id, name || ' (Optimized)', description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, 'draft',
  -- Optimized parameters (same as base 4h Reentry)
  70,   -- rsi_overbought: 80 → 70
  28,   -- rsi_oversold: 20 → 28
  1.3,  -- volume_multiplier: 1.1 → 1.3
  1.6,  -- atr_sl_multiplier: increase for safety
  2.0,  -- atr_tp_multiplier: more realistic
  -- General filters
  18, 20, 2.0, 0.3, 0.75, 480, 12, 20, 1.1, 0.2,
  '{"rsi":true,"timeWindow":true,"trend":true,"volume":true}'::jsonb
FROM strategies
WHERE id = 'fc82fc97-15ae-4be7-b9dc-671fea44a396';

-- ============================================
-- 5. FVG (SOL-5m) Optimized
-- ============================================
INSERT INTO strategies (
  id, user_id, name, description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, status,
  -- FVG specific (optimized)
  fvg_key_candle_time, fvg_key_timeframe, fvg_analysis_timeframe,
  fvg_risk_reward_ratio, fvg_tick_size,
  -- Add RSI and volume filters
  rsi_period, rsi_overbought, rsi_oversold, volume_multiplier,
  -- General filters
  adx_threshold, bollinger_period, bollinger_std, min_trend_strength,
  trailing_stop_percent, max_position_time, momentum_threshold,
  support_resistance_lookback, min_volume_spike, min_profit_percent,
  general_filter_flags
)
SELECT
  gen_random_uuid(), user_id, name || ' (Optimized)', description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, 'draft',
  -- FVG optimized parameters
  '09:30-09:35', '5m', '1m',
  2.5,   -- fvg_risk_reward_ratio: 3.0 → 2.5 (more achievable)
  0.003, -- fvg_tick_size: keep existing
  -- Add RSI and volume
  14,    -- rsi_period: add
  65,    -- rsi_overbought: add
  35,    -- rsi_oversold: add
  1.4,   -- volume_multiplier: add (consensus 1.3-1.5)
  -- General filters
  20, 20, 2, 0.3,
  2.5,   -- trailing_stop_percent: 8 → 2.5 (appropriate for scalping)
  60, 12, 20, 1.5, 0.2,
  '{}'::jsonb
FROM strategies
WHERE id = '5a3ffb4e-e688-48d5-8f2a-cdee25463096';

-- ============================================
-- 6. MTF Momentum (BTC-5m) Optimized
-- ============================================
INSERT INTO strategies (
  id, user_id, name, description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, status,
  -- MTF specific (optimized)
  mtf_rsi_period, mtf_rsi_entry_threshold, mtf_macd_fast, mtf_macd_slow,
  mtf_macd_signal, mtf_volume_multiplier,
  atr_sl_multiplier, atr_tp_multiplier,
  -- Add ADX filter
  adx_threshold,
  -- General filters
  min_trend_strength, trailing_stop_percent, max_position_time,
  general_filter_flags
)
SELECT
  gen_random_uuid(), user_id, name || ' (Optimized)', description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, 'draft',
  -- MTF optimized parameters
  14,    -- mtf_rsi_period: keep
  52,    -- mtf_rsi_entry_threshold: 45 → 52 (stronger confirmation)
  12,    -- mtf_macd_fast: keep
  26,    -- mtf_macd_slow: keep
  9,     -- mtf_macd_signal: keep
  1.3,   -- mtf_volume_multiplier: 1.0 → 1.3 (require volume spike)
  2,     -- atr_sl_multiplier: keep
  3,     -- atr_tp_multiplier: keep
  -- Add ADX
  22,    -- adx_threshold: add (trend strength filter)
  -- General filters
  0.3, 0.75, 480,
  '{}'::jsonb
FROM strategies
WHERE id = '11abdea4-2c4a-4b27-bc1f-e18bd819eeb4';

-- ============================================
-- 7. MTF Momentum (ETH-5m) Optimized
-- ============================================
INSERT INTO strategies (
  id, user_id, name, description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, benchmark_symbol, status,
  -- MTF specific (optimized)
  mtf_rsi_period, mtf_rsi_entry_threshold, mtf_macd_fast, mtf_macd_slow,
  mtf_macd_signal, mtf_volume_multiplier,
  atr_sl_multiplier, atr_tp_multiplier,
  -- Add ADX filter
  adx_threshold,
  -- General filters
  min_trend_strength, trailing_stop_percent, max_position_time,
  general_filter_flags
)
SELECT
  gen_random_uuid(), user_id, name || ' (Optimized)', description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, benchmark_symbol, 'draft',
  -- MTF optimized parameters (same as BTC version)
  14,    -- mtf_rsi_period: keep
  52,    -- mtf_rsi_entry_threshold: 45 → 52
  12,    -- mtf_macd_fast: keep
  26,    -- mtf_macd_slow: keep
  9,     -- mtf_macd_signal: keep
  1.3,   -- mtf_volume_multiplier: 1.0 → 1.3
  2,     -- atr_sl_multiplier: keep
  3,     -- atr_tp_multiplier: keep
  -- Add ADX
  22,    -- adx_threshold: add
  -- General filters
  0.3, 0.75, 480,
  '{}'::jsonb
FROM strategies
WHERE id = '2ce0343b-0d5b-412f-907a-8a9a5f79d826';

-- ============================================
-- 8. SMA 20/200 Cross (DOGE-15m) Optimized
-- ============================================
INSERT INTO strategies (
  id, user_id, name, description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, benchmark_symbol, status,
  -- SMA specific
  sma_fast_period, sma_slow_period,
  -- Optimized RSI parameters
  rsi_period, rsi_overbought, rsi_oversold,
  -- Optimized volume and ADX
  volume_multiplier, adx_threshold,
  -- General filters
  bollinger_period, bollinger_std, min_trend_strength,
  trailing_stop_percent, max_position_time, momentum_threshold,
  support_resistance_lookback, min_volume_spike, min_profit_percent,
  general_filter_flags
)
SELECT
  gen_random_uuid(), user_id, name || ' (Optimized)', description, symbol, timeframe, initial_capital,
  position_size_percent, stop_loss_percent, take_profit_percent,
  strategy_type, benchmark_symbol, 'draft',
  -- SMA parameters
  20, 200,
  -- Optimized RSI
  14,    -- rsi_period: keep
  72,    -- rsi_overbought: 90 → 72 (realistic threshold)
  28,    -- rsi_oversold: 10 → 28 (realistic threshold)
  -- Optimized volume and ADX
  1.2,   -- volume_multiplier: 0.8 → 1.2 (require volume confirmation)
  20,    -- adx_threshold: 15 → 20 (stronger trend)
  -- General filters
  20, 2.0, 0.2, 0.75, 480, 10, 20, 0.8, 0.15,
  '{"rsi":false,"timeWindow":true,"trend":true,"volume":true}'::jsonb
FROM strategies
WHERE id = '1ef4e3c9-33dd-43bf-a090-ec8df7f64e56';

-- ============================================
-- Add comments to help identify optimized strategies
-- ============================================
COMMENT ON TABLE strategies IS 'Trading strategies table. Strategies with "(Optimized)" suffix are AI-recommended parameter improvements based on GPT, Grok, and DeepSeek consensus analysis for better win rates.';

