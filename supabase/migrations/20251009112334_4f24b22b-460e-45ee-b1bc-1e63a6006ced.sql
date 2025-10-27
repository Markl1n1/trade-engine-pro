-- Add ATH Guard Mode configuration fields to strategies table
ALTER TABLE strategies 
ADD COLUMN IF NOT EXISTS ath_guard_ema_slope_threshold numeric DEFAULT 0.15,
ADD COLUMN IF NOT EXISTS ath_guard_pullback_tolerance numeric DEFAULT 0.15,
ADD COLUMN IF NOT EXISTS ath_guard_volume_multiplier numeric DEFAULT 1.8,
ADD COLUMN IF NOT EXISTS ath_guard_stoch_oversold numeric DEFAULT 25,
ADD COLUMN IF NOT EXISTS ath_guard_stoch_overbought numeric DEFAULT 75,
ADD COLUMN IF NOT EXISTS ath_guard_atr_sl_multiplier numeric DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS ath_guard_atr_tp1_multiplier numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS ath_guard_atr_tp2_multiplier numeric DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS ath_guard_ath_safety_distance numeric DEFAULT 0.2,
ADD COLUMN IF NOT EXISTS ath_guard_rsi_threshold numeric DEFAULT 70;