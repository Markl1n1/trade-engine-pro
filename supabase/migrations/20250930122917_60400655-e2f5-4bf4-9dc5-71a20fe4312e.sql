-- Create enum for strategy status
CREATE TYPE strategy_status AS ENUM ('draft', 'active', 'paused', 'archived');

-- Create enum for indicator types
CREATE TYPE indicator_type AS ENUM ('rsi', 'macd', 'sma', 'ema', 'bollinger_bands', 'stochastic', 'atr', 'adx');

-- Create enum for condition operators
CREATE TYPE condition_operator AS ENUM ('greater_than', 'less_than', 'equals', 'crosses_above', 'crosses_below', 'between');

-- Create enum for order types
CREATE TYPE order_type AS ENUM ('buy', 'sell');

-- Create strategies table
CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
  timeframe TEXT NOT NULL DEFAULT '1h',
  status strategy_status NOT NULL DEFAULT 'draft',
  initial_capital DECIMAL(20, 8) DEFAULT 10000,
  position_size_percent DECIMAL(5, 2) DEFAULT 100,
  stop_loss_percent DECIMAL(5, 2),
  take_profit_percent DECIMAL(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create strategy_conditions table
CREATE TABLE public.strategy_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  order_type order_type NOT NULL,
  indicator_type indicator_type NOT NULL,
  operator condition_operator NOT NULL,
  value DECIMAL(20, 8) NOT NULL,
  value2 DECIMAL(20, 8),
  logical_operator TEXT DEFAULT 'AND',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create strategy_backtest_results table
CREATE TABLE public.strategy_backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  initial_balance DECIMAL(20, 8) NOT NULL,
  final_balance DECIMAL(20, 8) NOT NULL,
  total_return DECIMAL(10, 2) NOT NULL,
  total_trades INTEGER NOT NULL,
  winning_trades INTEGER NOT NULL,
  losing_trades INTEGER NOT NULL,
  win_rate DECIMAL(5, 2) NOT NULL,
  max_drawdown DECIMAL(10, 2) NOT NULL,
  sharpe_ratio DECIMAL(10, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_backtest_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for strategies
CREATE POLICY "Users can view their own strategies"
  ON public.strategies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own strategies"
  ON public.strategies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategies"
  ON public.strategies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategies"
  ON public.strategies FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for strategy_conditions
CREATE POLICY "Users can view conditions for their strategies"
  ON public.strategy_conditions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.strategies
    WHERE strategies.id = strategy_conditions.strategy_id
    AND strategies.user_id = auth.uid()
  ));

CREATE POLICY "Users can create conditions for their strategies"
  ON public.strategy_conditions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.strategies
    WHERE strategies.id = strategy_conditions.strategy_id
    AND strategies.user_id = auth.uid()
  ));

CREATE POLICY "Users can update conditions for their strategies"
  ON public.strategy_conditions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.strategies
    WHERE strategies.id = strategy_conditions.strategy_id
    AND strategies.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete conditions for their strategies"
  ON public.strategy_conditions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.strategies
    WHERE strategies.id = strategy_conditions.strategy_id
    AND strategies.user_id = auth.uid()
  ));

-- RLS Policies for strategy_backtest_results
CREATE POLICY "Users can view backtest results for their strategies"
  ON public.strategy_backtest_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.strategies
    WHERE strategies.id = strategy_backtest_results.strategy_id
    AND strategies.user_id = auth.uid()
  ));

CREATE POLICY "Users can create backtest results for their strategies"
  ON public.strategy_backtest_results FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.strategies
    WHERE strategies.id = strategy_backtest_results.strategy_id
    AND strategies.user_id = auth.uid()
  ));

-- Create indexes for better performance
CREATE INDEX idx_strategies_user_id ON public.strategies(user_id);
CREATE INDEX idx_strategy_conditions_strategy_id ON public.strategy_conditions(strategy_id);
CREATE INDEX idx_strategy_backtest_results_strategy_id ON public.strategy_backtest_results(strategy_id);

-- Create trigger for updated_at
CREATE TRIGGER update_strategies_updated_at
  BEFORE UPDATE ON public.strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_settings_updated_at();