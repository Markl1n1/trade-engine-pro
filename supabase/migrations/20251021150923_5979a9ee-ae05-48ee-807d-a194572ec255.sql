-- Fix encrypt_credential function to include pgsodium in search path
CREATE OR REPLACE FUNCTION public.encrypt_credential(p_user_id uuid, p_credential_type text, p_api_key text, p_api_secret text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgsodium'
AS $function$
DECLARE
  v_credential_id UUID;
  v_key_nonce BYTEA;
  v_secret_nonce BYTEA;
  v_encrypted_key TEXT;
  v_encrypted_secret TEXT;
BEGIN
  -- Verify the requesting user is the owner
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot encrypt credentials for another user';
  END IF;

  -- Generate random nonces for encryption
  v_key_nonce := pgsodium.crypto_secretbox_noncegen();
  v_secret_nonce := pgsodium.crypto_secretbox_noncegen();

  -- Encrypt the credentials using pgsodium
  v_encrypted_key := encode(
    pgsodium.crypto_secretbox(
      p_api_key::bytea,
      v_key_nonce,
      pgsodium.crypto_generichash(p_user_id::text::bytea)
    ),
    'base64'
  );

  v_encrypted_secret := encode(
    pgsodium.crypto_secretbox(
      p_api_secret::bytea,
      v_secret_nonce,
      pgsodium.crypto_generichash(p_user_id::text::bytea)
    ),
    'base64'
  );

  -- Insert or update the encrypted credentials
  INSERT INTO public.encrypted_credentials (
    user_id,
    credential_type,
    encrypted_api_key,
    encrypted_api_secret,
    key_nonce,
    secret_nonce
  )
  VALUES (
    p_user_id,
    p_credential_type,
    v_encrypted_key,
    v_encrypted_secret,
    v_key_nonce,
    v_secret_nonce
  )
  ON CONFLICT (user_id, credential_type)
  DO UPDATE SET
    encrypted_api_key = EXCLUDED.encrypted_api_key,
    encrypted_api_secret = EXCLUDED.encrypted_api_secret,
    key_nonce = EXCLUDED.key_nonce,
    secret_nonce = EXCLUDED.secret_nonce,
    updated_at = NOW()
  RETURNING id INTO v_credential_id;

  RETURN v_credential_id;
END;
$function$;

-- Fix decrypt_credential function to include pgsodium in search path
CREATE OR REPLACE FUNCTION public.decrypt_credential(p_user_id uuid, p_credential_type text, p_access_source text DEFAULT 'unknown'::text)
 RETURNS TABLE(api_key text, api_secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgsodium'
AS $function$
DECLARE
  v_encrypted_key TEXT;
  v_encrypted_secret TEXT;
  v_key_nonce BYTEA;
  v_secret_nonce BYTEA;
  v_decrypted_key TEXT;
  v_decrypted_secret TEXT;
  v_user_key BYTEA;
BEGIN
  -- Verify the requesting user is the owner (for service role, skip this check)
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access credentials for another user';
  END IF;

  -- Fetch encrypted credentials
  SELECT 
    ec.encrypted_api_key,
    ec.encrypted_api_secret,
    ec.key_nonce,
    ec.secret_nonce
  INTO
    v_encrypted_key,
    v_encrypted_secret,
    v_key_nonce,
    v_secret_nonce
  FROM public.encrypted_credentials ec
  WHERE ec.user_id = p_user_id
    AND ec.credential_type = p_credential_type;

  IF NOT FOUND THEN
    -- Log failed access attempt
    INSERT INTO public.credential_access_log (user_id, credential_type, access_source, success)
    VALUES (p_user_id, p_credential_type, p_access_source, false);
    
    RETURN;
  END IF;

  -- Derive the user-specific encryption key
  v_user_key := pgsodium.crypto_generichash(p_user_id::text::bytea);

  -- Decrypt the credentials
  BEGIN
    v_decrypted_key := convert_from(
      pgsodium.crypto_secretbox_open(
        decode(v_encrypted_key, 'base64'),
        v_key_nonce,
        v_user_key
      ),
      'UTF8'
    );

    v_decrypted_secret := convert_from(
      pgsodium.crypto_secretbox_open(
        decode(v_encrypted_secret, 'base64'),
        v_secret_nonce,
        v_user_key
      ),
      'UTF8'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log failed decryption
    INSERT INTO public.credential_access_log (user_id, credential_type, access_source, success)
    VALUES (p_user_id, p_credential_type, p_access_source, false);
    
    RAISE EXCEPTION 'Decryption failed for user credentials';
  END;

  -- Log successful access
  INSERT INTO public.credential_access_log (user_id, credential_type, access_source, success)
  VALUES (p_user_id, p_credential_type, p_access_source, true);

  -- Return decrypted credentials
  RETURN QUERY SELECT v_decrypted_key, v_decrypted_secret;
END;
$function$;