-- Add hybrid trading support to user_settings
-- This migration adds fields for hybrid trading configuration

-- Add new columns for hybrid trading
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS trading_mode TEXT NOT NULL DEFAULT 'hybrid_safe' CHECK (trading_mode IN (
  'mainnet_only', 
  'hybrid_safe', 
  'hybrid_live', 
  'paper_trading'
));

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS use_mainnet_data BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS use_testnet_api BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS paper_trading_mode BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS real_data_simulation BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS sync_mainnet_data BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS cache_indicators BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS max_position_size DECIMAL(15,2) NOT NULL DEFAULT 1000.00;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS max_daily_trades INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS risk_warning_threshold DECIMAL(5,2) NOT NULL DEFAULT 5.00;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS validate_data_integrity BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS handle_missing_data TEXT NOT NULL DEFAULT 'interpolate' CHECK (handle_missing_data IN ('skip', 'interpolate', 'error'));

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS max_data_age_minutes INTEGER NOT NULL DEFAULT 5;

-- Add risk tolerance field
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS risk_tolerance TEXT NOT NULL DEFAULT 'medium' CHECK (risk_tolerance IN ('low', 'medium', 'high'));

-- Add exchange type field (for future multi-exchange support)
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS exchange_type TEXT NOT NULL DEFAULT 'binance' CHECK (exchange_type IN ('binance', 'bybit'));

-- Add testnet API keys (separate from mainnet)
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS binance_testnet_api_key TEXT;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS binance_testnet_api_secret TEXT;

-- Add mainnet API keys (separate from testnet)
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS binance_mainnet_api_key TEXT;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS binance_mainnet_api_secret TEXT;

-- Add data quality metrics
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS data_quality_score DECIMAL(3,2) DEFAULT 1.00;

ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS last_data_sync TIMESTAMP WITH TIME ZONE;

-- Add hybrid trading statistics
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS hybrid_stats JSONB DEFAULT '{}';

-- Create index for trading mode queries
CREATE INDEX IF NOT EXISTS idx_user_settings_trading_mode ON public.user_settings(trading_mode);

-- Create index for risk tolerance queries
CREATE INDEX IF NOT EXISTS idx_user_settings_risk_tolerance ON public.user_settings(risk_tolerance);

-- Create index for exchange type queries
CREATE INDEX IF NOT EXISTS idx_user_settings_exchange_type ON public.user_settings(exchange_type);

-- Add comments for documentation
COMMENT ON COLUMN public.user_settings.trading_mode IS 'Trading mode: testnet_only, mainnet_only, hybrid_safe, hybrid_live, paper_trading';
COMMENT ON COLUMN public.user_settings.use_mainnet_data IS 'Use mainnet for market data (high accuracy)';
COMMENT ON COLUMN public.user_settings.use_testnet_api IS 'Use testnet for API calls (safe trading)';
COMMENT ON COLUMN public.user_settings.paper_trading_mode IS 'Paper trading mode (no real money)';
COMMENT ON COLUMN public.user_settings.real_data_simulation IS 'Use real market data for simulation';
COMMENT ON COLUMN public.user_settings.max_position_size IS 'Maximum position size in USD';
COMMENT ON COLUMN public.user_settings.max_daily_trades IS 'Maximum trades per day';
COMMENT ON COLUMN public.user_settings.risk_warning_threshold IS 'Risk warning threshold percentage';
COMMENT ON COLUMN public.user_settings.risk_tolerance IS 'User risk tolerance: low, medium, high';
COMMENT ON COLUMN public.user_settings.hybrid_stats IS 'Hybrid trading statistics and metrics';

-- Create function to get optimal trading configuration
CREATE OR REPLACE FUNCTION public.get_optimal_trading_config(
  p_user_id UUID,
  p_risk_tolerance TEXT DEFAULT 'medium'
)
RETURNS JSONB AS $$
DECLARE
  config JSONB;
BEGIN
  -- Get user's current settings
  SELECT jsonb_build_object(
    'trading_mode', trading_mode,
    'use_mainnet_data', use_mainnet_data,
    'use_testnet_api', use_testnet_api,
    'paper_trading_mode', paper_trading_mode,
    'real_data_simulation', real_data_simulation,
    'max_position_size', max_position_size,
    'max_daily_trades', max_daily_trades,
    'risk_warning_threshold', risk_warning_threshold,
    'risk_tolerance', risk_tolerance
  ) INTO config
  FROM public.user_settings
  WHERE user_id = p_user_id;
  
  -- If no settings found, return default based on risk tolerance
  IF config IS NULL THEN
    config := CASE p_risk_tolerance
      WHEN 'low' THEN jsonb_build_object(
        'trading_mode', 'hybrid_safe',
        'use_mainnet_data', true,
        'use_testnet_api', true,
        'paper_trading_mode', true,
        'real_data_simulation', true,
        'max_position_size', 100.00,
        'max_daily_trades', 5,
        'risk_warning_threshold', 2.00,
        'risk_tolerance', 'low'
      )
      WHEN 'high' THEN jsonb_build_object(
        'trading_mode', 'hybrid_live',
        'use_mainnet_data', true,
        'use_testnet_api', false,
        'paper_trading_mode', false,
        'real_data_simulation', true,
        'max_position_size', 10000.00,
        'max_daily_trades', 100,
        'risk_warning_threshold', 10.00,
        'risk_tolerance', 'high'
      )
      ELSE jsonb_build_object(
        'trading_mode', 'hybrid_safe',
        'use_mainnet_data', true,
        'use_testnet_api', true,
        'paper_trading_mode', true,
        'real_data_simulation', true,
        'max_position_size', 1000.00,
        'max_daily_trades', 20,
        'risk_warning_threshold', 5.00,
        'risk_tolerance', 'medium'
      )
    END;
  END IF;
  
  RETURN config;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to validate trading configuration
CREATE OR REPLACE FUNCTION public.validate_trading_config(
  p_config JSONB
)
RETURNS JSONB AS $$
DECLARE
  warnings TEXT[] := '{}';
  errors TEXT[] := '{}';
  result JSONB;
BEGIN
  -- Check for conflicting settings
  IF (p_config->>'use_mainnet_data')::boolean = false 
     AND (p_config->>'use_testnet_api')::boolean = false THEN
    errors := array_append(errors, 'Cannot disable both mainnet data and testnet API');
  END IF;
  
  -- Check position size limits
  IF (p_config->>'max_position_size')::decimal > 50000 THEN
    warnings := array_append(warnings, 'Very large position size - consider reducing for safety');
  END IF;
  
  -- Check daily trade limits
  IF (p_config->>'max_daily_trades')::integer > 200 THEN
    warnings := array_append(warnings, 'High daily trade limit - monitor for overtrading');
  END IF;
  
  -- Check risk warning threshold
  IF (p_config->>'risk_warning_threshold')::decimal > 20 THEN
    warnings := array_append(warnings, 'High risk warning threshold - consider lowering for safety');
  END IF;
  
  -- Build result
  result := jsonb_build_object(
    'valid', array_length(errors, 1) IS NULL,
    'errors', errors,
    'warnings', warnings
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update hybrid trading statistics
CREATE OR REPLACE FUNCTION public.update_hybrid_stats(
  p_user_id UUID,
  p_stats JSONB
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_settings
  SET 
    hybrid_stats = COALESCE(hybrid_stats, '{}'::jsonb) || p_stats,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get trading mode info
CREATE OR REPLACE FUNCTION public.get_trading_mode_info(
  p_trading_mode TEXT
)
RETURNS JSONB AS $$
BEGIN
  RETURN CASE p_trading_mode
    WHEN 'testnet_only' THEN jsonb_build_object(
      'mode', 'testnet',
      'description', 'Pure testnet - limited accuracy, safe for testing',
      'dataSource', 'testnet',
      'apiEndpoint', 'testnet',
      'riskLevel', 'none',
      'realMoney', false
    )
    WHEN 'mainnet_only' THEN jsonb_build_object(
      'mode', 'mainnet',
      'description', 'Pure mainnet - real money, real data, high risk',
      'dataSource', 'mainnet',
      'apiEndpoint', 'mainnet',
      'riskLevel', 'high',
      'realMoney', true
    )
    WHEN 'hybrid_safe' THEN jsonb_build_object(
      'mode', 'hybrid',
      'description', 'Hybrid mode - real data, testnet API, paper trading',
      'dataSource', 'mainnet',
      'apiEndpoint', 'testnet',
      'riskLevel', 'none',
      'realMoney', false
    )
    WHEN 'hybrid_live' THEN jsonb_build_object(
      'mode', 'hybrid',
      'description', 'Hybrid live - real data, testnet API, real execution',
      'dataSource', 'mainnet',
      'apiEndpoint', 'testnet',
      'riskLevel', 'low',
      'realMoney', true
    )
    WHEN 'paper_trading' THEN jsonb_build_object(
      'mode', 'paper',
      'description', 'Paper trading - real data, no real execution',
      'dataSource', 'mainnet',
      'apiEndpoint', 'testnet',
      'riskLevel', 'none',
      'realMoney', false
    )
    ELSE jsonb_build_object(
      'mode', 'unknown',
      'description', 'Unknown trading mode',
      'dataSource', 'unknown',
      'apiEndpoint', 'unknown',
      'riskLevel', 'unknown',
      'realMoney', false
    )
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
