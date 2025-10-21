-- Drop the old encryption functions that use pgsodium directly
DROP FUNCTION IF EXISTS public.encrypt_credential(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.decrypt_credential(uuid, text, text);

-- Create simplified functions that use Supabase Vault instead
-- Vault handles encryption automatically and has proper permissions

CREATE OR REPLACE FUNCTION public.store_credential(
  p_user_id uuid,
  p_credential_type text,
  p_api_key text,
  p_api_secret text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.retrieve_credential(
  p_user_id uuid,
  p_credential_type text
)
RETURNS TABLE(api_key text, api_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key_secret_name TEXT;
  v_secret_secret_name TEXT;
  v_api_key TEXT;
  v_api_secret TEXT;
BEGIN
  -- Verify the requesting user is the owner (for service role, skip this check)
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access credentials for another user';
  END IF;

  -- Create secret names
  v_key_secret_name := p_user_id::text || '_' || p_credential_type || '_key';
  v_secret_secret_name := p_user_id::text || '_' || p_credential_type || '_secret';

  -- Retrieve from vault
  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = v_key_secret_name;

  SELECT decrypted_secret INTO v_api_secret
  FROM vault.decrypted_secrets
  WHERE name = v_secret_secret_name;

  IF v_api_key IS NULL OR v_api_secret IS NULL THEN
    -- Log failed access attempt
    INSERT INTO public.credential_access_log (user_id, credential_type, access_source, success)
    VALUES (p_user_id, p_credential_type, 'retrieve', false);
    RETURN;
  END IF;

  -- Log successful access
  INSERT INTO public.credential_access_log (user_id, credential_type, access_source, success)
  VALUES (p_user_id, p_credential_type, 'retrieve', true);

  -- Return decrypted credentials
  RETURN QUERY SELECT v_api_key, v_api_secret;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.store_credential(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_credential(uuid, text) TO authenticated;

-- Update encrypted_credentials table structure (remove encryption fields that are now in vault)
ALTER TABLE public.encrypted_credentials DROP COLUMN IF EXISTS encrypted_api_key;
ALTER TABLE public.encrypted_credentials DROP COLUMN IF EXISTS encrypted_api_secret;
ALTER TABLE public.encrypted_credentials DROP COLUMN IF EXISTS key_nonce;
ALTER TABLE public.encrypted_credentials DROP COLUMN IF EXISTS secret_nonce;