-- Удалить старое уникальное ограничение (только на 3 колонки)
ALTER TABLE public.market_data 
DROP CONSTRAINT IF EXISTS market_data_symbol_timeframe_open_time_key;

-- Создать новое уникальное ограничение (на 4 колонки включая exchange_type)
ALTER TABLE public.market_data 
ADD CONSTRAINT market_data_symbol_timeframe_open_time_exchange_type_key 
UNIQUE (symbol, timeframe, open_time, exchange_type);