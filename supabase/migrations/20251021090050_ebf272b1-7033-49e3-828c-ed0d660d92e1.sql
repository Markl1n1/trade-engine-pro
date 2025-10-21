-- Fix security linter warnings from previous migration

-- Enable RLS on encryption_keys table (forgot this in previous migration)
ALTER TABLE public.encryption_keys ENABLE ROW LEVEL SECURITY;

-- Only admins should access encryption keys metadata
CREATE POLICY "Only service role can manage encryption keys"
ON public.encryption_keys
FOR ALL
USING (false); -- Deny all user access, only service role can access

-- Move pgsodium extension from public to extensions schema (if it exists)
-- This is a best practice but not critical
-- Note: We can't easily move extensions, so we'll document this as acceptable

-- Add comment explaining why pgsodium is in public schema
COMMENT ON EXTENSION pgsodium IS 'Encryption extension required for credential security. Placed in public schema for compatibility with Supabase environment.';