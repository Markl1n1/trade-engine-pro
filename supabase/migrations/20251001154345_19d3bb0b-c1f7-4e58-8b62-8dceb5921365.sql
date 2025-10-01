-- Add composite indexes for performance optimization

-- Optimize strategy conditions queries (used heavily during backtesting)
CREATE INDEX IF NOT EXISTS idx_strategy_conditions_composite 
ON strategy_conditions(strategy_id, order_type, order_index);

-- Optimize market data queries (used for historical data retrieval)
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timeframe_time 
ON market_data(symbol, timeframe, open_time DESC);

-- Optimize strategy signals queries
CREATE INDEX IF NOT EXISTS idx_strategy_signals_user_strategy 
ON strategy_signals(user_id, strategy_id, created_at DESC);

-- Add index for condition groups
CREATE INDEX IF NOT EXISTS idx_condition_groups_strategy 
ON condition_groups(strategy_id, order_index);