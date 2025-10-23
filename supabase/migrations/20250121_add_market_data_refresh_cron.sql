-- Add automatic market data refresh cron job
-- This will fetch new market data every 5 minutes to keep the database updated

-- Remove any existing cron job with this name
SELECT cron.unschedule('refresh-market-data') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-market-data'
);

-- Schedule the load-market-data function to run every 15 minutes
-- This will fetch data for all major symbols and timeframes
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

-- Add comment
COMMENT ON TABLE market_data IS 'Market data table with comprehensive refresh every 15 minutes - fetches data for all major symbols and timeframes';
