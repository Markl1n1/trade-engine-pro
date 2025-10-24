-- =====================================================
-- PHASE 2: MIGRATE FOREIGN KEYS TO PROFILES (EXISTING TABLES ONLY)
-- =====================================================

-- 1. position_events
ALTER TABLE public.position_events 
  DROP CONSTRAINT IF EXISTS position_events_user_id_fkey;

ALTER TABLE public.position_events 
  ADD CONSTRAINT position_events_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. strategy_templates
ALTER TABLE public.strategy_templates 
  DROP CONSTRAINT IF EXISTS strategy_templates_created_by_fkey;

ALTER TABLE public.strategy_templates 
  ADD CONSTRAINT strategy_templates_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. user_trading_pairs
ALTER TABLE public.user_trading_pairs 
  DROP CONSTRAINT IF EXISTS user_trading_pairs_user_id_fkey;

ALTER TABLE public.user_trading_pairs 
  ADD CONSTRAINT user_trading_pairs_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4. strategy_signals
ALTER TABLE public.strategy_signals 
  DROP CONSTRAINT IF EXISTS strategy_signals_user_id_fkey;

ALTER TABLE public.strategy_signals 
  ADD CONSTRAINT strategy_signals_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 5. trailing_stop_states
ALTER TABLE public.trailing_stop_states 
  DROP CONSTRAINT IF EXISTS trailing_stop_states_user_id_fkey;

ALTER TABLE public.trailing_stop_states 
  ADD CONSTRAINT trailing_stop_states_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add comment
COMMENT ON TABLE public.profiles IS 'All user-related foreign keys now reference this table instead of auth.users';