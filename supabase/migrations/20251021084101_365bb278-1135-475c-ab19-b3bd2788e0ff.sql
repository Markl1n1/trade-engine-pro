-- Fix function search paths to prevent schema manipulation attacks
-- This addresses the security warning: Function Search Path Mutable

-- Update all existing functions to use immutable search_path
CREATE OR REPLACE FUNCTION public.update_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_strategy_state_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_buffered_signals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM signal_buffer 
  WHERE processed = true 
  AND processed_at < NOW() - INTERVAL '7 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_health_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM system_health_logs 
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Assign 'admin' role to first user, 'user' role to others
  IF (SELECT COUNT(*) FROM auth.users) = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$function$;

CREATE OR REPLACE FUNCTION public.log_sensitive_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'SELECT' AND (
    NEW.binance_api_key IS NOT NULL OR 
    NEW.binance_api_secret IS NOT NULL OR
    NEW.binance_mainnet_api_key IS NOT NULL OR
    NEW.binance_mainnet_api_secret IS NOT NULL OR
    NEW.binance_testnet_api_key IS NOT NULL OR
    NEW.binance_testnet_api_secret IS NOT NULL
  ) THEN
    INSERT INTO security_audit_log (user_id, action, table_name, record_id)
    VALUES (NEW.user_id, 'api_keys_accessed', 'user_settings', NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_api_key_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Log when API keys are accessed
  IF (TG_OP = 'SELECT' AND (
    NEW.binance_api_key IS NOT NULL OR 
    NEW.binance_api_secret IS NOT NULL
  )) THEN
    INSERT INTO user_settings_audit (user_id, action)
    VALUES (NEW.user_id, 'api_keys_accessed');
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_api_credentials(user_uuid uuid)
RETURNS TABLE(binance_api_key text, binance_api_secret text, use_testnet boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Verify the requesting user is the owner
  IF auth.uid() != user_uuid THEN
    RAISE EXCEPTION 'Unauthorized access to API credentials';
  END IF;
  
  -- Log the access
  INSERT INTO user_settings_audit (user_id, action)
  VALUES (user_uuid, 'api_credentials_retrieved');
  
  -- Return the credentials
  RETURN QUERY
  SELECT 
    us.binance_api_key,
    us.binance_api_secret,
    us.use_testnet
  FROM user_settings us
  WHERE us.user_id = user_uuid;
END;
$function$;