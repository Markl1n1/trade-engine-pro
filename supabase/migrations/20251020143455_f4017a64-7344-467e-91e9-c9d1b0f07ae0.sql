-- 1) Columns for SMA 20/200 with RSI (and ATR-based SL/TP, volume filter)
ALTER TABLE public.strategies
ADD COLUMN IF NOT EXISTS sma_fast_period numeric DEFAULT 20,
ADD COLUMN IF NOT EXISTS sma_slow_period numeric DEFAULT 200,
ADD COLUMN IF NOT EXISTS rsi_period numeric DEFAULT 14,
ADD COLUMN IF NOT EXISTS rsi_overbought numeric DEFAULT 70,
ADD COLUMN IF NOT EXISTS rsi_oversold numeric DEFAULT 30,
ADD COLUMN IF NOT EXISTS volume_multiplier numeric DEFAULT 1.2,
ADD COLUMN IF NOT EXISTS atr_sl_multiplier numeric DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS atr_tp_multiplier numeric DEFAULT 3.0;

COMMENT ON COLUMN public.strategies.sma_fast_period IS 'Fast SMA period (default 20)';
COMMENT ON COLUMN public.strategies.sma_slow_period IS 'Slow SMA period (default 200)';
COMMENT ON COLUMN public.strategies.rsi_period IS 'RSI period (default 14)';
COMMENT ON COLUMN public.strategies.rsi_overbought IS 'RSI overbought threshold (default 70)';
COMMENT ON COLUMN public.strategies.rsi_oversold IS 'RSI oversold threshold (default 30)';
COMMENT ON COLUMN public.strategies.volume_multiplier IS 'Current volume vs 20-SMA volume multiplier (default 1.2x)';
COMMENT ON COLUMN public.strategies.atr_sl_multiplier IS 'ATR-based SL multiplier (default 2.0)';
COMMENT ON COLUMN public.strategies.atr_tp_multiplier IS 'ATR-based TP multiplier (default 3.0)';

-- 2) Columns for Multi-Timeframe Momentum (configurable but optional; code has defaults)
ALTER TABLE public.strategies
ADD COLUMN IF NOT EXISTS mtf_rsi_period numeric DEFAULT 14,
ADD COLUMN IF NOT EXISTS mtf_rsi_entry_threshold numeric DEFAULT 55,
ADD COLUMN IF NOT EXISTS mtf_macd_fast numeric DEFAULT 12,
ADD COLUMN IF NOT EXISTS mtf_macd_slow numeric DEFAULT 26,
ADD COLUMN IF NOT EXISTS mtf_macd_signal numeric DEFAULT 9,
ADD COLUMN IF NOT EXISTS mtf_volume_multiplier numeric DEFAULT 1.2;

COMMENT ON COLUMN public.strategies.mtf_rsi_period IS 'MTF RSI period (default 14)';
COMMENT ON COLUMN public.strategies.mtf_rsi_entry_threshold IS 'MTF RSI entry threshold for long; 100-threshold for short (default 55)';
COMMENT ON COLUMN public.strategies.mtf_macd_fast IS 'MACD fast EMA (default 12)';
COMMENT ON COLUMN public.strategies.mtf_macd_slow IS 'MACD slow EMA (default 26)';
COMMENT ON COLUMN public.strategies.mtf_macd_signal IS 'MACD signal EMA (default 9)';
COMMENT ON COLUMN public.strategies.mtf_volume_multiplier IS 'Volume confirmation multiplier vs 20-SMA volume (default 1.2x)';

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_strategies_strategy_type ON public.strategies (strategy_type);
CREATE INDEX IF NOT EXISTS idx_strategies_status_type ON public.strategies (status, strategy_type);

-- 4) Optional migration: convert legacy MSTG to new MTF Momentum
UPDATE public.strategies
SET strategy_type = 'mtf_momentum'
WHERE strategy_type = 'market_sentiment_trend_gauge';

-- 5) Example inserts (safe to ignore on conflict)
-- SMA 20/200 + RSI (Scalp)
INSERT INTO public.strategies (
  user_id, name, description, symbol, timeframe, status,
  strategy_type,
  sma_fast_period, sma_slow_period, rsi_period, rsi_overbought, rsi_oversold,
  volume_multiplier, atr_sl_multiplier, atr_tp_multiplier,
  stop_loss_percent, take_profit_percent, created_at, updated_at
)
SELECT
  (SELECT id FROM auth.users LIMIT 1) as user_id,
  'SMA 20/200 RSI (Scalp)',
  'Scalping SMA 20/200 crossover with RSI filter and volume confirmation',
  'BTCUSDT',
  '1m',
  'active',
  'sma_20_200_rsi',
  20, 200, 14, 70, 30,
  1.2, 2.0, 3.0,
  0.6, 0.9,
  now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users)
ON CONFLICT DO NOTHING;

-- MTF Momentum (Scalp)
INSERT INTO public.strategies (
  user_id, name, description, symbol, timeframe, status,
  strategy_type,
  mtf_rsi_period, mtf_rsi_entry_threshold, mtf_macd_fast, mtf_macd_slow, mtf_macd_signal,
  mtf_volume_multiplier,
  stop_loss_percent, take_profit_percent, created_at, updated_at
)
SELECT
  (SELECT id FROM auth.users LIMIT 1) as user_id,
  'MTF Momentum (Scalp)',
  '1m/5m/15m confluence: RSI>threshold, MACD histogram alignment, volume confirmation',
  'BTCUSDT',
  '1m',
  'active',
  'mtf_momentum',
  14, 55, 12, 26, 9,
  1.2,
  0.5, 0.75,
  now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users)
ON CONFLICT DO NOTHING;