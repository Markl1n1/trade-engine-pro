-- Remove unused tables and columns
-- This migration removes tables that are created but never used

-- Drop unused data quality tables
DROP TABLE IF EXISTS public.data_quality_reports CASCADE;
DROP TABLE IF EXISTS public.data_quality_fixes CASCADE;
DROP TABLE IF EXISTS public.data_quality_alerts CASCADE;
DROP TABLE IF EXISTS public.data_quality_configs CASCADE;

-- Drop unused signal buffer table (not integrated)
DROP TABLE IF EXISTS public.signal_buffer CASCADE;

-- Drop unused position events table (not integrated)
DROP TABLE IF EXISTS public.position_events CASCADE;

-- Remove unused columns from strategies table
ALTER TABLE public.strategies DROP COLUMN IF EXISTS status;
ALTER TABLE public.strategies DROP COLUMN IF EXISTS position_size_percent;
ALTER TABLE public.strategies DROP COLUMN IF EXISTS stop_loss_percent;
ALTER TABLE public.strategies DROP COLUMN IF EXISTS take_profit_percent;

-- Drop unused enums
DROP TYPE IF EXISTS strategy_status CASCADE;
DROP TYPE IF EXISTS indicator_type CASCADE;
DROP TYPE IF EXISTS condition_operator CASCADE;
DROP TYPE IF EXISTS order_type CASCADE;

-- Clean up unused indexes
DROP INDEX IF EXISTS idx_signal_buffer_unprocessed;
DROP INDEX IF EXISTS idx_signal_buffer_processed;
DROP INDEX IF EXISTS idx_position_events_user_id;
DROP INDEX IF EXISTS idx_strategy_signals_hash;

-- Remove unused functions
DROP FUNCTION IF EXISTS cleanup_old_buffered_signals() CASCADE;
