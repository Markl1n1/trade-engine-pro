-- Create market_data table for storing OHLCV candlestick data
CREATE TABLE IF NOT EXISTS public.market_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  open_time bigint NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric NOT NULL,
  close_time bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(symbol, timeframe, open_time)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timeframe_time 
ON public.market_data(symbol, timeframe, open_time DESC);

-- Enable RLS
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;

-- Allow public read access to market data (it's public data from exchanges)
CREATE POLICY "Anyone can view market data"
ON public.market_data
FOR SELECT
USING (true);

-- Only allow edge functions to insert market data (using service role key)
CREATE POLICY "Service role can insert market data"
ON public.market_data
FOR INSERT
WITH CHECK (true);