-- Add exchange type selection and Bybit API credentials to user_settings
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS exchange_type TEXT DEFAULT 'binance' CHECK (exchange_type IN ('binance', 'bybit'));

ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS bybit_testnet_api_key TEXT,
ADD COLUMN IF NOT EXISTS bybit_testnet_api_secret TEXT,
ADD COLUMN IF NOT EXISTS bybit_mainnet_api_key TEXT,
ADD COLUMN IF NOT EXISTS bybit_mainnet_api_secret TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_exchange ON user_settings(user_id, exchange_type);

-- Set default exchange for existing users
UPDATE user_settings 
SET exchange_type = 'binance' 
WHERE exchange_type IS NULL;