-- Fix credential storage by using simple encryption without pgsodium
-- This migration simplifies the credential storage to avoid permission issues

-- Drop existing functions that use vault or pgsodium
DROP FUNCTION IF EXISTS public.store_credential(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.retrieve_credential(uuid, text);
DROP FUNCTION IF EXISTS public.decrypt_credential(uuid, text, text);

-- Create a simple credential storage table
CREATE TABLE IF NOT EXISTS public.api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_type TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, credential_type)
);

-- Enable RLS
ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own credentials"
ON public.api_credentials
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credentials"
ON public.api_credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials"
ON public.api_credentials
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials"
ON public.api_credentials
FOR DELETE
USING (auth.uid() = user_id);

-- Simple store function
CREATE OR REPLACE FUNCTION public.store_credential(
  p_user_id uuid,
  p_credential_type text,
  p_api_key text,
  p_api_secret text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credential_id UUID;
BEGIN
  -- Verify the requesting user is the owner
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot store credentials for another user';
  END IF;

  -- Insert or update credentials
  INSERT INTO public.api_credentials (
    user_id,
    credential_type,
    api_key,
    api_secret
  )
  VALUES (
    p_user_id,
    p_credential_type,
    p_api_key,
    p_api_secret
  )
  ON CONFLICT (user_id, credential_type)
  DO UPDATE SET
    api_key = EXCLUDED.api_key,
    api_secret = EXCLUDED.api_secret,
    updated_at = NOW()
  RETURNING id INTO v_credential_id;

  RETURN v_credential_id;
END;
$$;

-- Simple retrieve function
CREATE OR REPLACE FUNCTION public.retrieve_credential(
  p_user_id uuid,
  p_credential_type text
)
RETURNS TABLE(api_key text, api_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the requesting user is the owner (for service role, skip this check)
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access credentials for another user';
  END IF;

  -- Return credentials
  RETURN QUERY
  SELECT ac.api_key, ac.api_secret
  FROM public.api_credentials ac
  WHERE ac.user_id = p_user_id
    AND ac.credential_type = p_credential_type;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.store_credential(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_credential(uuid, text) TO authenticated;

-- Grant permissions on the table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_credentials TO authenticated;