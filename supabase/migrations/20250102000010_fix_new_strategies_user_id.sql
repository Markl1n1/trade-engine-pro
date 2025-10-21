-- Fix user_id for new strategies created by migration
-- This migration updates the user_id for strategies created with wrong user_id

-- First, let's see what strategies exist and their user_ids
-- Update strategies that were created with wrong user_id to current user
-- This is a temporary fix - in production you'd want to be more specific

-- Delete strategies that were created with wrong user_id (from migration)
-- and recreate them for the current user
DELETE FROM public.strategies 
WHERE strategy_type IN ('sma_20_200_rsi', 'mtf_momentum')
  AND user_id NOT IN (
    SELECT id FROM auth.users 
    WHERE email IS NOT NULL 
    ORDER BY created_at DESC 
    LIMIT 1
  );

-- Recreate the strategies for the current user
-- SMA 20/200 + RSI (Scalp)
INSERT INTO public.strategies (
  user_id, name, description, symbol, timeframe, status,
  strategy_type,
  sma_fast_period, sma_slow_period, rsi_period, rsi_overbought, rsi_oversold,
  volume_multiplier, atr_sl_multiplier, atr_tp_multiplier,
  stop_loss_percent, take_profit_percent, created_at, updated_at
)
SELECT
  (SELECT id FROM auth.users WHERE email IS NOT NULL ORDER BY created_at DESC LIMIT 1) as user_id,
  'SMA 20/200 RSI (Scalp)',
  'Scalping SMA 20/200 crossover with RSI filter and volume confirmation',
  'BTCUSDT',
  '1m',
  'active',
  'sma_20_200_rsi',
  20, 200, 14, 70, 30,
  1.2, 2.0, 3.0,
  0.6, 0.9,
  now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users WHERE email IS NOT NULL)
ON CONFLICT (user_id, name) DO NOTHING;

-- MTF Momentum (Scalp)
INSERT INTO public.strategies (
  user_id, name, description, symbol, timeframe, status,
  strategy_type,
  mtf_rsi_period, mtf_rsi_entry_threshold, mtf_macd_fast, mtf_macd_slow, mtf_macd_signal,
  mtf_volume_multiplier,
  stop_loss_percent, take_profit_percent, created_at, updated_at
)
SELECT
  (SELECT id FROM auth.users WHERE email IS NOT NULL ORDER BY created_at DESC LIMIT 1) as user_id,
  'MTF Momentum (Scalp)',
  '1m/5m/15m confluence: RSI>threshold, MACD histogram alignment, volume confirmation',
  'BTCUSDT',
  '1m',
  'active',
  'mtf_momentum',
  14, 55, 12, 26, 9,
  1.2,
  0.5, 0.75,
  now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users WHERE email IS NOT NULL)
ON CONFLICT (user_id, name) DO NOTHING;

-- Add comment to track this migration
INSERT INTO system_settings (setting_key, setting_value, description, created_at)
VALUES (
  'new_strategies_user_id_fix', 
  NOW()::text, 
  'Fixed user_id for new strategies created by migration',
  NOW()
) ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = NOW()::text,
  updated_at = NOW();
