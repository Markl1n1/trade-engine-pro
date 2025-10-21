-- Add exchange_type column to market_data table
ALTER TABLE public.market_data 
ADD COLUMN IF NOT EXISTS exchange_type TEXT NOT NULL DEFAULT 'binance';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_market_data_exchange_type 
ON public.market_data(exchange_type, symbol, timeframe, open_time DESC);

-- Add check constraint to ensure only valid exchange types
ALTER TABLE public.market_data 
ADD CONSTRAINT valid_exchange_type 
CHECK (exchange_type IN ('binance', 'bybit'));

-- Update existing data to mark as binance (since all current data is from binance)
UPDATE public.market_data 
SET exchange_type = 'binance' 
WHERE exchange_type IS NULL OR exchange_type = '';