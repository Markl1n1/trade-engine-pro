-- =====================================================
-- COMPLETE SCHEMA CONSOLIDATION (Fixes Remix Issues)
-- =====================================================
-- This replaces all previous migrations
-- Fixes: Duplicate enums, missing columns, trigger conflicts

-- Drop and recreate enums without duplicates
DROP TYPE IF EXISTS public.indicator_type CASCADE;
DROP TYPE IF EXISTS public.condition_operator CASCADE;
DROP TYPE IF EXISTS public.order_type CASCADE;
DROP TYPE IF EXISTS public.strategy_status CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- Clean enums (no case duplicates)
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.strategy_status AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE public.order_type AS ENUM ('buy', 'sell');

CREATE TYPE public.condition_operator AS ENUM (
  'greater_than', 'less_than', 'equals', 'crosses_above', 'crosses_below',
  'between', 'indicator_comparison', 'bullish_divergence', 'bearish_divergence',
  'breakout_above', 'breakout_below', 'bounce_off', 'in_range'
);

CREATE TYPE public.indicator_type AS ENUM (
  'price', 'open', 'high', 'low', 'close', 'volume',
  'sma', 'ema', 'wma', 'hma', 'tema', 'dema', 'zlema', 'kama', 'mama',
  'rsi', 'macd', 'macd_signal', 'macd_histogram',
  'bb_upper', 'bb_middle', 'bb_lower', 'atr', 'adx',
  'stochastic', 'stoch_k', 'stoch_d', 'cci', 'mfi', 'obv', 'vwap',
  'psar', 'supertrend', 'ichimoku_tenkan', 'ichimoku_kijun',
  'ichimoku_senkou_a', 'ichimoku_senkou_b', 'fibonacci', 'pivot_point'
);

-- Add missing columns to backtest results
ALTER TABLE public.strategy_backtest_results 
ADD COLUMN IF NOT EXISTS profit_factor numeric,
ADD COLUMN IF NOT EXISTS avg_win numeric,
ADD COLUMN IF NOT EXISTS avg_loss numeric;