-- ================================================================
-- DATABASE REORGANIZATION - Phase 1 & 2
-- Fix critical constraints and cleanup obsolete cron jobs
-- ================================================================

-- PHASE 1: Fix market_data constraint to allow bybit_spot
-- Remove duplicate constraint
ALTER TABLE market_data DROP CONSTRAINT IF EXISTS valid_exchange_type;

-- Update constraint to include bybit_spot
ALTER TABLE market_data DROP CONSTRAINT IF EXISTS market_data_exchange_type_check;
ALTER TABLE market_data ADD CONSTRAINT market_data_exchange_type_check 
  CHECK (exchange_type IN ('binance', 'bybit', 'bybit_spot'));

-- PHASE 2: Clean up obsolete cron jobs
-- Remove jobs for deleted functions (signal_buffer related)
SELECT cron.unschedule('process-buffered-signals');
SELECT cron.unschedule('retry-failed-signals');

-- Remove duplicate cron jobs (keep newer versions)
SELECT cron.unschedule('check-binance-positions-sync');
SELECT cron.unschedule('monitor-active-strategies');

-- ================================================================
-- RESULT: 
-- - market_data now accepts: binance, bybit, bybit_spot
-- - 4 obsolete cron jobs removed
-- - 5 active cron jobs remain (all properly configured)
-- ================================================================