-- Add strategy validation support
-- This migration creates tables for storing strategy validation results

-- Create strategy_validations table
CREATE TABLE IF NOT EXISTS public.strategy_validations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  validation_score INTEGER NOT NULL CHECK (validation_score >= 0 AND validation_score <= 100),
  is_valid BOOLEAN NOT NULL DEFAULT false,
  errors TEXT[] DEFAULT '{}',
  warnings TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  test_results JSONB DEFAULT '{}',
  report TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_strategy_validations_strategy_id ON public.strategy_validations(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_validations_user_id ON public.strategy_validations(user_id);
CREATE INDEX IF NOT EXISTS idx_strategy_validations_created_at ON public.strategy_validations(created_at);

-- Enable Row Level Security
ALTER TABLE public.strategy_validations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only view and modify their own validations
CREATE POLICY "Users can view their own validations" 
ON public.strategy_validations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own validations" 
ON public.strategy_validations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own validations" 
ON public.strategy_validations 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own validations" 
ON public.strategy_validations 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_strategy_validations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_strategy_validations_updated_at
BEFORE UPDATE ON public.strategy_validations
FOR EACH ROW
EXECUTE FUNCTION public.update_strategy_validations_updated_at();

-- Create function to get latest validation for a strategy
CREATE OR REPLACE FUNCTION public.get_latest_strategy_validation(p_strategy_id UUID)
RETURNS TABLE (
  id UUID,
  validation_score INTEGER,
  is_valid BOOLEAN,
  errors TEXT[],
  warnings TEXT[],
  recommendations TEXT[],
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sv.id,
    sv.validation_score,
    sv.is_valid,
    sv.errors,
    sv.warnings,
    sv.recommendations,
    sv.created_at
  FROM public.strategy_validations sv
  WHERE sv.strategy_id = p_strategy_id
  ORDER BY sv.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get validation statistics
CREATE OR REPLACE FUNCTION public.get_validation_statistics(p_user_id UUID)
RETURNS TABLE (
  total_validations INTEGER,
  valid_strategies INTEGER,
  invalid_strategies INTEGER,
  average_score DECIMAL(5,2),
  most_common_errors TEXT[],
  validation_trend JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH validation_stats AS (
    SELECT 
      COUNT(*) as total_validations,
      COUNT(*) FILTER (WHERE is_valid = true) as valid_strategies,
      COUNT(*) FILTER (WHERE is_valid = false) as invalid_strategies,
      AVG(validation_score) as average_score
    FROM public.strategy_validations
    WHERE user_id = p_user_id
  ),
  error_stats AS (
    SELECT 
      unnest(errors) as error_text,
      COUNT(*) as error_count
    FROM public.strategy_validations
    WHERE user_id = p_user_id
    GROUP BY unnest(errors)
    ORDER BY error_count DESC
    LIMIT 5
  ),
  trend_stats AS (
    SELECT 
      DATE_TRUNC('day', created_at) as validation_date,
      COUNT(*) as daily_validations,
      AVG(validation_score) as daily_avg_score
    FROM public.strategy_validations
    WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY validation_date
  )
  SELECT 
    vs.total_validations::INTEGER,
    vs.valid_strategies::INTEGER,
    vs.invalid_strategies::INTEGER,
    vs.average_score::DECIMAL(5,2),
    ARRAY_AGG(es.error_text ORDER BY es.error_count DESC) as most_common_errors,
    jsonb_build_object(
      'daily_validations', jsonb_agg(
        jsonb_build_object(
          'date', ts.validation_date,
          'count', ts.daily_validations,
          'avg_score', ts.daily_avg_score
        ) ORDER BY ts.validation_date
      )
    ) as validation_trend
  FROM validation_stats vs
  CROSS JOIN error_stats es
  CROSS JOIN trend_stats ts
  GROUP BY vs.total_validations, vs.valid_strategies, vs.invalid_strategies, vs.average_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean up old validations
CREATE OR REPLACE FUNCTION public.cleanup_old_validations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.strategy_validations
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE public.strategy_validations IS 'Stores validation results for trading strategies';
COMMENT ON COLUMN public.strategy_validations.validation_score IS 'Validation score from 0-100';
COMMENT ON COLUMN public.strategy_validations.is_valid IS 'Whether the strategy passed validation';
COMMENT ON COLUMN public.strategy_validations.errors IS 'Array of validation errors';
COMMENT ON COLUMN public.strategy_validations.warnings IS 'Array of validation warnings';
COMMENT ON COLUMN public.strategy_validations.recommendations IS 'Array of improvement recommendations';
COMMENT ON COLUMN public.strategy_validations.test_results IS 'JSON object containing test results';
COMMENT ON COLUMN public.strategy_validations.report IS 'Full validation report as text';

-- Create a view for easy access to validation results
CREATE OR REPLACE VIEW public.strategy_validation_summary AS
SELECT 
  s.id as strategy_id,
  s.name as strategy_name,
  s.strategy_type,
  s.status,
  sv.validation_score,
  sv.is_valid,
  sv.errors,
  sv.warnings,
  sv.recommendations,
  sv.created_at as last_validated,
  CASE 
    WHEN sv.created_at > NOW() - INTERVAL '7 days' THEN 'recent'
    WHEN sv.created_at > NOW() - INTERVAL '30 days' THEN 'stale'
    ELSE 'outdated'
  END as validation_status
FROM public.strategies s
LEFT JOIN LATERAL (
  SELECT *
  FROM public.strategy_validations sv2
  WHERE sv2.strategy_id = s.id
  ORDER BY sv2.created_at DESC
  LIMIT 1
) sv ON true;

-- Grant access to the view
GRANT SELECT ON public.strategy_validation_summary TO authenticated;
