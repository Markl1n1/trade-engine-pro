-- Add new indicator types to the enum
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'supertrend';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'td_sequential';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'anchored_vwap';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'bb_width';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'percent_b';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ema_crossover';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'kdj_j';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'psar';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'cmf';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ichimoku_tenkan';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ichimoku_kijun';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ichimoku_senkou_a';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ichimoku_senkou_b';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ichimoku_chikou';

-- Create table for exchange metrics
CREATE TABLE IF NOT EXISTS public.exchange_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ufr NUMERIC,
  ifer NUMERIC,
  gcr NUMERIC,
  dr NUMERIC,
  tmv NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exchange_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for exchange metrics
CREATE POLICY "Users can view their own exchange metrics"
ON public.exchange_metrics
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert exchange metrics"
ON public.exchange_metrics
FOR INSERT
WITH CHECK (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_exchange_metrics_user_symbol_time 
ON public.exchange_metrics(user_id, symbol, timestamp DESC);