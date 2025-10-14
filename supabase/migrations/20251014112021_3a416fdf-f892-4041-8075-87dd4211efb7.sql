-- Remove duplicate/conflicting cron job
SELECT cron.unschedule('monitor-strategies-every-15-seconds');

-- Update existing job to run every 1 minute (fastest possible with pg_cron)
SELECT cron.unschedule('monitor-active-strategies');

SELECT cron.schedule(
  'monitor-active-strategies',
  '*/1 * * * *',  -- Every 1 minute
  $$
  SELECT net.http_post(
    url := 'https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/monitor-strategies-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY'
    ),
    body := jsonb_build_object('time', now()::text)
  ) as request_id;
  $$
);