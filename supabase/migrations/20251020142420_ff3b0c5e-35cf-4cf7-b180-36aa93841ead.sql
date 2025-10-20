-- Fix database functions missing fixed search_path
-- This prevents privilege escalation through search_path manipulation

-- Fix increment_strategy_state_version function
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

-- Fix cleanup_old_buffered_signals function
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

-- Fix cleanup_old_health_logs function
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