-- Drop the orphaned trigger that's causing the error
DROP TRIGGER IF EXISTS encrypt_credentials_on_update ON public.user_settings;

-- Drop the old auto-encryption function
DROP FUNCTION IF EXISTS public.auto_encrypt_credentials();

-- Clean up old migration helper functions (no longer needed)
DROP FUNCTION IF EXISTS public.migrate_user_credentials_to_encrypted(uuid);
DROP FUNCTION IF EXISTS public.migrate_all_credentials();
DROP FUNCTION IF EXISTS public.verify_credentials_encrypted();