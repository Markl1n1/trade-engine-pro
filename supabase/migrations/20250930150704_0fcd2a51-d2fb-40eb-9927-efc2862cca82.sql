-- Add audit logging for API key access
CREATE TABLE IF NOT EXISTS user_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  accessed_at timestamp with time zone DEFAULT now(),
  ip_address text,
  user_agent text
);

ALTER TABLE user_settings_audit ENABLE ROW LEVEL SECURITY;

-- Only users can see their own audit logs
CREATE POLICY "Users can view their own audit logs"
ON user_settings_audit
FOR SELECT
USING (auth.uid() = user_id);

-- Create function to log API key access
CREATE OR REPLACE FUNCTION log_api_key_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log when API keys are accessed
  IF (TG_OP = 'SELECT' AND (
    NEW.binance_api_key IS NOT NULL OR 
    NEW.binance_api_secret IS NOT NULL
  )) THEN
    INSERT INTO user_settings_audit (user_id, action)
    VALUES (NEW.user_id, 'api_keys_accessed');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add constraints to ensure API keys are not null when set
ALTER TABLE user_settings 
ADD CONSTRAINT check_api_key_format CHECK (
  binance_api_key IS NULL OR length(binance_api_key) > 10
);

ALTER TABLE user_settings 
ADD CONSTRAINT check_api_secret_format CHECK (
  binance_api_secret IS NULL OR length(binance_api_secret) > 10
);

-- Create a function that only returns API keys when explicitly requested
-- This prevents accidental exposure in general queries
CREATE OR REPLACE FUNCTION get_user_api_credentials(user_uuid uuid)
RETURNS TABLE (
  binance_api_key text,
  binance_api_secret text,
  use_testnet boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the requesting user is the owner
  IF auth.uid() != user_uuid THEN
    RAISE EXCEPTION 'Unauthorized access to API credentials';
  END IF;
  
  -- Log the access
  INSERT INTO user_settings_audit (user_id, action)
  VALUES (user_uuid, 'api_credentials_retrieved');
  
  -- Return the credentials
  RETURN QUERY
  SELECT 
    us.binance_api_key,
    us.binance_api_secret,
    us.use_testnet
  FROM user_settings us
  WHERE us.user_id = user_uuid;
END;
$$;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id_accessed_at ON user_settings_audit(user_id, accessed_at DESC);

-- Add helpful comments
COMMENT ON TABLE user_settings_audit IS 'Audit log for tracking access to sensitive API credentials';
COMMENT ON FUNCTION get_user_api_credentials IS 'Secure function to retrieve API credentials with audit logging. Only returns credentials for the authenticated user.';
COMMENT ON CONSTRAINT check_api_key_format ON user_settings IS 'Ensures API keys meet minimum length requirements';

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_user_api_credentials TO authenticated;