-- Phase 1: Add signal deduplication hash
ALTER TABLE strategy_signals 
ADD COLUMN IF NOT EXISTS signal_hash text;

-- Add unique constraint separately to avoid conflicts if column already exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_signal_hash'
  ) THEN
    ALTER TABLE strategy_signals ADD CONSTRAINT unique_signal_hash UNIQUE (signal_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_strategy_signals_hash ON strategy_signals(signal_hash);

-- Phase 4: Add signal latency tracking columns
ALTER TABLE strategy_signals
ADD COLUMN IF NOT EXISTS candle_close_time bigint,
ADD COLUMN IF NOT EXISTS signal_generated_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS signal_delivered_at timestamp with time zone;

-- Phase 5: Create position_events table (separate from trading signals)
CREATE TABLE IF NOT EXISTS position_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strategy_id uuid NOT NULL,
  symbol text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('opened', 'closed', 'liquidated')),
  entry_price numeric,
  exit_price numeric,
  position_size numeric,
  pnl_percent numeric,
  pnl_amount numeric,
  reason text,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  telegram_sent boolean DEFAULT false,
  telegram_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on position_events
ALTER TABLE position_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for position_events
CREATE POLICY "Users can view their own position events"
ON position_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert position events"
ON position_events FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update position events"
ON position_events FOR UPDATE
USING (true);

-- Indexes for position_events
CREATE INDEX IF NOT EXISTS idx_position_events_user_id ON position_events(user_id);
CREATE INDEX IF NOT EXISTS idx_position_events_strategy_id ON position_events(strategy_id);
CREATE INDEX IF NOT EXISTS idx_position_events_timestamp ON position_events(timestamp DESC);