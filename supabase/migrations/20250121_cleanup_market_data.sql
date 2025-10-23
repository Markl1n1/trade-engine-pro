-- Clean up market_data table and reset for fresh data
-- This will remove all existing data and ensure clean structure

-- Remove all existing market data
DELETE FROM market_data;

-- Reset any sequences if they exist
-- (market_data doesn't use sequences, but good practice)

-- Add comment about the cleanup
COMMENT ON TABLE market_data IS 'Market data table - cleaned and reset on 2025-01-21. Data will be automatically populated every 30 minutes.';
