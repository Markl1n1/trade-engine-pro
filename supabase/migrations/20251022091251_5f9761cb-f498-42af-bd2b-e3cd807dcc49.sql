-- Step 1: Ensure exchange_type column exists with proper constraints
ALTER TABLE market_data 
ALTER COLUMN exchange_type SET NOT NULL,
ALTER COLUMN exchange_type SET DEFAULT 'binance';

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_market_data_exchange_symbol_time 
ON market_data(exchange_type, symbol, timeframe, open_time DESC);

-- Step 3: Add check constraint to ensure valid exchange types
ALTER TABLE market_data 
DROP CONSTRAINT IF EXISTS market_data_exchange_type_check;

ALTER TABLE market_data 
ADD CONSTRAINT market_data_exchange_type_check 
CHECK (exchange_type IN ('binance', 'bybit'));

-- Step 4: Verify current data state
COMMENT ON COLUMN market_data.exchange_type IS 'Exchange source: binance or bybit. Default binance for legacy data.';