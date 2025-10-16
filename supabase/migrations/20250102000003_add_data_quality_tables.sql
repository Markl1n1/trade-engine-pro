-- Data Quality Tables
-- Tables for data quality monitoring and management

-- Data quality reports table
CREATE TABLE public.data_quality_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  quality_score DECIMAL(5,2) NOT NULL,
  overall_quality TEXT NOT NULL CHECK (overall_quality IN ('excellent', 'good', 'fair', 'poor')),
  issues_count INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data quality fixes table
CREATE TABLE public.data_quality_fixes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  original_count INTEGER NOT NULL,
  cleaned_count INTEGER NOT NULL,
  removed_count INTEGER NOT NULL,
  filled_count INTEGER NOT NULL,
  fixed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data quality alerts table
CREATE TABLE public.data_quality_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  metrics JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Data quality configuration table
CREATE TABLE public.data_quality_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.data_quality_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for data_quality_reports
CREATE POLICY "Anyone can view data quality reports" ON public.data_quality_reports
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert data quality reports" ON public.data_quality_reports
  FOR INSERT WITH CHECK (true);

-- RLS Policies for data_quality_fixes
CREATE POLICY "Users can view their own data quality fixes" ON public.data_quality_fixes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data quality fixes" ON public.data_quality_fixes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for data_quality_alerts
CREATE POLICY "Anyone can view data quality alerts" ON public.data_quality_alerts
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert data quality alerts" ON public.data_quality_alerts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update data quality alerts" ON public.data_quality_alerts
  FOR UPDATE USING (true);

-- RLS Policies for data_quality_configs
CREATE POLICY "Users can view their own data quality configs" ON public.data_quality_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data quality configs" ON public.data_quality_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own data quality configs" ON public.data_quality_configs
  FOR UPDATE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_data_quality_reports_symbol_timeframe ON public.data_quality_reports(symbol, timeframe);
CREATE INDEX idx_data_quality_reports_created_at ON public.data_quality_reports(created_at);
CREATE INDEX idx_data_quality_fixes_user_id ON public.data_quality_fixes(user_id);
CREATE INDEX idx_data_quality_fixes_fixed_at ON public.data_quality_fixes(fixed_at);
CREATE INDEX idx_data_quality_alerts_symbol_timeframe ON public.data_quality_alerts(symbol, timeframe);
CREATE INDEX idx_data_quality_alerts_severity ON public.data_quality_alerts(severity);
CREATE INDEX idx_data_quality_alerts_resolved ON public.data_quality_alerts(resolved);
CREATE INDEX idx_data_quality_configs_user_id ON public.data_quality_configs(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for data_quality_configs
CREATE TRIGGER update_data_quality_configs_updated_at
  BEFORE UPDATE ON public.data_quality_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
