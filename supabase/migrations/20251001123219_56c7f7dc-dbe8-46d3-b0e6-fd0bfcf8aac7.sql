-- Enable pg_cron and pg_net extensions for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create system_settings table for global application settings
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read system settings
CREATE POLICY "Anyone can view system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (true);

-- Only authenticated users can update system settings
CREATE POLICY "Authenticated users can update system settings"
ON public.system_settings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Insert default system settings
INSERT INTO public.system_settings (setting_key, setting_value) VALUES
  ('monitoring_enabled', 'true'),
  ('monitoring_interval_seconds', '15'),
  ('last_monitoring_run', now()::text);

-- Create trigger to update updated_at
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_settings_updated_at();

-- Schedule monitor-strategies-cron to run every 15 seconds
SELECT cron.schedule(
  'monitor-strategies-every-15-seconds',
  '*/15 * * * * *',
  $$
  SELECT net.http_post(
    url:='https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/monitor-strategies-cron',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE3OTYwNywiZXhwIjoyMDc0NzU1NjA3fQ.FNmw3Hl_TzkNuaRm_v0i3SkJyFN2p1xS8_bGxfzHN38"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  ) as request_id;
  $$
);