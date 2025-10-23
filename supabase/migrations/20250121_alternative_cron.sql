-- Alternative cron job using the new cron-market-data function
-- This is more reliable than direct HTTP calls

-- Remove any existing cron job with this name
SELECT cron.unschedule('cron-market-data') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cron-market-data'
);

-- Schedule the cron-market-data function to run every 15 minutes
SELECT cron.schedule(
  'cron-market-data',
  '*/15 * * * *',  -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/cron-market-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY'
    ),
    body := jsonb_build_object('trigger', 'cron')
  ) as request_id;
  $$
);

-- Verify the cron job was created
SELECT jobname, schedule, command, active 
FROM cron.job 
WHERE jobname IN ('load-market-data', 'cron-market-data');

-- Test the cron job immediately
SELECT net.http_post(
  url := 'https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/cron-market-data',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY'
  ),
  body := jsonb_build_object('trigger', 'manual_test')
) as test_result;
