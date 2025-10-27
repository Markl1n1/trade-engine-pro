-- Grant usage on pgsodium schema to authenticated users
-- This allows them to call pgsodium functions through SECURITY DEFINER functions
GRANT USAGE ON SCHEMA pgsodium TO authenticated;

-- Ensure public schema is accessible
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant execute on our credential management functions
GRANT EXECUTE ON FUNCTION public.encrypt_credential(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_credential(uuid, text, text) TO authenticated;