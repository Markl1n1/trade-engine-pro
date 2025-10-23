-- Setup cron job for refresh-market-data to run every 10 minutes
-- This will fetch data only for active strategies (more efficient)

-- Remove any existing cron job with this name
SELECT cron.unschedule('refresh-market-data') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-market-data'
);

-- Schedule the refresh-market-data function to run every 10 minutes
SELECT cron.schedule(
  'refresh-market-data',
  '*/10 * * * *',  -- Every 10 minutes
  $$
  SELECT net.http_post(
    url := 'https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/refresh-market-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY'
    ),
    body := jsonb_build_object('refresh', true)
  ) as request_id;
  $$
);

-- Verify the cron job was created
SELECT jobname, schedule, command, active 
FROM cron.job 
WHERE jobname = 'refresh-market-data';

-- Test the cron job immediately
SELECT net.http_post(
  url := 'https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/refresh-market-data',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY'
  ),
  body := jsonb_build_object('refresh', true)
) as test_result;

-- Add comment
COMMENT ON TABLE market_data IS 'Market data table with smart refresh every 10 minutes - only fetches data for active strategies';
