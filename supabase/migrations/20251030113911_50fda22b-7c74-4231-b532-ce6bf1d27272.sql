-- Remove legacy MSTG strategy columns
ALTER TABLE strategies
DROP COLUMN IF EXISTS mstg_weight_momentum,
DROP COLUMN IF EXISTS mstg_weight_trend,
DROP COLUMN IF EXISTS mstg_weight_volatility,
DROP COLUMN IF EXISTS mstg_weight_relative,
DROP COLUMN IF EXISTS mstg_long_threshold,
DROP COLUMN IF EXISTS mstg_short_threshold,
DROP COLUMN IF EXISTS mstg_exit_threshold,
DROP COLUMN IF EXISTS mstg_extreme_threshold;