-- Create secure RPC function to retrieve user settings
CREATE OR REPLACE FUNCTION public.get_user_settings(p_user_id UUID)
RETURNS TABLE (
  exchange_type TEXT,
  use_testnet BOOLEAN,
  trading_mode TEXT,
  use_mainnet_data BOOLEAN,
  paper_trading_mode BOOLEAN,
  use_testnet_api BOOLEAN
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Verify the requesting user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Verify the requesting user matches the requested user_id
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access settings for another user';
  END IF;

  -- Return user settings
  RETURN QUERY
  SELECT 
    us.exchange_type,
    us.use_testnet,
    us.trading_mode,
    us.use_mainnet_data,
    us.paper_trading_mode,
    us.use_testnet_api
  FROM user_settings us
  WHERE us.user_id = p_user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_settings(UUID) TO authenticated;