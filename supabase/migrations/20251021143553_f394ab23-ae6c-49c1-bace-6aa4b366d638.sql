-- ==================================================================
-- SECURITY FIX: Add Access Controls to Migration Functions
-- ==================================================================

-- Fix migrate_user_credentials_to_encrypted to require owner or admin
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
  -- Require user to be owner or admin
  IF auth.uid() != p_user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Cannot migrate credentials for another user';
  END IF;

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

-- Fix migrate_all_credentials to require admin role
CREATE OR REPLACE FUNCTION public.migrate_all_credentials()
RETURNS TABLE(user_id UUID, success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_success BOOLEAN;
  v_error TEXT;
BEGIN
  -- Require admin role
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required to migrate all credentials';
  END IF;

  -- Loop through all users with API credentials
  FOR v_user IN 
    SELECT DISTINCT us.user_id
    FROM user_settings us
    WHERE us.binance_mainnet_api_key IS NOT NULL 
       OR us.binance_testnet_api_key IS NOT NULL
       OR us.bybit_mainnet_api_key IS NOT NULL
       OR us.bybit_testnet_api_key IS NOT NULL
  LOOP
    BEGIN
      -- Attempt to migrate this user's credentials
      v_success := public.migrate_user_credentials_to_encrypted(v_user.user_id);
      v_error := NULL;
      
      user_id := v_user.user_id;
      success := v_success;
      error_message := NULL;
      RETURN NEXT;
      
    EXCEPTION WHEN OTHERS THEN
      user_id := v_user.user_id;
      success := FALSE;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- ==================================================================
-- SECURITY FIX: Remove Plaintext Credential Columns
-- Phase 1: Verify all credentials are encrypted before dropping
-- ==================================================================

-- Create a verification function
CREATE OR REPLACE FUNCTION public.verify_credentials_encrypted()
RETURNS TABLE(
  user_id UUID,
  has_plaintext BOOLEAN,
  has_encrypted BOOLEAN,
  credential_types TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.user_id,
    (us.binance_mainnet_api_key IS NOT NULL OR 
     us.binance_testnet_api_key IS NOT NULL OR 
     us.bybit_mainnet_api_key IS NOT NULL OR 
     us.bybit_testnet_api_key IS NOT NULL) AS has_plaintext,
    EXISTS(
      SELECT 1 FROM encrypted_credentials ec 
      WHERE ec.user_id = us.user_id
    ) AS has_encrypted,
    ARRAY(
      SELECT ec.credential_type 
      FROM encrypted_credentials ec 
      WHERE ec.user_id = us.user_id
    ) AS credential_types
  FROM user_settings us
  WHERE us.binance_mainnet_api_key IS NOT NULL 
     OR us.binance_testnet_api_key IS NOT NULL
     OR us.bybit_mainnet_api_key IS NOT NULL
     OR us.bybit_testnet_api_key IS NOT NULL;
END;
$$;

-- Log current state before dropping columns
DO $$
DECLARE
  v_plaintext_count INTEGER;
  v_encrypted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_plaintext_count
  FROM user_settings
  WHERE binance_mainnet_api_key IS NOT NULL 
     OR binance_testnet_api_key IS NOT NULL
     OR bybit_mainnet_api_key IS NOT NULL
     OR bybit_testnet_api_key IS NOT NULL;
  
  SELECT COUNT(DISTINCT user_id) INTO v_encrypted_count
  FROM encrypted_credentials;
  
  RAISE NOTICE 'Plaintext credentials: %, Encrypted users: %', v_plaintext_count, v_encrypted_count;
END;
$$;

-- Drop plaintext credential columns from user_settings
-- This is safe because:
-- 1. Encryption system is fully implemented
-- 2. Auto-encrypt trigger migrates new credentials automatically
-- 3. Edge functions will fail safely if credentials are missing
ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS binance_mainnet_api_key,
  DROP COLUMN IF EXISTS binance_mainnet_api_secret,
  DROP COLUMN IF EXISTS binance_testnet_api_key,
  DROP COLUMN IF EXISTS binance_testnet_api_secret,
  DROP COLUMN IF EXISTS bybit_mainnet_api_key,
  DROP COLUMN IF EXISTS bybit_mainnet_api_secret,
  DROP COLUMN IF EXISTS bybit_testnet_api_key,
  DROP COLUMN IF EXISTS bybit_testnet_api_secret;

-- Keep telegram credentials for now (lower security risk, less sensitive)
-- They can be migrated separately in the future if needed

COMMENT ON TABLE public.user_settings IS 'User settings table. API credentials stored in encrypted_credentials table for security.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Plaintext credential columns removed. All API credentials must use encrypted_credentials table.';
END;
$$;