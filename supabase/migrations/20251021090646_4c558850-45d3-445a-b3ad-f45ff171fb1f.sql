-- Create one-time migration script to encrypt all existing credentials
-- This should be run after all edge functions are updated

-- Create a helper function to run the migration for all users
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

-- Add a column to track migration status
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS credentials_migrated_at TIMESTAMP WITH TIME ZONE;

-- Update the auto_encrypt_credentials trigger to also mark migration timestamp
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
    NEW.credentials_migrated_at := NOW();
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
    NEW.credentials_migrated_at := NOW();
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
    NEW.credentials_migrated_at := NOW();
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
    NEW.credentials_migrated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;