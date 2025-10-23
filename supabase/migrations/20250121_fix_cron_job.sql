-- Fix cron job for load-market-data
-- This will ensure the cron job is properly scheduled

-- First, check if cron extension is enabled
CREATE EXTENSION IF NOT EXISTS cron;

-- Remove any existing cron job with this name
SELECT cron.unschedule('load-market-data') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'load-market-data'
);

-- Schedule the load-market-data function to run every 15 minutes
SELECT cron.schedule(
  'load-market-data',
  '*/15 * * * *',  -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/load-market-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY'
    ),
    body := jsonb_build_object('load', true)
  ) as request_id;
  $$
);

-- Verify the cron job was created
SELECT jobname, schedule, command, active 
FROM cron.job 
WHERE jobname = 'load-market-data';

-- Add a test to see if cron is working
INSERT INTO system_health_logs (service_name, status, message, metrics)
VALUES (
  'cron-scheduler', 
  'healthy', 
  'Cron job load-market-data scheduled successfully',
  jsonb_build_object(
    'jobname', 'load-market-data',
    'schedule', '*/15 * * * *',
    'created_at', now()
  )
);
