-- Update the 4h Reentry template with proper conditions that represent the strategy logic
UPDATE strategy_templates
SET template_data = jsonb_set(
  template_data,
  '{conditions}',
  '[
    {
      "orderType": "buy",
      "indicatorType": "custom_4h_reentry_long",
      "operator": "crosses_above",
      "value": 0,
      "description": "Price re-enters above 4h low after breaking below"
    },
    {
      "orderType": "sell",
      "indicatorType": "custom_4h_reentry_short",
      "operator": "crosses_below",
      "value": 0,
      "description": "Price re-enters below 4h high after breaking above"
    }
  ]'::jsonb
)
WHERE name = '4h Reentry Breakout';