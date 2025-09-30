-- Expand indicator_type enum to include all 50+ indicators
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'WMA';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'KAMA';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'MAMA';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'DEMA';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'TEMA';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'WILDER_MA';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'VWMA';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'HULL_MA';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'STOCHASTIC';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'MOMENTUM';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'CCI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'CHAIKIN_OSC';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'AROON';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'WPR';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'MFI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'CMF';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'CRSI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'TMF';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'TRIX';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'TSI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ULTIMATE_OSC';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ROC';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'BOP';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'AWESOME_OSC';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ACCELERATOR_OSC';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'STOCH_RSI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'STC';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'RMI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'RCI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'SMA_RSI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'EMA_RSI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'SMI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'SMIE';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'CHMO';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'KDJ';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'VOLATILITY_STOP';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'TII';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'MCGINLEY';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'DEMAND_INDEX';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'BB_UPPER';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'BB_LOWER';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'BB_MIDDLE';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ADX';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'PLUS_DI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'MINUS_DI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'OBV';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'AD_LINE';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'PSAR';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'FIBONACCI';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'VWAP';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ICHIMOKU_TENKAN';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ICHIMOKU_KIJUN';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ICHIMOKU_SENKOU_A';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'ICHIMOKU_SENKOU_B';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'KELTNER_UPPER';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'KELTNER_LOWER';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'VOLUME';

-- Expand condition_operator enum for new comparison types
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'CROSSES_ABOVE';
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'CROSSES_BELOW';
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'BULLISH_DIVERGENCE';
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'BEARISH_DIVERGENCE';
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'BREAKOUT_ABOVE';
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'BREAKOUT_BELOW';
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'BOUNCE_OFF';
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'IN_RANGE';

-- Add new columns to strategy_conditions for advanced parameters
ALTER TABLE strategy_conditions 
ADD COLUMN IF NOT EXISTS deviation NUMERIC,
ADD COLUMN IF NOT EXISTS smoothing INTEGER,
ADD COLUMN IF NOT EXISTS multiplier NUMERIC,
ADD COLUMN IF NOT EXISTS acceleration NUMERIC,
ADD COLUMN IF NOT EXISTS lookback_bars INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS confirmation_bars INTEGER DEFAULT 0;

-- Create strategy templates table
CREATE TABLE IF NOT EXISTS strategy_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  symbol TEXT DEFAULT 'BTCUSDT',
  timeframe TEXT DEFAULT '1h',
  initial_capital NUMERIC DEFAULT 10000,
  position_size_percent NUMERIC DEFAULT 100,
  stop_loss_percent NUMERIC,
  take_profit_percent NUMERIC,
  template_data JSONB NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  usage_count INTEGER DEFAULT 0
);

-- Enable RLS on strategy_templates
ALTER TABLE strategy_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can view public templates
CREATE POLICY "Public templates are viewable by everyone"
ON strategy_templates FOR SELECT
USING (is_public = true OR created_by = auth.uid());

-- Users can create their own templates
CREATE POLICY "Users can create templates"
ON strategy_templates FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Create condition groups table for logical grouping
CREATE TABLE IF NOT EXISTS condition_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  group_operator TEXT DEFAULT 'AND',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on condition_groups
ALTER TABLE condition_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage condition groups for their strategies"
ON condition_groups FOR ALL
USING (EXISTS (
  SELECT 1 FROM strategies 
  WHERE strategies.id = condition_groups.strategy_id 
  AND strategies.user_id = auth.uid()
));

-- Add group_id to strategy_conditions
ALTER TABLE strategy_conditions 
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES condition_groups(id) ON DELETE SET NULL;

-- Insert popular strategy templates
INSERT INTO strategy_templates (name, description, category, template_data, is_public) VALUES
('EMA Golden Cross', 'Classic bullish crossover: Buy when EMA9 crosses above EMA21, sell when it crosses below', 'Moving Average', 
'{"buy_conditions": [{"indicator": "EMA", "period_1": 9, "operator": "CROSSES_ABOVE", "indicator_type_2": "EMA", "period_2": 21}], "sell_conditions": [{"indicator": "EMA", "period_1": 9, "operator": "CROSSES_BELOW", "indicator_type_2": "EMA", "period_2": 21}]}'::jsonb, true),

('RSI Mean Reversion', 'Buy oversold (RSI < 30), sell overbought (RSI > 70)', 'Oscillator',
'{"buy_conditions": [{"indicator": "RSI", "period_1": 14, "operator": "<", "value": 30}], "sell_conditions": [{"indicator": "RSI", "period_1": 14, "operator": ">", "value": 70}]}'::jsonb, true),

('MACD Momentum', 'Buy when MACD crosses above signal, sell when crosses below', 'Momentum',
'{"buy_conditions": [{"indicator": "MACD", "operator": "CROSSES_ABOVE", "indicator_type_2": "MACD_SIGNAL"}], "sell_conditions": [{"indicator": "MACD", "operator": "CROSSES_BELOW", "indicator_type_2": "MACD_SIGNAL"}]}'::jsonb, true),

('Bollinger Band Breakout', 'Buy on upper band breakout, sell on lower band breakout', 'Volatility',
'{"buy_conditions": [{"indicator": "PRICE", "operator": "BREAKOUT_ABOVE", "indicator_type_2": "BB_UPPER", "period_2": 20, "deviation": 2}], "sell_conditions": [{"indicator": "PRICE", "operator": "BREAKOUT_BELOW", "indicator_type_2": "BB_LOWER", "period_2": 20, "deviation": 2}]}'::jsonb, true),

('ADX Trend Following', 'Buy strong uptrend (ADX > 25 and +DI > -DI)', 'Trend',
'{"buy_conditions": [{"indicator": "ADX", "period_1": 14, "operator": ">", "value": 25}, {"indicator": "PLUS_DI", "operator": ">", "indicator_type_2": "MINUS_DI", "logical_operator": "AND"}], "sell_conditions": [{"indicator": "ADX", "period_1": 14, "operator": ">", "value": 25}, {"indicator": "MINUS_DI", "operator": ">", "indicator_type_2": "PLUS_DI", "logical_operator": "AND"}]}'::jsonb, true),

('Stochastic Reversal', 'Buy when Stochastic crosses above in oversold, sell when crosses below in overbought', 'Oscillator',
'{"buy_conditions": [{"indicator": "STOCHASTIC", "period_1": 14, "operator": "<", "value": 20}, {"indicator": "STOCH_K", "operator": "CROSSES_ABOVE", "indicator_type_2": "STOCH_D", "logical_operator": "AND"}], "sell_conditions": [{"indicator": "STOCHASTIC", "period_1": 14, "operator": ">", "value": 80}, {"indicator": "STOCH_K", "operator": "CROSSES_BELOW", "indicator_type_2": "STOCH_D", "logical_operator": "AND"}]}'::jsonb, true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_strategy_conditions_group ON strategy_conditions(group_id);
CREATE INDEX IF NOT EXISTS idx_strategy_conditions_indicator ON strategy_conditions(indicator_type);
CREATE INDEX IF NOT EXISTS idx_strategy_templates_category ON strategy_templates(category);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_time ON market_data(symbol, timeframe, open_time);