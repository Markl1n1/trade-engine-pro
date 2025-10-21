-- Idempotent migration: Only create what doesn't exist
-- Enable pgsodium extension for encryption (idempotent)
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS encrypt_credentials_on_update ON public.user_settings;

-- Recreate the trigger function with improvements
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

-- Create the trigger
CREATE TRIGGER encrypt_credentials_on_update
AFTER UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.auto_encrypt_credentials();