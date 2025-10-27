-- =====================================================
-- TRADE ENGINE PRO - Legacy Cleanup Migration
-- =====================================================

-- Drop security_audit_log (replaced by user_settings_audit)
DROP TABLE IF EXISTS public.security_audit_log CASCADE;

-- Drop credential_access_log (unused)
DROP TABLE IF EXISTS public.credential_access_log CASCADE;

-- Drop exchange_metrics (unused)
DROP TABLE IF EXISTS public.exchange_metrics CASCADE;

-- Drop system_health_logs (replaced by console logging)
DROP TABLE IF EXISTS public.system_health_logs CASCADE;

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