-- Create table for tracking live strategy states
CREATE TABLE IF NOT EXISTS public.strategy_live_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  position_open BOOLEAN NOT NULL DEFAULT false,
  entry_price NUMERIC,
  entry_time TIMESTAMP WITH TIME ZONE,
  last_signal_time TIMESTAMP WITH TIME ZONE,
  range_high NUMERIC,
  range_low NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(strategy_id)
);

-- Enable RLS
ALTER TABLE public.strategy_live_states ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own strategy states"
ON public.strategy_live_states
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own strategy states"
ON public.strategy_live_states
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategy states"
ON public.strategy_live_states
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategy states"
ON public.strategy_live_states
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_strategy_live_states_strategy_id ON public.strategy_live_states(strategy_id);
CREATE INDEX idx_strategy_live_states_user_id ON public.strategy_live_states(user_id);