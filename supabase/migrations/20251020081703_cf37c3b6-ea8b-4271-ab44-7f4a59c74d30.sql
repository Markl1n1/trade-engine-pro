-- Update default TP/SL values to 1:2 ratio for all strategies
-- Set default stop_loss_percent to -1% and take_profit_percent to +2%

-- Update existing strategies to use 1:2 ratio if they don't have custom values
UPDATE strategies
SET 
  stop_loss_percent = 1.0,
  take_profit_percent = 2.0
WHERE stop_loss_percent IS NULL OR take_profit_percent IS NULL;

-- Update ATH Guard default multipliers to maintain 1:2 ratio
-- SL = 1.0x ATR, TP1 = 1.0x ATR (partial), TP2 = 2.0x ATR (full 1:2)
UPDATE strategies
SET
  ath_guard_atr_sl_multiplier = 1.0,
  ath_guard_atr_tp1_multiplier = 1.0,
  ath_guard_atr_tp2_multiplier = 2.0
WHERE strategy_type = 'ath_guard_scalping';