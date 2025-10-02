-- Enable required extensions for CRON scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Ensure system_settings table exists
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Ensure admin policies exist for system_settings
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Only admins can view system settings'
  ) THEN
    CREATE POLICY "Only admins can view system settings" 
    ON public.system_settings 
    FOR SELECT 
    USING (has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Only admins can update system settings'
  ) THEN
    CREATE POLICY "Only admins can update system settings" 
    ON public.system_settings 
    FOR UPDATE 
    USING (has_role(auth.uid(), 'admin'))
    WITH CHECK (has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Only admins can insert system settings'
  ) THEN
    CREATE POLICY "Only admins can insert system settings" 
    ON public.system_settings 
    FOR INSERT 
    WITH CHECK (has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Insert monitoring control settings
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES 
  ('monitoring_enabled', 'true'),
  ('last_monitoring_run', now()::text)
ON CONFLICT (setting_key) DO NOTHING;

-- Remove any existing cron job with this name
SELECT cron.unschedule('monitor-active-strategies') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'monitor-active-strategies'
);

-- Schedule the monitor-strategies-cron function to run every 5 minutes
SELECT cron.schedule(
  'monitor-active-strategies',
  '*/5 * * * *',
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