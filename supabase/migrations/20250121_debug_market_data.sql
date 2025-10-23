-- Debug query to check market data for BTCUSDT 5m
-- This will help identify if data exists and what exchange_type it has

SELECT 
  symbol,
  timeframe,
  exchange_type,
  COUNT(*) as candle_count,
  MIN(open_time) as earliest_candle,
  MAX(open_time) as latest_candle,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM market_data 
WHERE symbol = 'BTCUSDT' AND timeframe = '5m'
GROUP BY symbol, timeframe, exchange_type
ORDER BY exchange_type, first_created;
