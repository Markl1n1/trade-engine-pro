-- Check strategies in database
-- Run this in Supabase SQL Editor to verify strategies exist

-- Check all strategies
SELECT 
  id,
  user_id,
  name,
  strategy_type,
  status,
  symbol,
  timeframe,
  created_at
FROM strategies 
ORDER BY created_at DESC;

-- Check specific new strategies
SELECT 
  id,
  user_id,
  name,
  strategy_type,
  status,
  symbol,
  timeframe,
  sma_fast_period,
  sma_slow_period,
  rsi_period,
  mtf_rsi_period,
  mtf_macd_fast,
  created_at
FROM strategies 
WHERE strategy_type IN ('sma_20_200_rsi', 'mtf_momentum')
ORDER BY created_at DESC;

-- Check user count
SELECT COUNT(*) as user_count FROM auth.users;

-- Check if strategies have correct user_id
SELECT 
  s.name,
  s.strategy_type,
  s.user_id,
  u.email
FROM strategies s
LEFT JOIN auth.users u ON s.user_id = u.id
WHERE s.strategy_type IN ('sma_20_200_rsi', 'mtf_momentum');
