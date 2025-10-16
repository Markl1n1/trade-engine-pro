-- Fix missing columns in user_settings table
-- This script adds the missing columns that are causing the database error

-- Add trading_mode column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS trading_mode TEXT NOT NULL DEFAULT 'hybrid_safe' CHECK (trading_mode IN (
  'testnet_only', 
  'mainnet_only', 
  'hybrid_safe', 
  'hybrid_live', 
  'paper_trading'
));

-- Add use_mainnet_data column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS use_mainnet_data BOOLEAN NOT NULL DEFAULT true;

-- Add use_testnet_api column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS use_testnet_api BOOLEAN NOT NULL DEFAULT true;

-- Add paper_trading_mode column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS paper_trading_mode BOOLEAN NOT NULL DEFAULT true;

-- Add real_data_simulation column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS real_data_simulation BOOLEAN NOT NULL DEFAULT true;

-- Add sync_mainnet_data column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS sync_mainnet_data BOOLEAN NOT NULL DEFAULT true;

-- Add cache_indicators column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS cache_indicators BOOLEAN NOT NULL DEFAULT true;

-- Add max_position_size column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS max_position_size DECIMAL(15,2) NOT NULL DEFAULT 1000.00;

-- Add max_daily_trades column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS max_daily_trades INTEGER NOT NULL DEFAULT 10;

-- Add risk_warning_threshold column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS risk_warning_threshold DECIMAL(5,2) NOT NULL DEFAULT 5.00;

-- Add validate_data_integrity column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS validate_data_integrity BOOLEAN NOT NULL DEFAULT true;

-- Add handle_missing_data column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS handle_missing_data TEXT NOT NULL DEFAULT 'interpolate' CHECK (handle_missing_data IN ('skip', 'interpolate', 'error'));

-- Add max_data_age_minutes column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS max_data_age_minutes INTEGER NOT NULL DEFAULT 5;

-- Add risk_tolerance column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS risk_tolerance TEXT NOT NULL DEFAULT 'medium' CHECK (risk_tolerance IN ('low', 'medium', 'high'));

-- Add data_quality_score column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS data_quality_score DECIMAL(3,2) DEFAULT 1.00;

-- Add last_data_sync column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS last_data_sync TIMESTAMP WITH TIME ZONE;

-- Add hybrid_stats column if it doesn't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS hybrid_stats JSONB DEFAULT '{}';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_settings_trading_mode ON public.user_settings(trading_mode);
CREATE INDEX IF NOT EXISTS idx_user_settings_risk_tolerance ON public.user_settings(risk_tolerance);

-- Add comments for documentation
COMMENT ON COLUMN public.user_settings.trading_mode IS 'Trading mode: testnet_only, mainnet_only, hybrid_safe, hybrid_live, paper_trading';
COMMENT ON COLUMN public.user_settings.use_mainnet_data IS 'Use mainnet for market data (high accuracy)';
COMMENT ON COLUMN public.user_settings.use_testnet_api IS 'Use testnet for API calls (safe trading)';
COMMENT ON COLUMN public.user_settings.paper_trading_mode IS 'Paper trading mode (no real money)';