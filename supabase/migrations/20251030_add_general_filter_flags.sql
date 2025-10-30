-- Add per-strategy general filter flags
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS general_filter_flags JSONB;

-- Optional: initialize to empty object for existing rows
UPDATE strategies
SET general_filter_flags = COALESCE(general_filter_flags, '{}'::jsonb);


