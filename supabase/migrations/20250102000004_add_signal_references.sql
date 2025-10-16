-- Add signal references table for tracking original signals
CREATE TABLE public.signal_references (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  price NUMERIC NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  trading_mode TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_signal_references_user_id ON public.signal_references(user_id);
CREATE INDEX idx_signal_references_signal_id ON public.signal_references(signal_id);
CREATE INDEX idx_signal_references_strategy_id ON public.signal_references(strategy_id);
CREATE INDEX idx_signal_references_symbol ON public.signal_references(symbol);
CREATE INDEX idx_signal_references_timestamp ON public.signal_references(timestamp);

-- Enable RLS
ALTER TABLE public.signal_references ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to insert signal references." ON public.signal_references
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to view their signal references." ON public.signal_references
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to update their signal references." ON public.signal_references
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to delete their signal references." ON public.signal_references
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add position events table for tracking position lifecycle
CREATE TABLE public.position_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id TEXT NOT NULL,
  original_signal_id TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'opened', 'closed', 'partial_closed', 'liquidated'
  symbol TEXT NOT NULL,
  entry_price NUMERIC,
  exit_price NUMERIC,
  position_size NUMERIC,
  pnl_percent NUMERIC,
  pnl_amount NUMERIC,
  reason TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  trading_mode TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for position events
CREATE INDEX idx_position_events_user_id ON public.position_events(user_id);
CREATE INDEX idx_position_events_signal_id ON public.position_events(signal_id);
CREATE INDEX idx_position_events_original_signal_id ON public.position_events(original_signal_id);
CREATE INDEX idx_position_events_strategy_id ON public.position_events(strategy_id);
CREATE INDEX idx_position_events_symbol ON public.position_events(symbol);
CREATE INDEX idx_position_events_event_type ON public.position_events(event_type);
CREATE INDEX idx_position_events_timestamp ON public.position_events(timestamp);

-- Enable RLS for position events
ALTER TABLE public.position_events ENABLE ROW LEVEL SECURITY;

-- Create policies for position events
CREATE POLICY "Allow authenticated users to insert position events." ON public.position_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to view their position events." ON public.position_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to update their position events." ON public.position_events
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to delete their position events." ON public.position_events
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
