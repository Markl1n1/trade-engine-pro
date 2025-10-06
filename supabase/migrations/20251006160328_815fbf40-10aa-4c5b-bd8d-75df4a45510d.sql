-- Schedule position sync cron job to run every 2 minutes
SELECT cron.schedule(
  'check-binance-positions-sync',
  '*/2 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/check-binance-positions-cron',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY"}'::jsonb,
        body:='{}'::jsonb
    ) AS request_id;
  $$
);