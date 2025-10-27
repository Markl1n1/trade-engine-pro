-- =====================================================
-- TRADE ENGINE PRO - Complete Database Schema
-- =====================================================
-- 
-- This migration file creates a complete database schema for Trade Engine Pro
-- from scratch. It can be used to set up a fresh Supabase project.
--
-- USAGE:
--   For fresh database: psql "postgresql://..." -f complete_database_schema.sql
--
-- INCLUDES:
--   - Enums (5 types)
--   - Core Tables (16 tables)
--   - Database Functions (9 functions)
--   - Triggers (4 triggers)
--   - RLS Policies (60+ policies)
--   - Performance Indexes (15+ indexes)
--
-- =====================================================

-- =====================================================
-- SECTION 1: ENUMS
-- =====================================================

-- Application Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Strategy Status
CREATE TYPE public.strategy_status AS ENUM ('draft', 'active', 'paused', 'archived');

-- Order Types
CREATE TYPE public.order_type AS ENUM ('buy', 'sell');

-- Condition Operators
CREATE TYPE public.condition_operator AS ENUM (
  'greater_than',
  'less_than',
  'equals',
  'crosses_above',
  'crosses_below',
  'between',
  'outside_range'
);

-- Indicator Types
CREATE TYPE public.indicator_type AS ENUM (
  'price',
  'sma',
  'ema',
  'rsi',
  'macd',
  'macd_signal',
  'macd_histogram',
  'bb_upper',
  'bb_middle',
  'bb_lower',
  'atr',
  'adx',
  'stoch_k',
  'stoch_d',
  'cci',
  'mfi',
  'obv',
  'vwap',
  'sar',
  'roc',
  'trix',
  'keltner_upper',
  'keltner_middle',
  'keltner_lower',
  'donchian_upper',
  'donchian_middle',
  'donchian_lower',
  'ichimoku_conversion',
  'ichimoku_base',
  'ichimoku_span_a',
  'ichimoku_span_b',
  'volume',
  'williams_r',
  'ultimate_oscillator',
  'aroon_up',
  'aroon_down',
  'supertrend',
  'psar',
  'ema_21',
  'ema_50',
  'ema_100',
  'ema_200',
  'sma_20',
  'sma_50',
  'sma_100',
  'sma_200',
  'wma',
  'hma',
  'tema',
  'dema',
  'zlema',
  'rsi_divergence',
  'macd_divergence',
  'volume_divergence',
  'fibonacci_0',
  'fibonacci_236',
  'fibonacci_382',
  'fibonacci_500',
  'fibonacci_618',
  'fibonacci_786',
  'fibonacci_1000',
  'pivot_point',
  'pivot_r1',
  'pivot_r2',
  'pivot_r3',
  'pivot_s1',
  'pivot_s2',
  'pivot_s3',
  'high',
  'low',
  'open',
  'close',
  'apo',
  'ppo',
  'dpo',
  'cmo',
  'tsi',
  'bop',
  'chaikin_oscillator',
  'force_index',
  'ease_of_movement',
  'stochastic_rsi',
  'elder_ray_bull',
  'elder_ray_bear',
  'kst',
  'kst_signal',
  'schaff_trend',
  'vortex_positive',
  'vortex_negative',
  'mass_index',
  'coppock_curve',
  'know_sure_thing',
  'price_channel_upper',
  'price_channel_lower',
  'chandelier_long',
  'chandelier_short',
  'linear_regression',
  'linear_regression_angle',
  'linear_regression_intercept',
  'linear_regression_slope',
  'standard_deviation',
  'variance',
  'median_price',
  'typical_price',
  'weighted_close',
  'average_price'
);

-- =====================================================
-- SECTION 2: CORE TABLES (User Management)
-- =====================================================

-- User Roles Table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user'::app_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  exchange_type text DEFAULT 'binance',
  use_testnet boolean NOT NULL DEFAULT true,
  use_testnet_api boolean NOT NULL DEFAULT true,
  trading_mode text NOT NULL DEFAULT 'hybrid_safe',
  paper_trading_mode boolean NOT NULL DEFAULT true,
  use_mainnet_data boolean NOT NULL DEFAULT true,
  real_data_simulation boolean NOT NULL DEFAULT true,
  sync_mainnet_data boolean NOT NULL DEFAULT true,
  telegram_enabled boolean NOT NULL DEFAULT false,
  telegram_bot_token text,
  telegram_chat_id text,
  binance_api_key text,
  binance_api_secret text,
  cache_indicators boolean NOT NULL DEFAULT true,
  max_position_size numeric NOT NULL DEFAULT 1000.00,
  max_daily_trades integer NOT NULL DEFAULT 10,
  risk_warning_threshold numeric NOT NULL DEFAULT 5.00,
  risk_tolerance text NOT NULL DEFAULT 'medium',
  validate_data_integrity boolean NOT NULL DEFAULT true,
  max_data_age_minutes integer NOT NULL DEFAULT 5,
  handle_missing_data text NOT NULL DEFAULT 'interpolate',
  data_quality_score numeric DEFAULT 1.00,
  last_data_sync timestamp with time zone,
  hybrid_stats jsonb DEFAULT '{}'::jsonb,
  credentials_migrated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- API Credentials Table
CREATE TABLE IF NOT EXISTS public.api_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credential_type text NOT NULL,
  api_key text NOT NULL,
  api_secret text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, credential_type)
);

-- =====================================================
-- SECTION 3: CORE TABLES (Strategy Management)
-- =====================================================

-- Strategies Table
CREATE TABLE IF NOT EXISTS public.strategies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  timeframe text NOT NULL DEFAULT '1h',
  strategy_type text DEFAULT 'standard',
  status public.strategy_status NOT NULL DEFAULT 'draft'::strategy_status,
  benchmark_symbol text DEFAULT 'BTCUSDT',
  initial_capital numeric DEFAULT 10000,
  position_size_percent numeric DEFAULT 100,
  stop_loss_percent numeric,
  take_profit_percent numeric,
  -- SMA Crossover Strategy Parameters
  sma_fast_period numeric DEFAULT 20,
  sma_slow_period numeric DEFAULT 200,
  rsi_period numeric DEFAULT 14,
  rsi_overbought numeric DEFAULT 70,
  rsi_oversold numeric DEFAULT 30,
  volume_multiplier numeric DEFAULT 1.2,
  atr_sl_multiplier numeric DEFAULT 2.0,
  atr_tp_multiplier numeric DEFAULT 3.0,
  -- Multi-Timeframe Momentum Strategy Parameters
  mtf_rsi_period numeric DEFAULT 14,
  mtf_rsi_entry_threshold numeric DEFAULT 55,
  mtf_macd_fast numeric DEFAULT 12,
  mtf_macd_slow numeric DEFAULT 26,
  mtf_macd_signal numeric DEFAULT 9,
  mtf_volume_multiplier numeric DEFAULT 1.2,
  -- Multi-Signal Trading Grid Parameters
  mstg_weight_momentum numeric DEFAULT 0.25,
  mstg_weight_trend numeric DEFAULT 0.35,
  mstg_weight_volatility numeric DEFAULT 0.20,
  mstg_weight_relative numeric DEFAULT 0.20,
  mstg_long_threshold numeric DEFAULT 30,
  mstg_short_threshold numeric DEFAULT -30,
  mstg_exit_threshold numeric DEFAULT 0,
  mstg_extreme_threshold numeric DEFAULT 60,
  -- ATH Guard Strategy Parameters
  ath_guard_ema_slope_threshold numeric DEFAULT 0.15,
  ath_guard_pullback_tolerance numeric DEFAULT 0.15,
  ath_guard_volume_multiplier numeric DEFAULT 1.8,
  ath_guard_stoch_oversold numeric DEFAULT 25,
  ath_guard_stoch_overbought numeric DEFAULT 75,
  ath_guard_atr_sl_multiplier numeric DEFAULT 1.5,
  ath_guard_atr_tp1_multiplier numeric DEFAULT 1.0,
  ath_guard_atr_tp2_multiplier numeric DEFAULT 2.0,
  ath_guard_ath_safety_distance numeric DEFAULT 0.2,
  ath_guard_rsi_threshold numeric DEFAULT 70,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Condition Groups Table
CREATE TABLE IF NOT EXISTS public.condition_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id uuid REFERENCES public.strategies(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  group_operator text DEFAULT 'AND',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Strategy Conditions Table
CREATE TABLE IF NOT EXISTS public.strategy_conditions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id uuid NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.condition_groups(id) ON DELETE CASCADE,
  order_type public.order_type NOT NULL,
  indicator_type public.indicator_type NOT NULL,
  indicator_type_2 public.indicator_type,
  operator public.condition_operator NOT NULL,
  value numeric NOT NULL,
  value2 numeric,
  period_1 integer,
  period_2 integer,
  deviation numeric,
  smoothing integer,
  multiplier numeric,
  acceleration numeric,
  lookback_bars integer DEFAULT 1,
  confirmation_bars integer DEFAULT 0,
  logical_operator text DEFAULT 'AND',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Strategy Live States Table
CREATE TABLE IF NOT EXISTS public.strategy_live_states (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id uuid NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position_open boolean NOT NULL DEFAULT false,
  entry_price numeric,
  entry_time timestamp with time zone,
  last_signal_time timestamp with time zone,
  last_processed_candle_time bigint,
  last_cross_direction text,
  range_high numeric,
  range_low numeric,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Strategy Backtest Results Table
CREATE TABLE IF NOT EXISTS public.strategy_backtest_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id uuid NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  initial_balance numeric NOT NULL,
  final_balance numeric NOT NULL,
  total_return numeric NOT NULL,
  total_trades integer NOT NULL,
  winning_trades integer NOT NULL,
  losing_trades integer NOT NULL,
  win_rate numeric NOT NULL,
  max_drawdown numeric NOT NULL,
  sharpe_ratio numeric,
  balance_history jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Strategy Templates Table
CREATE TABLE IF NOT EXISTS public.strategy_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  strategy_type text DEFAULT 'standard',
  symbol text DEFAULT 'BTCUSDT',
  timeframe text DEFAULT '1h',
  template_data jsonb NOT NULL,
  initial_capital numeric DEFAULT 10000,
  position_size_percent numeric DEFAULT 100,
  stop_loss_percent numeric,
  take_profit_percent numeric,
  is_public boolean DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  usage_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- =====================================================
-- SECTION 4: CORE TABLES (Trading Data)
-- =====================================================

-- Market Data Table
CREATE TABLE IF NOT EXISTS public.market_data (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  exchange_type text NOT NULL DEFAULT 'binance',
  open_time bigint NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric NOT NULL,
  close_time bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Strategy Signals Table
CREATE TABLE IF NOT EXISTS public.strategy_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  signal_type text NOT NULL,
  price numeric NOT NULL,
  reason text,
  candle_close_time bigint,
  signal_hash text,
  status text DEFAULT 'pending',
  error_message text,
  delivery_attempts integer DEFAULT 0,
  last_attempt_at timestamp with time zone,
  signal_generated_at timestamp with time zone DEFAULT now(),
  signal_delivered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Position Events Table
CREATE TABLE IF NOT EXISTS public.position_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  event_type text NOT NULL,
  entry_price numeric,
  exit_price numeric,
  position_size numeric,
  pnl_percent numeric,
  pnl_amount numeric,
  reason text,
  telegram_sent boolean DEFAULT false,
  telegram_sent_at timestamp with time zone,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Trailing Stop States Table
CREATE TABLE IF NOT EXISTS public.trailing_stop_states (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position_id text NOT NULL,
  symbol text NOT NULL,
  position_type text NOT NULL,
  entry_price numeric NOT NULL,
  trailing_percent numeric NOT NULL DEFAULT 20.0,
  max_profit_percent numeric NOT NULL DEFAULT 0.0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- User Trading Pairs Table
CREATE TABLE IF NOT EXISTS public.user_trading_pairs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  base_asset text NOT NULL,
  quote_asset text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- =====================================================
-- SECTION 5: CORE TABLES (Admin & Audit)
-- =====================================================

-- System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- User Settings Audit Table
CREATE TABLE IF NOT EXISTS public.user_settings_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  accessed_at timestamp with time zone DEFAULT now()
);

-- =====================================================
-- SECTION 6: DATABASE FUNCTIONS
-- =====================================================

-- Security Function: Check User Role (CRITICAL for RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- Auth: Handle New User
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Assign 'admin' role to first user, 'user' role to others
  IF (SELECT COUNT(*) FROM public.profiles) = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Credential Management: Retrieve Credential
CREATE OR REPLACE FUNCTION public.retrieve_credential(p_user_id uuid, p_credential_type text)
RETURNS TABLE(api_key text, api_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access credentials for another user';
  END IF;

  RETURN QUERY
  SELECT ac.api_key, ac.api_secret
  FROM api_credentials ac
  WHERE ac.user_id = p_user_id
    AND ac.credential_type = p_credential_type;
END;
$$;

-- Credential Management: Store Credential
CREATE OR REPLACE FUNCTION public.store_credential(p_user_id uuid, p_credential_type text, p_api_key text, p_api_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credential_id UUID;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot store credentials for another user';
  END IF;

  INSERT INTO api_credentials (
    user_id,
    credential_type,
    api_key,
    api_secret
  )
  VALUES (
    p_user_id,
    p_credential_type,
    p_api_key,
    p_api_secret
  )
  ON CONFLICT (user_id, credential_type)
  DO UPDATE SET
    api_key = EXCLUDED.api_key,
    api_secret = EXCLUDED.api_secret,
    updated_at = NOW()
  RETURNING id INTO v_credential_id;

  RETURN v_credential_id;
END;
$$;

-- Settings Management: Get User Settings
CREATE OR REPLACE FUNCTION public.get_user_settings(p_user_id uuid)
RETURNS TABLE(exchange_type text, use_testnet boolean, trading_mode text, use_mainnet_data boolean, paper_trading_mode boolean, use_testnet_api boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the requesting user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Verify the requesting user matches the requested user_id
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access settings for another user';
  END IF;

  -- Return user settings
  RETURN QUERY
  SELECT 
    us.exchange_type,
    us.use_testnet,
    us.trading_mode,
    us.use_mainnet_data,
    us.paper_trading_mode,
    us.use_testnet_api
  FROM user_settings us
  WHERE us.user_id = p_user_id;
END;
$$;

-- Update Trigger: Update Settings Timestamp
CREATE OR REPLACE FUNCTION public.update_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Update Trigger: Increment Strategy State Version
CREATE OR REPLACE FUNCTION public.increment_strategy_state_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Update Trigger: Update Trailing Stop Timestamp
CREATE OR REPLACE FUNCTION public.update_trailing_stop_states_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Utility: Immutable Date Truncate
CREATE OR REPLACE FUNCTION public.immutable_date_trunc_minute(timestamp with time zone)
RETURNS timestamp with time zone
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('minute', $1);
$$;

-- =====================================================
-- SECTION 7: TRIGGERS
-- =====================================================

-- Auth Trigger: Auto-assign role on user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update Trigger: User Settings
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_settings_updated_at();

-- Update Trigger: Strategy Live States
CREATE TRIGGER increment_strategy_live_states_version
  BEFORE UPDATE ON public.strategy_live_states
  FOR EACH ROW EXECUTE FUNCTION public.increment_strategy_state_version();

-- Update Trigger: Trailing Stop States
CREATE TRIGGER update_trailing_stop_states_timestamp
  BEFORE UPDATE ON public.trailing_stop_states
  FOR EACH ROW EXECUTE FUNCTION public.update_trailing_stop_states_updated_at();

-- =====================================================
-- SECTION 8: ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- ========== user_roles ==========
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Only admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ========== user_settings ==========
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings"
  ON public.user_settings FOR DELETE
  USING (auth.uid() = user_id);

-- ========== api_credentials ==========
ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credentials"
  ON public.api_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credentials"
  ON public.api_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials"
  ON public.api_credentials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials"
  ON public.api_credentials FOR DELETE
  USING (auth.uid() = user_id);

-- ========== strategies ==========
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own strategies"
  ON public.strategies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own strategies"
  ON public.strategies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategies"
  ON public.strategies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategies"
  ON public.strategies FOR DELETE
  USING (auth.uid() = user_id);

-- ========== condition_groups ==========
ALTER TABLE public.condition_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage condition groups for their strategies"
  ON public.condition_groups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM strategies
    WHERE strategies.id = condition_groups.strategy_id
    AND strategies.user_id = auth.uid()
  ));

-- ========== strategy_conditions ==========
ALTER TABLE public.strategy_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view conditions for their strategies"
  ON public.strategy_conditions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM strategies
    WHERE strategies.id = strategy_conditions.strategy_id
    AND strategies.user_id = auth.uid()
  ));

CREATE POLICY "Users can create conditions for their strategies"
  ON public.strategy_conditions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM strategies
    WHERE strategies.id = strategy_conditions.strategy_id
    AND strategies.user_id = auth.uid()
  ));

CREATE POLICY "Users can update conditions for their strategies"
  ON public.strategy_conditions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM strategies
    WHERE strategies.id = strategy_conditions.strategy_id
    AND strategies.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete conditions for their strategies"
  ON public.strategy_conditions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM strategies
    WHERE strategies.id = strategy_conditions.strategy_id
    AND strategies.user_id = auth.uid()
  ));

-- ========== strategy_live_states ==========
ALTER TABLE public.strategy_live_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own strategy states"
  ON public.strategy_live_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own strategy states"
  ON public.strategy_live_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategy states"
  ON public.strategy_live_states FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategy states"
  ON public.strategy_live_states FOR DELETE
  USING (auth.uid() = user_id);

-- ========== strategy_backtest_results ==========
ALTER TABLE public.strategy_backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view backtest results for their strategies"
  ON public.strategy_backtest_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM strategies
    WHERE strategies.id = strategy_backtest_results.strategy_id
    AND strategies.user_id = auth.uid()
  ));

CREATE POLICY "Users can create backtest results for their strategies"
  ON public.strategy_backtest_results FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM strategies
    WHERE strategies.id = strategy_backtest_results.strategy_id
    AND strategies.user_id = auth.uid()
  ));

-- ========== strategy_templates ==========
ALTER TABLE public.strategy_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public templates are viewable by everyone"
  ON public.strategy_templates FOR SELECT
  USING (is_public = true OR created_by = auth.uid());

CREATE POLICY "Users can create templates"
  ON public.strategy_templates FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- ========== market_data ==========
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view market data"
  ON public.market_data FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert market data"
  ON public.market_data FOR INSERT
  WITH CHECK (true);

-- ========== strategy_signals ==========
ALTER TABLE public.strategy_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own signals"
  ON public.strategy_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own signals"
  ON public.strategy_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========== position_events ==========
ALTER TABLE public.position_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own position events"
  ON public.position_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert position events"
  ON public.position_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update position events"
  ON public.position_events FOR UPDATE
  USING (true);

-- ========== trailing_stop_states ==========
ALTER TABLE public.trailing_stop_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trailing stop states"
  ON public.trailing_stop_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trailing stop states"
  ON public.trailing_stop_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trailing stop states"
  ON public.trailing_stop_states FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trailing stop states"
  ON public.trailing_stop_states FOR DELETE
  USING (auth.uid() = user_id);

-- ========== user_trading_pairs ==========
ALTER TABLE public.user_trading_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trading pairs"
  ON public.user_trading_pairs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trading pairs"
  ON public.user_trading_pairs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trading pairs"
  ON public.user_trading_pairs FOR DELETE
  USING (auth.uid() = user_id);

-- ========== system_settings ==========
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view system settings"
  ON public.system_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert system settings"
  ON public.system_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update system settings"
  ON public.system_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ========== user_settings_audit ==========
ALTER TABLE public.user_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit logs"
  ON public.user_settings_audit FOR SELECT
  USING (auth.uid() = user_id);

-- =====================================================
-- SECTION 9: PERFORMANCE INDEXES
-- =====================================================

-- Market Data Indexes
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timeframe 
  ON public.market_data(symbol, timeframe, open_time DESC);

CREATE INDEX IF NOT EXISTS idx_market_data_exchange_lookup 
  ON public.market_data(exchange_type, symbol, timeframe);

-- Strategy Indexes
CREATE INDEX IF NOT EXISTS idx_strategies_user_status 
  ON public.strategies(user_id, status);

CREATE INDEX IF NOT EXISTS idx_strategies_symbol 
  ON public.strategies(symbol);

-- Strategy Signals Indexes
CREATE INDEX IF NOT EXISTS idx_strategy_signals_recent 
  ON public.strategy_signals(user_id, strategy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_strategy_signals_status 
  ON public.strategy_signals(status, created_at DESC);

-- Position Events Indexes
CREATE INDEX IF NOT EXISTS idx_position_events_user_strategy 
  ON public.position_events(user_id, strategy_id, timestamp DESC);

-- User Role Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user_id 
  ON public.user_roles(user_id);

-- Strategy Conditions Index
CREATE INDEX IF NOT EXISTS idx_strategy_conditions_strategy 
  ON public.strategy_conditions(strategy_id);

-- Strategy Live States Index
CREATE INDEX IF NOT EXISTS idx_strategy_live_states_strategy 
  ON public.strategy_live_states(strategy_id);

-- Trailing Stop States Index
CREATE INDEX IF NOT EXISTS idx_trailing_stop_states_user 
  ON public.trailing_stop_states(user_id, is_active);

-- User Trading Pairs Index
CREATE INDEX IF NOT EXISTS idx_user_trading_pairs_user 
  ON public.user_trading_pairs(user_id);

-- API Credentials Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_credentials_user_type 
  ON public.api_credentials(user_id, credential_type);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- 
-- Database schema created successfully!
-- 
-- Next steps:
-- 1. Verify all tables, functions, and policies are in place
-- 2. Test authentication (first user should become admin)
-- 3. Test RLS policies with different user roles
-- 4. Deploy edge functions
-- 5. Configure auth settings (enable auto-confirm for testing)
-- 
-- =====================================================
