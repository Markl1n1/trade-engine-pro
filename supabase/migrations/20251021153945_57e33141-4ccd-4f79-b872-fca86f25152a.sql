-- Grant necessary permissions for vault operations
GRANT USAGE ON SCHEMA pgsodium TO authenticated;
GRANT INSERT, UPDATE ON TABLE vault.secrets TO authenticated;
GRANT SELECT ON TABLE vault.decrypted_secrets TO authenticated;

-- Recreate store_credential function with proper vault access
CREATE OR REPLACE FUNCTION public.store_credential(p_user_id uuid, p_credential_type text, p_api_key text, p_api_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_credential_id UUID;
  v_key_secret_name TEXT;
  v_secret_secret_name TEXT;
BEGIN
  -- Verify the requesting user is the owner
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot store credentials for another user';
  END IF;

  -- Create unique secret names for vault
  v_key_secret_name := p_user_id::text || '_' || p_credential_type || '_key';
  v_secret_secret_name := p_user_id::text || '_' || p_credential_type || '_secret';

  -- Store in vault (vault.secrets table handles encryption automatically)
  INSERT INTO vault.secrets (name, secret)
  VALUES (v_key_secret_name, p_api_key)
  ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;

  INSERT INTO vault.secrets (name, secret)
  VALUES (v_secret_secret_name, p_api_secret)
  ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;

  -- Update encrypted_credentials table to track what's stored
  INSERT INTO public.encrypted_credentials (
    user_id,
    credential_type,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_credential_type,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, credential_type)
  DO UPDATE SET
    updated_at = NOW()
  RETURNING id INTO v_credential_id;

  -- Log the access
  INSERT INTO public.credential_access_log (user_id, credential_type, access_source, success)
  VALUES (p_user_id, p_credential_type, 'store', true);

  RETURN v_credential_id;
END;
$function$;