-- Fix 4h Reentry strategy Stop Loss and Take Profit values
-- The negative stop_loss_percent was incorrect and causing issues

UPDATE strategies 
SET 
  stop_loss_percent = 5.0,  -- ✅ POSITIVE value (5% stop loss)
  take_profit_percent = 10.0  -- ✅ Reasonable take profit (10%)
WHERE strategy_type = '4h_reentry';

-- Also update the strategy template to have correct defaults
UPDATE strategy_templates
SET template_data = jsonb_set(
  template_data,
  '{stop_loss_percent}',
  '5.0'::jsonb
)
WHERE strategy_type = '4h_reentry';

UPDATE strategy_templates
SET template_data = jsonb_set(
  template_data,
  '{take_profit_percent}',
  '10.0'::jsonb
)
WHERE strategy_type = '4h_reentry';
