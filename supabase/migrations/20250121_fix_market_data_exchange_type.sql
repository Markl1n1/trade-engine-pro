-- Fix market_data table: add exchange_type column and populate existing records
-- Safe migration for market_data table management

-- Step 1: Add exchange_type column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'market_data' 
        AND column_name = 'exchange_type'
    ) THEN
        ALTER TABLE public.market_data 
        ADD COLUMN exchange_type TEXT DEFAULT 'binance';
    END IF;
END $$;

-- Step 2: Update existing records that have NULL exchange_type
UPDATE public.market_data 
SET exchange_type = 'binance' 
WHERE exchange_type IS NULL;

-- Step 3: Add NOT NULL constraint after populating data
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'market_data' 
        AND column_name = 'exchange_type'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE public.market_data 
        ALTER COLUMN exchange_type SET NOT NULL;
    END IF;
END $$;

-- Step 4: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_market_data_exchange_symbol_timeframe 
ON public.market_data (exchange_type, symbol, timeframe, open_time);

-- Step 5: Update existing Bybit data (if any exists)
-- This assumes Bybit data might have been inserted without exchange_type
UPDATE public.market_data 
SET exchange_type = 'bybit' 
WHERE exchange_type = 'binance' 
AND (
    -- Add conditions to identify Bybit data if you have specific patterns
    -- For now, this is a placeholder - adjust based on your data patterns
    symbol LIKE '%USDT' 
    AND timeframe IN ('1m', '5m', '15m', '1h', '4h', '1d')
    -- Add more specific conditions if you can identify Bybit data
);

-- Step 6: Verify the changes
SELECT 
    exchange_type,
    COUNT(*) as record_count,
    MIN(open_time) as earliest_candle,
    MAX(open_time) as latest_candle
FROM public.market_data 
GROUP BY exchange_type 
ORDER BY exchange_type;

-- Step 7: Check for any remaining NULL values
SELECT COUNT(*) as null_exchange_type_count
FROM public.market_data 
WHERE exchange_type IS NULL;

-- Optional: Clean up old data if needed (uncomment if you want to remove old records)
-- DELETE FROM public.market_data 
-- WHERE exchange_type IS NULL 
-- AND open_time < EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000;
