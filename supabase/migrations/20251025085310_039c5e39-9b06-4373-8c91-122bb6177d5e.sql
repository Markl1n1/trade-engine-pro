-- Add FVG Scalping Strategy configuration columns to strategies table
ALTER TABLE public.strategies 
  ADD COLUMN IF NOT EXISTS fvg_key_candle_time TEXT DEFAULT '09:30-09:35',
  ADD COLUMN IF NOT EXISTS fvg_key_timeframe TEXT DEFAULT '5m',
  ADD COLUMN IF NOT EXISTS fvg_analysis_timeframe TEXT DEFAULT '1m',
  ADD COLUMN IF NOT EXISTS fvg_risk_reward_ratio NUMERIC DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS fvg_tick_size NUMERIC DEFAULT 0.01;

COMMENT ON COLUMN public.strategies.fvg_key_candle_time IS 'FVG strategy: Time window for key candle detection (e.g., 09:30-09:35 EST)';
COMMENT ON COLUMN public.strategies.fvg_key_timeframe IS 'FVG strategy: Timeframe for key level detection (e.g., 5m)';
COMMENT ON COLUMN public.strategies.fvg_analysis_timeframe IS 'FVG strategy: Timeframe for FVG analysis (e.g., 1m)';
COMMENT ON COLUMN public.strategies.fvg_risk_reward_ratio IS 'FVG strategy: Risk to reward ratio (default 3:1)';
COMMENT ON COLUMN public.strategies.fvg_tick_size IS 'FVG strategy: Minimum price tick size for SL calculation';