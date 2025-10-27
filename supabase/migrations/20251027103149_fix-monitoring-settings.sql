-- Fix monitoring settings - Initialize system_settings table
-- This script ensures monitoring is enabled and properly configured

-- Insert or update monitoring_enabled setting
INSERT INTO system_settings (setting_key, setting_value, description, created_at, updated_at)
VALUES (
  'monitoring_enabled', 
  'true', 
  'Enable/disable automatic strategy monitoring cron job',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) 
DO UPDATE SET 
  setting_value = 'true',
  updated_at = NOW();

-- Insert or update monitoring_interval_seconds setting
INSERT INTO system_settings (setting_key, setting_value, description, created_at, updated_at)
VALUES (
  'monitoring_interval_seconds', 
  '15', 
  'Interval in seconds between monitoring runs',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) 
DO UPDATE SET 
  setting_value = '15',
  updated_at = NOW();

-- Insert or update last_monitoring_run setting (initialize with current time)
INSERT INTO system_settings (setting_key, setting_value, description, created_at, updated_at)
VALUES (
  'last_monitoring_run', 
  NOW()::text, 
  'Timestamp of last monitoring run',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) 
DO UPDATE SET 
  setting_value = NOW()::text,
  updated_at = NOW();

-- Verify the settings were created/updated
SELECT 
  setting_key, 
  setting_value, 
  description,
  updated_at
FROM system_settings 
WHERE setting_key IN ('monitoring_enabled', 'monitoring_interval_seconds', 'last_monitoring_run')
ORDER BY setting_key;
