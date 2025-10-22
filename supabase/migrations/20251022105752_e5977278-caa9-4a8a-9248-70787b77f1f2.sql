-- Create table for trailing stop states
CREATE TABLE IF NOT EXISTS public.trailing_stop_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  trailing_percent DECIMAL(5, 2) NOT NULL DEFAULT 20.0,
  entry_price DECIMAL(20, 8) NOT NULL,
  position_type TEXT NOT NULL CHECK (position_type IN ('buy', 'sell')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  max_profit_percent DECIMAL(10, 4) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one trailing stop per position
  UNIQUE(user_id, position_id)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_trailing_stop_states_user_id ON public.trailing_stop_states(user_id);
CREATE INDEX IF NOT EXISTS idx_trailing_stop_states_position_id ON public.trailing_stop_states(position_id);
CREATE INDEX IF NOT EXISTS idx_trailing_stop_states_active ON public.trailing_stop_states(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.trailing_stop_states ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own trailing stop states" ON public.trailing_stop_states
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trailing stop states" ON public.trailing_stop_states
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trailing stop states" ON public.trailing_stop_states
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trailing stop states" ON public.trailing_stop_states
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trailing_stop_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_trailing_stop_states_updated_at
  BEFORE UPDATE ON public.trailing_stop_states
  FOR EACH ROW
  EXECUTE FUNCTION update_trailing_stop_states_updated_at();

-- Fix market_data exchange_type column
ALTER TABLE market_data 
ALTER COLUMN exchange_type SET NOT NULL,
ALTER COLUMN exchange_type SET DEFAULT 'bybit';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_market_data_exchange_symbol_time 
ON market_data(exchange_type, symbol, timeframe, open_time DESC);

-- Add check constraint to ensure valid exchange types
ALTER TABLE market_data 
DROP CONSTRAINT IF EXISTS market_data_exchange_type_check;

ALTER TABLE market_data 
ADD CONSTRAINT market_data_exchange_type_check 
CHECK (exchange_type IN ('binance', 'bybit'));

-- Add comment
COMMENT ON COLUMN market_data.exchange_type IS 'Exchange source: binance or bybit. Default bybit for new data.';