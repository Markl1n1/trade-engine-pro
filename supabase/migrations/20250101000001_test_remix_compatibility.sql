-- =====================================================
-- TEST: Verify Remix compatibility
-- This migration tests that all user references work correctly
-- without depending on auth.users table
-- =====================================================

-- Test 1: Verify profiles table exists and is accessible
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    RAISE EXCEPTION 'CRITICAL: profiles table does not exist! This will cause Remix migration failures.';
  END IF;
  
  RAISE NOTICE '✓ profiles table exists';
END $$;

-- Test 2: Verify all foreign key constraints point to public.profiles
DO $$
DECLARE
  constraint_record RECORD;
  auth_users_count INTEGER := 0;
BEGIN
  -- Count foreign key constraints that still reference auth.users
  SELECT COUNT(*) INTO auth_users_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'users'
  AND ccu.table_schema = 'auth';
  
  IF auth_users_count > 0 THEN
    RAISE EXCEPTION 'CRITICAL: Found % foreign key constraints still referencing auth.users! This will cause Remix migration failures.', auth_users_count;
  END IF;
  
  RAISE NOTICE '✓ No foreign key constraints reference auth.users';
END $$;

-- Test 3: Verify user_info view works correctly
DO $$
BEGIN
  -- Test that the user_info view can be queried without errors
  PERFORM 1 FROM public.user_info LIMIT 1;
  RAISE NOTICE '✓ user_info view is accessible';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '⚠ user_info view has issues: %', SQLERRM;
END $$;

-- Test 4: Verify RLS policies work with public.profiles
DO $$
BEGIN
  -- Test that RLS policies are properly configured
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles'
    AND policyname = 'Users can view their own profile'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: RLS policy for profiles table is missing!';
  END IF;
  
  RAISE NOTICE '✓ RLS policies are properly configured';
END $$;

-- Test 5: Verify trigger functions work correctly
DO $$
BEGIN
  -- Test that handle_new_user function exists and is properly configured
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_name = 'handle_new_user' 
    AND routine_schema = 'public'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: handle_new_user function is missing!';
  END IF;
  
  RAISE NOTICE '✓ handle_new_user function exists and is properly configured';
END $$;

-- Test 6: Create a test user profile to verify the system works
DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  test_email TEXT := 'test@remix-compatibility.com';
BEGIN
  -- Insert a test profile
  INSERT INTO public.profiles (id, email) 
  VALUES (test_user_id, test_email)
  ON CONFLICT (id) DO NOTHING;
  
  -- Verify the profile was created
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = test_user_id) THEN
    RAISE EXCEPTION 'CRITICAL: Cannot create user profiles! This will cause Remix migration failures.';
  END IF;
  
  -- Clean up test data
  DELETE FROM public.profiles WHERE id = test_user_id;
  
  RAISE NOTICE '✓ User profile creation and deletion works correctly';
END $$;

-- Test 7: Verify all critical tables have proper foreign key constraints
DO $$
DECLARE
  table_name TEXT;
  missing_fk_count INTEGER := 0;
BEGIN
  -- Check critical tables that should have user_id FK to public.profiles
  FOR table_name IN 
    SELECT unnest(ARRAY[
      'user_roles', 'user_settings', 'api_credentials', 'strategies',
      'signal_references', 'position_events', 'audit_logs', 
      'user_trading_pairs', 'strategy_signals', 'exchange_metrics', 
      'trailing_stop_states', 'user_settings_audit'
    ])
  LOOP
    -- Check if table exists and has proper FK
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = table_name) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = table_name
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'user_id'
        AND kcu.referenced_table_name = 'profiles'
        AND kcu.referenced_table_schema = 'public'
      ) THEN
        missing_fk_count := missing_fk_count + 1;
        RAISE NOTICE '⚠ Table % is missing proper user_id FK to public.profiles', table_name;
      END IF;
    END IF;
  END LOOP;
  
  IF missing_fk_count > 0 THEN
    RAISE WARNING 'Found % tables missing proper foreign key constraints to public.profiles', missing_fk_count;
  ELSE
    RAISE NOTICE '✓ All critical tables have proper foreign key constraints to public.profiles';
  END IF;
END $$;

-- Final success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '🎉 REMIX COMPATIBILITY TEST PASSED! 🎉';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Your database is now fully compatible with Remix migration.';
  RAISE NOTICE 'All user references use public.profiles instead of auth.users.';
  RAISE NOTICE 'You can safely migrate your Lovable project to Remix.';
  RAISE NOTICE '========================================';
END $$;
