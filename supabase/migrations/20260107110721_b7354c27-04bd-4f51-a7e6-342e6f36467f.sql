-- Create table for scheduled backtest runs
CREATE TABLE public.scheduled_backtest_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  strategy_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'scheduled',
  backtest_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB,
  summary_log TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_backtest_runs ENABLE ROW LEVEL SECURITY;

-- Create policies - users can view runs for their own strategies
CREATE POLICY "Users can view scheduled runs for their strategies"
ON public.scheduled_backtest_runs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM strategies
    WHERE strategies.id = scheduled_backtest_runs.strategy_id
    AND strategies.user_id = auth.uid()
  )
);

-- Service role can insert/update (for cron job)
CREATE POLICY "Service role can insert scheduled runs"
ON public.scheduled_backtest_runs
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update scheduled runs"
ON public.scheduled_backtest_runs
FOR UPDATE
USING (true);

-- Create index for efficient queries
CREATE INDEX idx_scheduled_backtest_runs_date ON public.scheduled_backtest_runs(run_date DESC);
CREATE INDEX idx_scheduled_backtest_runs_strategy ON public.scheduled_backtest_runs(strategy_id);
CREATE INDEX idx_scheduled_backtest_runs_status ON public.scheduled_backtest_runs(status);