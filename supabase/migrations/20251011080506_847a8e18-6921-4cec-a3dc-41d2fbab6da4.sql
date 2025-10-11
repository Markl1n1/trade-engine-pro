-- Update 4h Reentry strategy to use fixed SL/TP percentages
UPDATE strategies 
SET 
  stop_loss_percent = -20.00,
  take_profit_percent = 35.00
WHERE strategy_type = '4h_reentry';