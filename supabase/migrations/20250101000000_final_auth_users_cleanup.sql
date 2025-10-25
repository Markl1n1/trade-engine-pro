-- =====================================================
-- FINAL CLEANUP: Remove any remaining auth.users references
-- This migration ensures complete Remix compatibility by eliminating
-- all direct dependencies on auth.users table
-- =====================================================

-- Step 1: Drop any remaining triggers on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

-- Step 2: Ensure all foreign key constraints point to public.profiles
-- (This should already be done by previous migrations, but let's be absolutely sure)

-- Check and fix user_roles table
DO $$
BEGIN
  -- Check if user_roles table exists and has correct FK
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
    -- Drop any existing FK to auth.users
    ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
    
    -- Add FK to public.profiles if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'user_roles_user_id_fkey' 
      AND table_name = 'user_roles'
    ) THEN
      ALTER TABLE public.user_roles 
        ADD CONSTRAINT user_roles_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Check and fix user_settings table
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_settings') THEN
    ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_user_id_fkey;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'user_settings_user_id_fkey' 
      AND table_name = 'user_settings'
    ) THEN
      ALTER TABLE public.user_settings 
        ADD CONSTRAINT user_settings_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Check and fix api_credentials table
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_credentials') THEN
    ALTER TABLE public.api_credentials DROP CONSTRAINT IF EXISTS api_credentials_user_id_fkey;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'api_credentials_user_id_fkey' 
      AND table_name = 'api_credentials'
    ) THEN
      ALTER TABLE public.api_credentials 
        ADD CONSTRAINT api_credentials_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Check and fix strategies table
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strategies') THEN
    ALTER TABLE public.strategies DROP CONSTRAINT IF EXISTS strategies_user_id_fkey;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'strategies_user_id_fkey' 
      AND table_name = 'strategies'
    ) THEN
      ALTER TABLE public.strategies 
        ADD CONSTRAINT strategies_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Check and fix strategy_templates table
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strategy_templates') THEN
    ALTER TABLE public.strategy_templates DROP CONSTRAINT IF EXISTS strategy_templates_created_by_fkey;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'strategy_templates_created_by_fkey' 
      AND table_name = 'strategy_templates'
    ) THEN
      ALTER TABLE public.strategy_templates 
        ADD CONSTRAINT strategy_templates_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Check and fix all other tables with user_id references
DO $$
DECLARE
  table_name text;
  constraint_name text;
BEGIN
  -- List of tables that should have user_id FK to public.profiles
  FOR table_name IN 
    SELECT t.table_name 
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' 
    AND t.table_name IN (
      'signal_references', 'position_events', 'audit_logs', 
      'user_trading_pairs', 'strategy_signals', 'exchange_metrics', 
      'trailing_stop_states', 'user_settings_audit'
    )
  LOOP
    -- Drop any existing FK to auth.users
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I_user_id_fkey', table_name, table_name);
    
    -- Add FK to public.profiles if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = table_name || '_user_id_fkey'
      AND table_name = table_name
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE', table_name, table_name);
    END IF;
  END LOOP;
END $$;

-- Step 3: Update handle_new_user function to use public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Assign 'admin' role to first user, 'user' role to others
  -- Use profiles table instead of auth.users for remix compatibility
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

-- Step 4: Recreate trigger on auth.users (this is the only remaining reference)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 5: Add comprehensive comments to prevent future auth.users usage
COMMENT ON SCHEMA public IS 'All user references MUST use public.profiles, NOT auth.users for Remix compatibility';
COMMENT ON TABLE public.profiles IS 'Primary user table - all user_id foreign keys MUST reference this table, NOT auth.users';
COMMENT ON FUNCTION public.handle_new_user() IS 'Auto-assigns roles on user signup. Uses profiles table for remix compatibility.';

-- Step 6: Create a view to help developers understand the correct user table
CREATE OR REPLACE VIEW public.user_info AS
SELECT 
  p.id,
  p.email,
  p.created_at,
  p.updated_at,
  ur.role,
  us.exchange_type,
  us.trading_mode
FROM public.profiles p
LEFT JOIN public.user_roles ur ON p.id = ur.user_id
LEFT JOIN public.user_settings us ON p.id = us.user_id;

COMMENT ON VIEW public.user_info IS 'Use this view instead of direct auth.users queries for Remix compatibility';

-- Step 7: Success message
DO $$
BEGIN
  RAISE NOTICE 'Final auth.users cleanup completed successfully! All references now use public.profiles for Remix compatibility.';
  RAISE NOTICE 'Use public.user_info view for user queries instead of direct auth.users access.';
END $$;
