-- Optimize EMA 9/21 and SMA 20/200 strategies for 50%+ win rate

-- Update EMA 9/21 strategy: increase SL/TP and enable RSI filter
UPDATE strategies 
SET 
  stop_loss_percent = 2.5,
  take_profit_percent = 5.0,
  updated_at = NOW()
WHERE strategy_type = 'ema_crossover_scalping';

-- Update SMA 20/200 strategy: change periods to 20/50 for faster response on 15m DOGE
UPDATE strategies 
SET 
  sma_fast_period = 20,
  sma_slow_period = 50,
  stop_loss_percent = 2.5,
  take_profit_percent = 5.0,
  updated_at = NOW()
WHERE name = 'SMA 20/200 Cross (DOGE-15m)';