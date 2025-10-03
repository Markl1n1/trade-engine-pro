-- Create signal buffer table for persisting signals during disconnections
CREATE TABLE IF NOT EXISTS signal_buffer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('buy', 'sell')),
  symbol TEXT NOT NULL,
  price NUMERIC NOT NULL,
  reason TEXT,
  candle_timestamp BIGINT NOT NULL,
  buffered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for efficient queries of unprocessed signals
CREATE INDEX IF NOT EXISTS idx_signal_buffer_unprocessed 
ON signal_buffer(processed, buffered_at) 
WHERE NOT processed;

-- Add index for cleanup queries (old processed signals)
CREATE INDEX IF NOT EXISTS idx_signal_buffer_processed 
ON signal_buffer(processed, processed_at) 
WHERE processed;

-- Enable RLS
ALTER TABLE signal_buffer ENABLE ROW LEVEL SECURITY;

-- Users can view their own buffered signals
CREATE POLICY "Users can view their own buffered signals"
ON signal_buffer
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert buffered signals
CREATE POLICY "Service role can insert buffered signals"
ON signal_buffer
FOR INSERT
WITH CHECK (true);

-- Service role can update buffered signals
CREATE POLICY "Service role can update buffered signals"
ON signal_buffer
FOR UPDATE
USING (true);

-- Auto-delete old processed signals after 7 days
CREATE OR REPLACE FUNCTION cleanup_old_buffered_signals()
RETURNS void AS $$
BEGIN
  DELETE FROM signal_buffer 
  WHERE processed = true 
  AND processed_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE signal_buffer IS 'Temporary buffer for signals during WebSocket disconnections';
COMMENT ON COLUMN signal_buffer.candle_timestamp IS 'Timestamp of the candle that triggered the signal';
COMMENT ON COLUMN signal_buffer.buffered_at IS 'When the signal was buffered (during disconnection)';
COMMENT ON COLUMN signal_buffer.processed IS 'Whether the signal was successfully inserted into strategy_signals';
COMMENT ON COLUMN signal_buffer.processed_at IS 'When the buffered signal was successfully processed';