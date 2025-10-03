-- Fix search_path security warning for cron functions
-- Update the cron job functions to have secure search_path

-- First, unschedule existing jobs
SELECT cron.unschedule('process-buffered-signals');
SELECT cron.unschedule('retry-failed-signals');

-- Recreate with proper configuration
SELECT cron.schedule(
  'process-buffered-signals',
  '*/2 * * * *',
  $$
  SET search_path = '';
  SELECT
    net.http_post(
      url:='https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/process-buffered-signals',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY"}'::jsonb,
      body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);

SELECT cron.schedule(
  'retry-failed-signals',
  '*/3 * * * *',
  $$
  SET search_path = '';
  SELECT
    net.http_post(
      url:='https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/retry-failed-signals',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY"}'::jsonb,
      body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);

-- Create monitoring table for tracking system health
CREATE TABLE IF NOT EXISTS public.system_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'error')),
  message TEXT,
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_system_health_logs_service_created 
  ON public.system_health_logs (service_name, created_at DESC);

-- Enable RLS
ALTER TABLE public.system_health_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view health logs
CREATE POLICY "Only admins can view system health logs" 
  ON public.system_health_logs
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert health logs
CREATE POLICY "Service role can insert health logs" 
  ON public.system_health_logs
  FOR INSERT
  WITH CHECK (true);

-- Auto-cleanup old health logs (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_health_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM system_health_logs 
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

-- Schedule cleanup to run daily
SELECT cron.schedule(
  'cleanup-health-logs',
  '0 2 * * *',
  $$
  SET search_path = public;
  SELECT cleanup_old_health_logs();
  $$
);