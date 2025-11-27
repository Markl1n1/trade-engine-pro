-- Create order_executions table to track actual fills
CREATE TABLE IF NOT EXISTS public.order_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id TEXT NOT NULL,
  strategy_id UUID REFERENCES public.strategies(id),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  order_id TEXT NOT NULL,
  quantity DECIMAL NOT NULL,
  signal_price DECIMAL NOT NULL,
  execution_price DECIMAL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  status TEXT NOT NULL DEFAULT 'pending',
  exchange TEXT NOT NULL DEFAULT 'bybit',
  testnet BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  exit_price DECIMAL,
  pnl_percent DECIMAL,
  pnl_amount DECIMAL,
  close_reason TEXT
);

-- Enable RLS
ALTER TABLE public.order_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own order executions"
ON public.order_executions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own order executions"
ON public.order_executions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own order executions"
ON public.order_executions FOR UPDATE
USING (auth.uid() = user_id);

-- Add last_signal_candle_time to strategy_live_states for deduplication
ALTER TABLE public.strategy_live_states 
ADD COLUMN IF NOT EXISTS last_signal_candle_time BIGINT;