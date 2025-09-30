-- Add separate mainnet and testnet API credentials to user_settings
ALTER TABLE user_settings 
  ADD COLUMN IF NOT EXISTS binance_mainnet_api_key TEXT,
  ADD COLUMN IF NOT EXISTS binance_mainnet_api_secret TEXT,
  ADD COLUMN IF NOT EXISTS binance_testnet_api_key TEXT,
  ADD COLUMN IF NOT EXISTS binance_testnet_api_secret TEXT;

-- Migrate existing credentials to mainnet fields
UPDATE user_settings 
SET 
  binance_mainnet_api_key = binance_api_key,
  binance_mainnet_api_secret = binance_api_secret
WHERE binance_api_key IS NOT NULL;

-- Create user_trading_pairs table
CREATE TABLE IF NOT EXISTS user_trading_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  base_asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- Enable RLS on user_trading_pairs
ALTER TABLE user_trading_pairs ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_trading_pairs
CREATE POLICY "Users can view their own trading pairs"
  ON user_trading_pairs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trading pairs"
  ON user_trading_pairs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trading pairs"
  ON user_trading_pairs FOR DELETE
  USING (auth.uid() = user_id);

-- Add default trading pairs for existing users
INSERT INTO user_trading_pairs (user_id, symbol, base_asset, quote_asset)
SELECT DISTINCT user_id, 'BTCUSDT', 'BTC', 'USDT'
FROM user_settings
WHERE NOT EXISTS (
  SELECT 1 FROM user_trading_pairs 
  WHERE user_trading_pairs.user_id = user_settings.user_id 
  AND symbol = 'BTCUSDT'
);

INSERT INTO user_trading_pairs (user_id, symbol, base_asset, quote_asset)
SELECT DISTINCT user_id, 'ETHUSDT', 'ETH', 'USDT'
FROM user_settings
WHERE NOT EXISTS (
  SELECT 1 FROM user_trading_pairs 
  WHERE user_trading_pairs.user_id = user_settings.user_id 
  AND symbol = 'ETHUSDT'
);