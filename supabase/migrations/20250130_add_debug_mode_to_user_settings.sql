-- Add debug_mode column to user_settings table
-- This allows users to toggle debug logging for backtests

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS debug_mode BOOLEAN NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.user_settings.debug_mode IS 'Enable debug logging for backtests and strategy monitoring';

-- Create index for debug_mode queries
CREATE INDEX IF NOT EXISTS idx_user_settings_debug_mode ON public.user_settings(debug_mode);

-- Update the get_user_settings function to include debug_mode
CREATE OR REPLACE FUNCTION public.get_user_settings(p_user_id UUID)
RETURNS TABLE (
  exchange_type TEXT,
  use_testnet BOOLEAN,
  trading_mode TEXT,
  use_mainnet_data BOOLEAN,
  use_testnet_api BOOLEAN,
  paper_trading_mode BOOLEAN,
  real_data_simulation BOOLEAN,
  sync_mainnet_data BOOLEAN,
  cache_indicators BOOLEAN,
  max_position_size DECIMAL,
  max_daily_trades INTEGER,
  risk_warning_threshold DECIMAL,
  risk_tolerance TEXT,
  validate_data_integrity BOOLEAN,
  handle_missing_data TEXT,
  max_data_age_minutes INTEGER,
  data_quality_score DECIMAL,
  last_data_sync TIMESTAMP WITH TIME ZONE,
  hybrid_stats JSONB,
  debug_mode BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.exchange_type,
    us.use_testnet_api,
    us.trading_mode,
    us.use_mainnet_data,
    us.use_testnet_api,
    us.paper_trading_mode,
    us.real_data_simulation,
    us.sync_mainnet_data,
    us.cache_indicators,
    us.max_position_size,
    us.max_daily_trades,
    us.risk_warning_threshold,
    us.risk_tolerance,
    us.validate_data_integrity,
    us.handle_missing_data,
    us.max_data_age_minutes,
    us.data_quality_score,
    us.last_data_sync,
    us.hybrid_stats,
    us.debug_mode
  FROM user_settings us
  WHERE us.user_id = p_user_id;
END;
$$;
