-- Add new columns to strategy_conditions table for enhanced indicator comparisons
ALTER TABLE strategy_conditions 
ADD COLUMN period_1 integer,
ADD COLUMN period_2 integer,
ADD COLUMN indicator_type_2 indicator_type;

-- Add new operator types for indicator comparisons
ALTER TYPE condition_operator ADD VALUE IF NOT EXISTS 'indicator_comparison';

-- Update existing conditions to have default period of 14 for RSI
UPDATE strategy_conditions 
SET period_1 = 14 
WHERE indicator_type = 'rsi' AND period_1 IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN strategy_conditions.period_1 IS 'Period for the first indicator (e.g., 9, 21, 50, 200)';
COMMENT ON COLUMN strategy_conditions.period_2 IS 'Period for the second indicator when comparing two indicators';
COMMENT ON COLUMN strategy_conditions.indicator_type_2 IS 'Second indicator type when comparing two indicators (e.g., EMA 9 > EMA 21)';