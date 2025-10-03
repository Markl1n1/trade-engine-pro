-- ============================================
-- PHASE 1: DATABASE SCHEMA ENHANCEMENTS (FIXED)
-- Purpose: Enable zero signal loss & prevent duplicates
-- ============================================

-- 1.1 Add Signal Tracking & Retry System to strategy_signals
ALTER TABLE strategy_signals 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'expired')),
ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add index for efficient retry queries
CREATE INDEX IF NOT EXISTS idx_signals_pending 
ON strategy_signals(status, created_at) 
WHERE status = 'pending';

COMMENT ON COLUMN strategy_signals.status IS 'Signal delivery status: pending=waiting, delivered=sent successfully, failed=permanent failure, expired=too old to process';
COMMENT ON COLUMN strategy_signals.delivery_attempts IS 'Number of times we attempted to deliver this signal';
COMMENT ON COLUMN strategy_signals.last_attempt_at IS 'Timestamp of last delivery attempt';
COMMENT ON COLUMN strategy_signals.error_message IS 'Error details if delivery failed';

-- 1.2 Add Optimistic Locking & State Tracking to strategy_live_states
ALTER TABLE strategy_live_states 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL,
ADD COLUMN IF NOT EXISTS last_processed_candle_time BIGINT,
ADD COLUMN IF NOT EXISTS last_cross_direction TEXT CHECK (last_cross_direction IS NULL OR last_cross_direction IN ('up', 'down', 'none'));

COMMENT ON COLUMN strategy_live_states.version IS 'Optimistic lock version - increments on every update to detect concurrent modifications';
COMMENT ON COLUMN strategy_live_states.last_processed_candle_time IS 'Timestamp of last processed candle (prevents duplicate signal generation)';
COMMENT ON COLUMN strategy_live_states.last_cross_direction IS 'Direction of last crossover signal (up/down/none) - prevents firing on every tick';

-- Create version increment trigger
CREATE OR REPLACE FUNCTION increment_strategy_state_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS strategy_live_states_version_trigger ON strategy_live_states;
CREATE TRIGGER strategy_live_states_version_trigger
BEFORE UPDATE ON strategy_live_states
FOR EACH ROW
EXECUTE FUNCTION increment_strategy_state_version();

-- 1.3 Create immutable function for date truncation (required for unique index)
CREATE OR REPLACE FUNCTION immutable_date_trunc_minute(timestamp with time zone)
RETURNS timestamp with time zone AS $$
  SELECT date_trunc('minute', $1);
$$ LANGUAGE sql IMMUTABLE;

-- Add Signal Deduplication Constraint using immutable function
-- This prevents duplicate signals for same strategy within 1-minute window
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_signals 
ON strategy_signals (
  strategy_id, 
  signal_type, 
  immutable_date_trunc_minute(created_at)
);

COMMENT ON INDEX idx_unique_signals IS 'Prevents duplicate signals within same 1-minute bucket';

-- Add index for efficient version-based queries (optimistic locking)
CREATE INDEX IF NOT EXISTS idx_live_states_version 
ON strategy_live_states(strategy_id, version);

-- Add index for last_processed_candle_time lookups
CREATE INDEX IF NOT EXISTS idx_live_states_last_candle 
ON strategy_live_states(strategy_id, last_processed_candle_time);