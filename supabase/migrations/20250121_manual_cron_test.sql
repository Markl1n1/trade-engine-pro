-- Manual test to trigger load-market-data function
-- Run this in Supabase SQL Editor to test if the function works

-- Test the function manually
SELECT net.http_post(
  url := 'https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/load-market-data',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY'
  ),
  body := jsonb_build_object('load', true)
) as request_id;

-- Check if cron job is scheduled
SELECT jobname, schedule, command 
FROM cron.job 
WHERE jobname = 'load-market-data';

-- Check recent cron runs (if available)
SELECT jobname, start_time, end_time, status, return_message
FROM cron.job_run_details 
WHERE jobname = 'load-market-data' 
ORDER BY start_time DESC 
LIMIT 5;
