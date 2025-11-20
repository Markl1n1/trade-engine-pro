-- Strategy Configuration Cleanup and Optimization
-- Phase 1: Cleanup unused parameters (set to NULL)
-- Phase 2: Optimize parameters for better winrate

-- ============================================
-- PHASE 1: Cleanup Unused Parameters
-- ============================================

-- ATH Guard: Clean unused parameters
UPDATE strategies
SET 
  sma_fast_period = NULL,
  sma_slow_period = NULL,
  mtf_rsi_period = NULL,
  mtf_rsi_entry_threshold = NULL,
  mtf_macd_fast = NULL,
  mtf_macd_slow = NULL,
  mtf_macd_signal = NULL,
  mtf_volume_multiplier = NULL,
  fvg_key_candle_time = NULL,
  fvg_key_timeframe = NULL,
  fvg_analysis_timeframe = NULL,
  fvg_risk_reward_ratio = NULL,
  fvg_tick_size = NULL,
  mstg_weight_momentum = NULL,
  mstg_weight_trend = NULL,
  mstg_weight_volatility = NULL,
  mstg_weight_relative = NULL,
  mstg_long_threshold = NULL,
  mstg_short_threshold = NULL,
  mstg_exit_threshold = NULL,
  mstg_extreme_threshold = NULL,
  rsi_period = NULL,
  rsi_overbought = NULL,
  rsi_oversold = NULL,
  volume_multiplier = NULL,
  atr_sl_multiplier = NULL,
  atr_tp_multiplier = NULL
WHERE strategy_type = 'ath_guard_scalping';

-- EMA Crossover: Clean unused parameters
UPDATE strategies
SET 
  sma_fast_period = NULL,
  sma_slow_period = NULL,
  mtf_rsi_period = NULL,
  mtf_rsi_entry_threshold = NULL,
  mtf_macd_fast = NULL,
  mtf_macd_slow = NULL,
  mtf_macd_signal = NULL,
  mtf_volume_multiplier = NULL,
  fvg_key_candle_time = NULL,
  fvg_key_timeframe = NULL,
  fvg_analysis_timeframe = NULL,
  fvg_risk_reward_ratio = NULL,
  fvg_tick_size = NULL,
  mstg_weight_momentum = NULL,
  mstg_weight_trend = NULL,
  mstg_weight_volatility = NULL,
  mstg_weight_relative = NULL,
  mstg_long_threshold = NULL,
  mstg_short_threshold = NULL,
  mstg_exit_threshold = NULL,
  mstg_extreme_threshold = NULL,
  ath_guard_ema_slope_threshold = NULL,
  ath_guard_pullback_tolerance = NULL,
  ath_guard_volume_multiplier = NULL,
  ath_guard_stoch_oversold = NULL,
  ath_guard_stoch_overbought = NULL,
  ath_guard_atr_sl_multiplier = NULL,
  ath_guard_atr_tp1_multiplier = NULL,
  ath_guard_atr_tp2_multiplier = NULL,
  ath_guard_ath_safety_distance = NULL,
  ath_guard_rsi_threshold = NULL,
  rsi_period = NULL,
  rsi_overbought = NULL,
  rsi_oversold = NULL,
  volume_multiplier = NULL,
  adx_threshold = NULL,
  bollinger_period = NULL,
  bollinger_std = NULL,
  momentum_threshold = NULL,
  support_resistance_lookback = NULL,
  min_volume_spike = NULL,
  min_profit_percent = NULL
WHERE strategy_type = 'ema_crossover_scalping';

-- 4h Reentry: Clean unused parameters
UPDATE strategies
SET 
  sma_fast_period = NULL,
  sma_slow_period = NULL,
  mtf_rsi_period = NULL,
  mtf_rsi_entry_threshold = NULL,
  mtf_macd_fast = NULL,
  mtf_macd_slow = NULL,
  mtf_macd_signal = NULL,
  mtf_volume_multiplier = NULL,
  fvg_key_candle_time = NULL,
  fvg_key_timeframe = NULL,
  fvg_analysis_timeframe = NULL,
  fvg_risk_reward_ratio = NULL,
  fvg_tick_size = NULL,
  ath_guard_ema_slope_threshold = NULL,
  ath_guard_pullback_tolerance = NULL,
  ath_guard_volume_multiplier = NULL,
  ath_guard_stoch_oversold = NULL,
  ath_guard_stoch_overbought = NULL,
  ath_guard_atr_sl_multiplier = NULL,
  ath_guard_atr_tp1_multiplier = NULL,
  ath_guard_atr_tp2_multiplier = NULL,
  ath_guard_ath_safety_distance = NULL,
  ath_guard_rsi_threshold = NULL,
  rsi_period = NULL
WHERE strategy_type = '4h_reentry';

-- FVG Scalping: Clean unused parameters
UPDATE strategies
SET 
  sma_fast_period = NULL,
  sma_slow_period = NULL,
  mtf_rsi_period = NULL,
  mtf_rsi_entry_threshold = NULL,
  mtf_macd_fast = NULL,
  mtf_macd_slow = NULL,
  mtf_macd_signal = NULL,
  mtf_volume_multiplier = NULL,
  ath_guard_ema_slope_threshold = NULL,
  ath_guard_pullback_tolerance = NULL,
  ath_guard_volume_multiplier = NULL,
  ath_guard_stoch_oversold = NULL,
  ath_guard_stoch_overbought = NULL,
  ath_guard_atr_sl_multiplier = NULL,
  ath_guard_atr_tp1_multiplier = NULL,
  ath_guard_atr_tp2_multiplier = NULL,
  ath_guard_ath_safety_distance = NULL,
  ath_guard_rsi_threshold = NULL,
  mstg_weight_momentum = NULL,
  mstg_weight_trend = NULL,
  mstg_weight_volatility = NULL,
  mstg_weight_relative = NULL,
  mstg_long_threshold = NULL,
  mstg_short_threshold = NULL,
  mstg_exit_threshold = NULL,
  mstg_extreme_threshold = NULL,
  rsi_period = NULL,
  rsi_overbought = NULL,
  rsi_oversold = NULL,
  volume_multiplier = NULL,
  adx_threshold = NULL,
  bollinger_period = NULL,
  bollinger_std = NULL,
  atr_sl_multiplier = NULL,
  atr_tp_multiplier = NULL,
  momentum_threshold = NULL,
  support_resistance_lookback = NULL,
  min_volume_spike = NULL,
  min_profit_percent = NULL
WHERE strategy_type = 'fvg_scalping';

-- MTF Momentum: Clean unused parameters
UPDATE strategies
SET 
  sma_fast_period = NULL,
  sma_slow_period = NULL,
  fvg_key_candle_time = NULL,
  fvg_key_timeframe = NULL,
  fvg_analysis_timeframe = NULL,
  fvg_risk_reward_ratio = NULL,
  fvg_tick_size = NULL,
  ath_guard_ema_slope_threshold = NULL,
  ath_guard_pullback_tolerance = NULL,
  ath_guard_volume_multiplier = NULL,
  ath_guard_stoch_oversold = NULL,
  ath_guard_stoch_overbought = NULL,
  ath_guard_atr_sl_multiplier = NULL,
  ath_guard_atr_tp1_multiplier = NULL,
  ath_guard_atr_tp2_multiplier = NULL,
  ath_guard_ath_safety_distance = NULL,
  ath_guard_rsi_threshold = NULL,
  mstg_weight_momentum = NULL,
  mstg_weight_trend = NULL,
  mstg_weight_volatility = NULL,
  mstg_weight_relative = NULL,
  mstg_long_threshold = NULL,
  mstg_short_threshold = NULL,
  mstg_exit_threshold = NULL,
  mstg_extreme_threshold = NULL,
  rsi_period = NULL,
  rsi_overbought = NULL,
  rsi_oversold = NULL,
  volume_multiplier = NULL,
  adx_threshold = NULL,
  bollinger_period = NULL,
  bollinger_std = NULL,
  momentum_threshold = NULL,
  support_resistance_lookback = NULL,
  min_volume_spike = NULL
WHERE strategy_type = 'mtf_momentum';

-- SMA Crossover: Clean unused parameters
UPDATE strategies
SET 
  mtf_rsi_period = NULL,
  mtf_rsi_entry_threshold = NULL,
  mtf_macd_fast = NULL,
  mtf_macd_slow = NULL,
  mtf_macd_signal = NULL,
  mtf_volume_multiplier = NULL,
  fvg_key_candle_time = NULL,
  fvg_key_timeframe = NULL,
  fvg_analysis_timeframe = NULL,
  fvg_risk_reward_ratio = NULL,
  fvg_tick_size = NULL,
  ath_guard_ema_slope_threshold = NULL,
  ath_guard_pullback_tolerance = NULL,
  ath_guard_volume_multiplier = NULL,
  ath_guard_stoch_oversold = NULL,
  ath_guard_stoch_overbought = NULL,
  ath_guard_atr_sl_multiplier = NULL,
  ath_guard_atr_tp1_multiplier = NULL,
  ath_guard_atr_tp2_multiplier = NULL,
  ath_guard_ath_safety_distance = NULL,
  ath_guard_rsi_threshold = NULL,
  mstg_weight_momentum = NULL,
  mstg_weight_trend = NULL,
  mstg_weight_volatility = NULL,
  mstg_weight_relative = NULL,
  mstg_long_threshold = NULL,
  mstg_short_threshold = NULL,
  mstg_exit_threshold = NULL,
  mstg_extreme_threshold = NULL,
  momentum_threshold = NULL,
  support_resistance_lookback = NULL,
  min_volume_spike = NULL,
  min_profit_percent = NULL
WHERE strategy_type = 'sma_crossover';

-- ============================================
-- PHASE 2: Optimize Parameters for Winrate
-- ============================================

-- 4h Reentry: Relax filters to allow entries
UPDATE strategies
SET 
  adx_threshold = 18,
  rsi_oversold = 20,
  rsi_overbought = 80,
  momentum_threshold = 8,
  volume_multiplier = 1.1
WHERE strategy_type = '4h_reentry'
  AND (adx_threshold IS NULL OR adx_threshold >= 22);

-- MTF Momentum: Reduce thresholds to allow entries
UPDATE strategies
SET 
  mtf_rsi_entry_threshold = 45,
  mtf_volume_multiplier = 1.0
WHERE strategy_type = 'mtf_momentum'
  AND (mtf_rsi_entry_threshold IS NULL OR mtf_rsi_entry_threshold >= 55);

-- SMA Crossover: Relax filters to allow entries
UPDATE strategies
SET 
  volume_multiplier = 0.8,
  adx_threshold = 15,
  min_trend_strength = 0.2,
  general_filter_flags = COALESCE(general_filter_flags, '{}'::jsonb) || '{"rsi": false}'::jsonb
WHERE strategy_type = 'sma_crossover'
  AND (volume_multiplier IS NULL OR volume_multiplier >= 0.9);

-- FVG Scalping: Note - quality score threshold change is in code, not DB
-- min_volume_ratio is also hardcoded in config loader, but we can update fvg_risk_reward_ratio if needed

-- EMA Crossover: Keep current parameters, will be optimized in code if needed

