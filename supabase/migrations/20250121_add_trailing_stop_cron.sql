-- Create cron job for real-time trailing stop monitoring
-- This runs every minute to ensure WebSocket connections are active

-- Function to start trailing stop monitoring
CREATE OR REPLACE FUNCTION start_trailing_stop_monitoring()
RETURNS void AS $$
DECLARE
  result json;
BEGIN
  -- Call the trailing-stop-websocket function to start monitoring
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/trailing-stop-websocket',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'action', 'start_monitoring'
    )
  ) INTO result;
  
  -- Log the result
  INSERT INTO audit_logs (
    user_id,
    action,
    details,
    ip_address,
    user_agent
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid, -- System user
    'trailing_stop_monitoring_started',
    jsonb_build_object(
      'result', result,
      'timestamp', now()
    ),
    '127.0.0.1',
    'trailing-stop-cron'
  );
END;
$$ LANGUAGE plpgsql;

-- Create cron job to run every minute
SELECT cron.schedule(
  'trailing-stop-monitoring',
  '* * * * *', -- Every minute
  'SELECT start_trailing_stop_monitoring();'
);

-- Create function to check if monitoring is active
CREATE OR REPLACE FUNCTION check_trailing_stop_status()
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  -- Call the trailing-stop-websocket function to check status
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/trailing-stop-websocket',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'action', 'get_status'
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to stop monitoring if needed
CREATE OR REPLACE FUNCTION stop_trailing_stop_monitoring()
RETURNS void AS $$
DECLARE
  result json;
BEGIN
  -- Call the trailing-stop-websocket function to stop monitoring
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/trailing-stop-websocket',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'action', 'stop_monitoring'
    )
  ) INTO result;
  
  -- Log the result
  INSERT INTO audit_logs (
    user_id,
    action,
    details,
    ip_address,
    user_agent
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid, -- System user
    'trailing_stop_monitoring_stopped',
    jsonb_build_object(
      'result', result,
      'timestamp', now()
    ),
    '127.0.0.1',
    'trailing-stop-cron'
  );
END;
$$ LANGUAGE plpgsql;
