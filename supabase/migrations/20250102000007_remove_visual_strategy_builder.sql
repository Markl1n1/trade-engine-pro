-- Remove visual strategy builder tables and columns
-- This migration removes the visual strategy builder functionality

-- Drop strategy_conditions table (used for visual builder)
DROP TABLE IF EXISTS public.strategy_conditions CASCADE;

-- Drop strategy_backtest_results table (will be recreated with proper structure)
DROP TABLE IF EXISTS public.strategy_backtest_results CASCADE;

-- Remove visual builder columns from strategies table
ALTER TABLE public.strategies DROP COLUMN IF EXISTS position_size_percent;
ALTER TABLE public.strategies DROP COLUMN IF EXISTS stop_loss_percent;
ALTER TABLE public.strategies DROP COLUMN IF EXISTS take_profit_percent;

-- Add new columns for coded strategies
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS sma_fast_period INTEGER;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS sma_slow_period INTEGER;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS rsi_period INTEGER;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS rsi_overbought INTEGER;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS rsi_oversold INTEGER;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS volume_multiplier DECIMAL(5,2);

-- Drop unused enums
DROP TYPE IF EXISTS indicator_type CASCADE;
DROP TYPE IF EXISTS condition_operator CASCADE;
DROP TYPE IF EXISTS order_type CASCADE;

-- Create new strategy_backtest_results table with proper structure
CREATE TABLE public.strategy_backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_balance DECIMAL(20, 8) NOT NULL,
  final_balance DECIMAL(20, 8) NOT NULL,
  total_return DECIMAL(10, 4) NOT NULL,
  total_trades INTEGER NOT NULL DEFAULT 0,
  win_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
  max_drawdown DECIMAL(5, 2) NOT NULL DEFAULT 0,
  profit_factor DECIMAL(10, 4) NOT NULL DEFAULT 0,
  trades JSONB,
  balance_history JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.strategy_backtest_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view their own backtest results." ON public.strategy_backtest_results
  FOR SELECT TO authenticated USING (
    strategy_id IN (
      SELECT id FROM public.strategies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Allow authenticated users to insert their own backtest results." ON public.strategy_backtest_results
  FOR INSERT TO authenticated WITH CHECK (
    strategy_id IN (
      SELECT id FROM public.strategies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Allow authenticated users to update their own backtest results." ON public.strategy_backtest_results
  FOR UPDATE TO authenticated USING (
    strategy_id IN (
      SELECT id FROM public.strategies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Allow authenticated users to delete their own backtest results." ON public.strategy_backtest_results
  FOR DELETE TO authenticated USING (
    strategy_id IN (
      SELECT id FROM public.strategies WHERE user_id = auth.uid()
    )
  );
