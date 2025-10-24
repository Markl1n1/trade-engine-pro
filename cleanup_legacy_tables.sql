-- =====================================================
-- TRADE ENGINE PRO - Legacy Cleanup Migration
-- =====================================================
-- 
-- This migration removes legacy/unused tables and functions
-- that are no longer needed in the codebase.
--
-- USAGE:
--   For existing database: psql "postgresql://..." -f cleanup_legacy_tables.sql
--
-- REMOVES:
--   - 4 legacy tables (security_audit_log, credential_access_log, exchange_metrics, system_health_logs)
--   - 5 legacy functions (get_user_api_credentials, log_api_key_access, log_sensitive_access, cleanup functions)
--
-- ⚠️  WARNING: This is a destructive operation. Data will be permanently deleted.
--     Make sure you have a backup before running this migration.
--
-- =====================================================

-- =====================================================
-- SECTION 1: DROP LEGACY TABLES
-- =====================================================

-- Drop security_audit_log (replaced by user_settings_audit)
DROP TABLE IF EXISTS public.security_audit_log CASCADE;
COMMENT ON SCHEMA public IS 'Removed security_audit_log table - replaced by user_settings_audit';

-- Drop credential_access_log (unused)
DROP TABLE IF EXISTS public.credential_access_log CASCADE;
COMMENT ON SCHEMA public IS 'Removed credential_access_log table - logging moved to user_settings_audit';

-- Drop exchange_metrics (unused)
DROP TABLE IF EXISTS public.exchange_metrics CASCADE;
COMMENT ON SCHEMA public IS 'Removed exchange_metrics table - not used in current implementation';

-- Drop system_health_logs (replaced by console logging)
DROP TABLE IF EXISTS public.system_health_logs CASCADE;
COMMENT ON SCHEMA public IS 'Removed system_health_logs table - health monitoring moved to console logs';

-- =====================================================
-- SECTION 2: DROP LEGACY FUNCTIONS
-- =====================================================

-- Drop get_user_api_credentials (replaced by retrieve_credential)
DROP FUNCTION IF EXISTS public.get_user_api_credentials(uuid);

-- Drop log_api_key_access (unused security audit function)
DROP FUNCTION IF EXISTS public.log_api_key_access();

-- Drop log_sensitive_access (unused security audit function)
DROP FUNCTION IF EXISTS public.log_sensitive_access();

-- Drop cleanup_old_buffered_signals (signal_buffer table doesn't exist)
DROP FUNCTION IF EXISTS public.cleanup_old_buffered_signals();

-- Drop cleanup_old_health_logs (system_health_logs table removed)
DROP FUNCTION IF EXISTS public.cleanup_old_health_logs();

-- =====================================================
-- SECTION 3: VERIFICATION
-- =====================================================

-- Verify tables are dropped
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'security_audit_log',
      'credential_access_log',
      'exchange_metrics',
      'system_health_logs'
    );
    
  IF table_count > 0 THEN
    RAISE WARNING 'Some legacy tables still exist: % tables remaining', table_count;
  ELSE
    RAISE NOTICE 'All legacy tables successfully removed';
  END IF;
END $$;

-- Verify functions are dropped
DO $$
DECLARE
  function_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO function_count
  FROM pg_proc
  WHERE proname IN (
    'get_user_api_credentials',
    'log_api_key_access',
    'log_sensitive_access',
    'cleanup_old_buffered_signals',
    'cleanup_old_health_logs'
  );
    
  IF function_count > 0 THEN
    RAISE WARNING 'Some legacy functions still exist: % functions remaining', function_count;
  ELSE
    RAISE NOTICE 'All legacy functions successfully removed';
  END IF;
END $$;

-- =====================================================
-- CLEANUP COMPLETE
-- =====================================================
-- 
-- Legacy database objects removed successfully!
-- 
-- Removed Tables:
-- ✓ security_audit_log
-- ✓ credential_access_log
-- ✓ exchange_metrics
-- ✓ system_health_logs
--
-- Removed Functions:
-- ✓ get_user_api_credentials
-- ✓ log_api_key_access
-- ✓ log_sensitive_access
-- ✓ cleanup_old_buffered_signals
-- ✓ cleanup_old_health_logs
--
-- Next steps:
-- 1. Verify edge functions no longer reference removed tables
-- 2. Test application functionality
-- 3. Monitor logs for any errors
--
-- =====================================================
