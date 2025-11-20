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
  rsi_period = NULL,
  rsi_overbought = NULL,
  rsi_oversold = NULL,
  atr_sl_multiplier = NULL,
  atr_tp_multiplier = NULL
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
  rsi_period = NULL,
  rsi_overbought = NULL,
  rsi_oversold = NULL,
  volume_multiplier = NULL,
  bollinger_period = NULL,
  bollinger_std = NULL,
  momentum_threshold = NULL,
  support_resistance_lookback = NULL,
  min_volume_spike = NULL,
  min_profit_percent = NULL
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
  atr_sl_multiplier = NULL,
  atr_tp_multiplier = NULL
WHERE strategy_type = 'sma_crossover';

-- ============================================
-- PHASE 2: Optimize Filter Parameters
-- ============================================

-- 4h Reentry BR: Relax filters for more trades
UPDATE strategies
SET 
  adx_threshold = 18,           -- Down from 22 (allow weaker trends)
  rsi_oversold = 20,            -- Down from 30 (earlier entries)
  rsi_overbought = 80,          -- Up from 70 (later exits)
  volume_multiplier = 1.1,      -- Down from 1.8 (less volume requirement)
  bollinger_period = 20,
  bollinger_std = 2.0,
  trailing_stop_percent = 0.75,
  max_position_time = 480,
  momentum_threshold = 12,
  support_resistance_lookback = 20,
  min_volume_spike = 1.1,
  min_profit_percent = 0.2
WHERE strategy_type = '4h_reentry';

-- MTF Momentum: Lower thresholds for more signals
UPDATE strategies
SET 
  mtf_rsi_entry_threshold = 45,  -- Down from 55 (easier entries)
  mtf_volume_multiplier = 1.0,   -- Down from 1.2 (less volume requirement)
  adx_threshold = 20,            -- Keep reasonable trend filter
  trailing_stop_percent = 0.75,
  max_position_time = 480
WHERE strategy_type = 'mtf_momentum';

-- SMA Crossover: Reduce volume and trend requirements
UPDATE strategies
SET 
  volume_multiplier = 0.8,       -- Down from 1.2 (accept lower volume)
  adx_threshold = 15,            -- Down from 22 (weaker trends OK)
  min_trend_strength = 0.2,      -- Down from 0.3 (less strength needed)
  rsi_overbought = 90,           -- Up from 70 (disable RSI filter)
  rsi_oversold = 10,             -- Down from 30 (disable RSI filter)
  trailing_stop_percent = 0.75,
  max_position_time = 480,
  bollinger_period = 20,
  bollinger_std = 2.0,
  momentum_threshold = 10,       -- Down from 12
  support_resistance_lookback = 20,
  min_volume_spike = 0.8,        -- Down from 1.1
  min_profit_percent = 0.15      -- Down from 0.2
WHERE strategy_type = 'sma_crossover';