-- Clean up inconsistent exchange_type values
DELETE FROM market_data WHERE exchange_type = 'bybit_spot';