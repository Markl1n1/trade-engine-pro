-- Optimize ATH Guard filters for better win rate
UPDATE strategies
SET 
  ath_guard_ema_slope_threshold = 0.25,  -- Was 0.1 (require stronger trends)
  ath_guard_volume_multiplier = 2.0,     -- Was 1.2 (need significant volume)
  adx_threshold = 30,                     -- Was 20 (require confirmed trends)
  ath_guard_rsi_threshold = 65,          -- Was 75 (avoid overbought)
  min_volume_spike = 1.8,                 -- Was 1.2 (filter noise)
  ath_guard_pullback_tolerance = 0.15,   -- Was 0.2 (tighter retracement)
  ath_guard_stoch_oversold = 20,         -- Was 25 (deeper oversold for longs)
  ath_guard_stoch_overbought = 80        -- Was 75 (higher overbought for shorts)
WHERE strategy_type = 'ath_guard_scalping';