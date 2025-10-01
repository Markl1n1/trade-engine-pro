-- Add benchmark_symbol column to strategies table
ALTER TABLE strategies 
ADD COLUMN IF NOT EXISTS benchmark_symbol text DEFAULT 'BTCUSDT';

-- Add MSTG specific parameters to strategies table
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS mstg_weight_momentum numeric DEFAULT 0.25,
ADD COLUMN IF NOT EXISTS mstg_weight_trend numeric DEFAULT 0.35,
ADD COLUMN IF NOT EXISTS mstg_weight_volatility numeric DEFAULT 0.20,
ADD COLUMN IF NOT EXISTS mstg_weight_relative numeric DEFAULT 0.20,
ADD COLUMN IF NOT EXISTS mstg_long_threshold numeric DEFAULT 30,
ADD COLUMN IF NOT EXISTS mstg_short_threshold numeric DEFAULT -30,
ADD COLUMN IF NOT EXISTS mstg_exit_threshold numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS mstg_extreme_threshold numeric DEFAULT 60;

-- Add comment explaining MSTG parameters
COMMENT ON COLUMN strategies.benchmark_symbol IS 'Benchmark symbol for relative strength calculation in MSTG strategy';
COMMENT ON COLUMN strategies.mstg_weight_momentum IS 'Weight for momentum component (RSI) in MSTG composite score';
COMMENT ON COLUMN strategies.mstg_weight_trend IS 'Weight for trend component (EMA10 vs EMA21) in MSTG composite score';
COMMENT ON COLUMN strategies.mstg_weight_volatility IS 'Weight for volatility component (Bollinger position) in MSTG composite score';
COMMENT ON COLUMN strategies.mstg_weight_relative IS 'Weight for relative strength component in MSTG composite score';