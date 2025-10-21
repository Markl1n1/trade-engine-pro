-- Phase 1: Enable pgsodium and create encrypted credentials storage
-- Enable pgsodium extension for encryption
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create a table to store encrypted API credentials
CREATE TABLE IF NOT EXISTS public.encrypted_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_type TEXT NOT NULL, -- 'binance_mainnet', 'binance_testnet', 'bybit_mainnet', 'bybit_testnet'
  encrypted_api_key TEXT, -- encrypted using pgsodium
  encrypted_api_secret TEXT, -- encrypted using pgsodium
  key_nonce BYTEA, -- nonce for api_key encryption
  secret_nonce BYTEA, -- nonce for api_secret encryption
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, credential_type)
);

-- Enable RLS on encrypted_credentials
ALTER TABLE public.encrypted_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own credentials
CREATE POLICY "Users can view their own encrypted credentials"
ON public.encrypted_credentials
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own encrypted credentials"
ON public.encrypted_credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own encrypted credentials"
ON public.encrypted_credentials
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own encrypted credentials"
ON public.encrypted_credentials
FOR DELETE
USING (auth.uid() = user_id);

-- Create audit log for credential access
CREATE TABLE IF NOT EXISTS public.credential_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_type TEXT NOT NULL,
  accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  access_source TEXT, -- which edge function accessed it
  success BOOLEAN DEFAULT true
);

ALTER TABLE public.credential_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own access logs"
ON public.credential_access_log
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert access logs"
ON public.credential_access_log
FOR INSERT
WITH CHECK (true);

-- Create encryption key in pgsodium (this will be used for all credentials)
-- Store the key ID in a settings table for reference
CREATE TABLE IF NOT EXISTS public.encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id BIGINT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'api_credentials',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(purpose)
);

-- Security Definer function to encrypt API credentials
CREATE OR REPLACE FUNCTION public.encrypt_credential(
  p_user_id UUID,
  p_credential_type TEXT,
  p_api_key TEXT,
  p_api_secret TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Use a deterministic key derived from user_id for encryption
  -- This allows decryption without storing the key
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
$$;

-- Security Definer function to decrypt and retrieve API credentials
CREATE OR REPLACE FUNCTION public.decrypt_credential(
  p_user_id UUID,
  p_credential_type TEXT,
  p_access_source TEXT DEFAULT 'unknown'
)
RETURNS TABLE(api_key TEXT, api_secret TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Helper function to migrate existing plaintext credentials to encrypted storage
CREATE OR REPLACE FUNCTION public.migrate_user_credentials_to_encrypted(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_success BOOLEAN := true;
BEGIN
  -- Fetch existing credentials from user_settings
  SELECT 
    binance_mainnet_api_key,
    binance_mainnet_api_secret,
    binance_testnet_api_key,
    binance_testnet_api_secret,
    bybit_mainnet_api_key,
    bybit_mainnet_api_secret,
    bybit_testnet_api_key,
    bybit_testnet_api_secret
  INTO v_settings
  FROM public.user_settings
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Migrate Binance mainnet credentials
  IF v_settings.binance_mainnet_api_key IS NOT NULL AND v_settings.binance_mainnet_api_secret IS NOT NULL THEN
    PERFORM public.encrypt_credential(
      p_user_id,
      'binance_mainnet',
      v_settings.binance_mainnet_api_key,
      v_settings.binance_mainnet_api_secret
    );
  END IF;

  -- Migrate Binance testnet credentials
  IF v_settings.binance_testnet_api_key IS NOT NULL AND v_settings.binance_testnet_api_secret IS NOT NULL THEN
    PERFORM public.encrypt_credential(
      p_user_id,
      'binance_testnet',
      v_settings.binance_testnet_api_key,
      v_settings.binance_testnet_api_secret
    );
  END IF;

  -- Migrate Bybit mainnet credentials
  IF v_settings.bybit_mainnet_api_key IS NOT NULL AND v_settings.bybit_mainnet_api_secret IS NOT NULL THEN
    PERFORM public.encrypt_credential(
      p_user_id,
      'bybit_mainnet',
      v_settings.bybit_mainnet_api_key,
      v_settings.bybit_mainnet_api_secret
    );
  END IF;

  -- Migrate Bybit testnet credentials
  IF v_settings.bybit_testnet_api_key IS NOT NULL AND v_settings.bybit_testnet_api_secret IS NOT NULL THEN
    PERFORM public.encrypt_credential(
      p_user_id,
      'bybit_testnet',
      v_settings.bybit_testnet_api_key,
      v_settings.bybit_testnet_api_secret
    );
  END IF;

  RETURN v_success;
END;
$$;

-- Create trigger to automatically encrypt credentials when user_settings are updated
CREATE OR REPLACE FUNCTION public.auto_encrypt_credentials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Encrypt Binance mainnet if changed
  IF (NEW.binance_mainnet_api_key IS DISTINCT FROM OLD.binance_mainnet_api_key 
      OR NEW.binance_mainnet_api_secret IS DISTINCT FROM OLD.binance_mainnet_api_secret)
     AND NEW.binance_mainnet_api_key IS NOT NULL 
     AND NEW.binance_mainnet_api_secret IS NOT NULL THEN
    PERFORM public.encrypt_credential(
      NEW.user_id,
      'binance_mainnet',
      NEW.binance_mainnet_api_key,
      NEW.binance_mainnet_api_secret
    );
  END IF;

  -- Encrypt Binance testnet if changed
  IF (NEW.binance_testnet_api_key IS DISTINCT FROM OLD.binance_testnet_api_key 
      OR NEW.binance_testnet_api_secret IS DISTINCT FROM OLD.binance_testnet_api_secret)
     AND NEW.binance_testnet_api_key IS NOT NULL 
     AND NEW.binance_testnet_api_secret IS NOT NULL THEN
    PERFORM public.encrypt_credential(
      NEW.user_id,
      'binance_testnet',
      NEW.binance_testnet_api_key,
      NEW.binance_testnet_api_secret
    );
  END IF;

  -- Encrypt Bybit mainnet if changed
  IF (NEW.bybit_mainnet_api_key IS DISTINCT FROM OLD.bybit_mainnet_api_key 
      OR NEW.bybit_mainnet_api_secret IS DISTINCT FROM OLD.bybit_mainnet_api_secret)
     AND NEW.bybit_mainnet_api_key IS NOT NULL 
     AND NEW.bybit_mainnet_api_secret IS NOT NULL THEN
    PERFORM public.encrypt_credential(
      NEW.user_id,
      'bybit_mainnet',
      NEW.bybit_mainnet_api_key,
      NEW.bybit_mainnet_api_secret
    );
  END IF;

  -- Encrypt Bybit testnet if changed
  IF (NEW.bybit_testnet_api_key IS DISTINCT FROM OLD.bybit_testnet_api_key 
      OR NEW.bybit_testnet_api_secret IS DISTINCT FROM OLD.bybit_testnet_api_secret)
     AND NEW.bybit_testnet_api_key IS NOT NULL 
     AND NEW.bybit_testnet_api_secret IS NOT NULL THEN
    PERFORM public.encrypt_credential(
      NEW.user_id,
      'bybit_testnet',
      NEW.bybit_testnet_api_key,
      NEW.bybit_testnet_api_secret
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER encrypt_credentials_on_update
AFTER UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.auto_encrypt_credentials();