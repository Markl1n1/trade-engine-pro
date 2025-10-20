-- Replace MSTG strategy with MTF Momentum strategy
-- This migration updates the existing MSTG strategy to use the new MTF Momentum logic

-- Update the strategy type and configuration
UPDATE strategies 
SET 
  strategy_type = 'mtf_momentum',
  name = 'Multi-Timeframe Momentum Strategy',
  description = 'Advanced scalping strategy using multi-timeframe momentum analysis with RSI, EMA, and volume indicators. Optimized for 1m-15m timeframes with tight stop-loss and take-profit levels.',
  timeframe = '1m',
  max_position_size = 1000,
  stop_loss_percentage = 0.5,
  take_profit_percentage = 1.0,
  cooldown_minutes = 2,
  updated_at = NOW()
WHERE strategy_type = 'mstg' OR strategy_type = 'market_sentiment_trend_gauge';

-- Add new columns for MTF Momentum strategy if they don't exist
ALTER TABLE strategies 
ADD COLUMN IF NOT EXISTS mtf_momentum_config JSONB DEFAULT '{
  "rsi_period": 14,
  "rsi_oversold": 30,
  "rsi_overbought": 70,
  "ema_fast": 9,
  "ema_slow": 21,
  "volume_threshold": 1.2,
  "momentum_threshold": 0.5,
  "scalping_mode": true,
  "max_hold_time_minutes": 15,
  "min_profit_target": 0.3
}'::jsonb;

-- Update the MSTG strategy with MTF Momentum configuration
UPDATE strategies 
SET mtf_momentum_config = '{
  "rsi_period": 14,
  "rsi_oversold": 30,
  "rsi_overbought": 70,
  "ema_fast": 9,
  "ema_slow": 21,
  "volume_threshold": 1.2,
  "momentum_threshold": 0.5,
  "scalping_mode": true,
  "max_hold_time_minutes": 15,
  "min_profit_target": 0.3
}'::jsonb
WHERE strategy_type = 'mtf_momentum';

-- Add comment to explain the strategy change
COMMENT ON COLUMN strategies.mtf_momentum_config IS 'Configuration for Multi-Timeframe Momentum strategy - replaces legacy MSTG strategy for scalping';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_strategies_mtf_momentum 
ON strategies USING GIN (mtf_momentum_config) 
WHERE strategy_type = 'mtf_momentum';

-- Log the migration
INSERT INTO system_settings (setting_key, setting_value, description, created_at)
VALUES (
  'mstg_to_mtf_migration', 
  NOW()::text, 
  'MSTG strategy replaced with MTF Momentum strategy for scalping optimization',
  NOW()
) ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = NOW()::text,
  updated_at = NOW();
