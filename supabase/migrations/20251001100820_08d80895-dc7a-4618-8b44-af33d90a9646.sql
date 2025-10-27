-- Add strategy_type column to both tables
ALTER TABLE strategies 
ADD COLUMN IF NOT EXISTS strategy_type TEXT DEFAULT 'standard';

ALTER TABLE strategy_templates
ADD COLUMN IF NOT EXISTS strategy_type TEXT DEFAULT 'standard';

COMMENT ON COLUMN strategies.strategy_type IS 'Type of strategy: standard, 4h_reentry, etc.';
COMMENT ON COLUMN strategy_templates.strategy_type IS 'Type of strategy template: standard, 4h_reentry, etc.';

-- Add 4h Reentry template
INSERT INTO strategy_templates (
  name,
  description,
  category,
  symbol,
  timeframe,
  initial_capital,
  position_size_percent,
  is_public,
  strategy_type,
  template_data
) VALUES (
  '4h Reentry',
  'Trade re-entries into the first 4-hour NY range after a one-candle breakout, with a 2R target and stop at the breakout candle''s extreme. Uses 5-minute candles for precise execution.',
  'Breakout',
  'BTCUSDT',
  '5m',
  10000,
  100,
  true,
  '4h_reentry',
  '{
    "buyConditions": [],
    "sellConditions": [],
    "special_logic": "4h_reentry",
    "session_start": "00:00",
    "session_end": "03:59",
    "timezone": "America/New_York",
    "risk_reward_ratio": 2
  }'
);