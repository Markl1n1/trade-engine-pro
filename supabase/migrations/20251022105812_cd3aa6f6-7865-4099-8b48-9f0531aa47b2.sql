-- Fix search_path for trailing stop states trigger function
CREATE OR REPLACE FUNCTION update_trailing_stop_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';