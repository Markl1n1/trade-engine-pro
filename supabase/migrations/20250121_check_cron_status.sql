-- Check if cron job is scheduled and working
-- Run this in Supabase SQL Editor to see cron job status

-- Check if cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'cron';

-- Check scheduled cron jobs
SELECT * FROM cron.job WHERE jobname = 'load-market-data';

-- Check recent cron job runs (if available)
SELECT * FROM cron.job_run_details 
WHERE jobname = 'load-market-data' 
ORDER BY start_time DESC 
LIMIT 10;

-- Check if the function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'load-market-data';
