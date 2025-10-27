-- =====================================================
-- COMPREHENSIVE FIX: Migrate ALL Foreign Keys from auth.users to public.profiles
-- This migration fixes the remix issue by ensuring profiles table is standalone
-- and all user_id foreign keys reference public.profiles instead of auth.users
-- =====================================================

-- Step 1: Drop all existing foreign key constraints to auth.users
-- (These may or may not exist depending on which migrations have run)

-- Drop FK on signal_references if exists
ALTER TABLE IF EXISTS public.signal_references 
  DROP CONSTRAINT IF EXISTS signal_references_user_id_fkey;

-- Drop FK on position_events if exists  
ALTER TABLE IF EXISTS public.position_events 
  DROP CONSTRAINT IF EXISTS position_events_user_id_fkey;

-- Drop FK on audit_logs if exists
ALTER TABLE IF EXISTS public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- Drop FK on strategy_templates if exists
ALTER TABLE IF EXISTS public.strategy_templates 
  DROP CONSTRAINT IF EXISTS strategy_templates_created_by_fkey;

-- Drop FK on user_trading_pairs if exists
ALTER TABLE IF EXISTS public.user_trading_pairs 
  DROP CONSTRAINT IF EXISTS user_trading_pairs_user_id_fkey;

-- Drop FK on strategy_signals if exists
ALTER TABLE IF EXISTS public.strategy_signals 
  DROP CONSTRAINT IF EXISTS strategy_signals_user_id_fkey;

-- Drop FK on exchange_metrics if exists
ALTER TABLE IF EXISTS public.exchange_metrics 
  DROP CONSTRAINT IF EXISTS exchange_metrics_user_id_fkey;

-- Drop FK on trailing_stop_states if exists
ALTER TABLE IF EXISTS public.trailing_stop_states 
  DROP CONSTRAINT IF EXISTS trailing_stop_states_user_id_fkey;

-- Step 2: Ensure profiles table exists (idempotent - safe to run multiple times)
-- Create WITHOUT any FK to auth.users to make it remix-safe
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create RLS policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Step 3: Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Step 4: Migrate existing users to profiles (idempotent)
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Step 5: Add NEW foreign key constraints pointing to public.profiles
-- Only add if the table exists

-- signal_references → profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'signal_references') THEN
    ALTER TABLE public.signal_references 
      ADD CONSTRAINT signal_references_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- position_events → profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'position_events') THEN
    ALTER TABLE public.position_events 
      ADD CONSTRAINT position_events_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- audit_logs → profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    ALTER TABLE public.audit_logs 
      ADD CONSTRAINT audit_logs_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- strategy_templates → profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strategy_templates') THEN
    ALTER TABLE public.strategy_templates 
      ADD CONSTRAINT strategy_templates_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- user_trading_pairs → profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_trading_pairs') THEN
    ALTER TABLE public.user_trading_pairs 
      ADD CONSTRAINT user_trading_pairs_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- strategy_signals → profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strategy_signals') THEN
    ALTER TABLE public.strategy_signals 
      ADD CONSTRAINT strategy_signals_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- exchange_metrics → profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'exchange_metrics') THEN
    ALTER TABLE public.exchange_metrics 
      ADD CONSTRAINT exchange_metrics_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- trailing_stop_states → profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trailing_stop_states') THEN
    ALTER TABLE public.trailing_stop_states 
      ADD CONSTRAINT trailing_stop_states_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 6: Add helpful comments
COMMENT ON TABLE public.profiles IS 'User profiles - all user_id foreign keys MUST reference this table, NOT auth.users. This ensures remix compatibility.';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully! All foreign keys now reference public.profiles instead of auth.users.';
END $$;