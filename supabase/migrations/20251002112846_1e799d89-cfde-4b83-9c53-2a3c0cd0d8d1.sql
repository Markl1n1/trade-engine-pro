-- Add price-related indicators to the indicator_type enum
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'price';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'high';
ALTER TYPE indicator_type ADD VALUE IF NOT EXISTS 'low';