-- Relax SMA Crossover filters to generate more signals
UPDATE strategies
SET 
  rsi_oversold = 25,      -- Was 10 (too extreme)
  rsi_overbought = 75     -- Was 90 (too extreme)
WHERE strategy_type = 'sma_crossover' AND status = 'active';