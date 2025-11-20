-- Clean up duplicate market data candles
-- Remove numeric timeframe format (1, 5, 15, 30, 60) 
-- Keep only string format (1m, 5m, 15m, 30m, 1h, 4h, 1d)

DELETE FROM market_data 
WHERE timeframe IN ('1', '5', '15', '30', '60');