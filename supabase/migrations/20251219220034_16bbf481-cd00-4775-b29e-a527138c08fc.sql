-- Add missing columns to user_settings_audit table for proper audit logging
ALTER TABLE public.user_settings_audit 
ADD COLUMN IF NOT EXISTS entity_type text,
ADD COLUMN IF NOT EXISTS entity_id text,
ADD COLUMN IF NOT EXISTS old_values jsonb,
ADD COLUMN IF NOT EXISTS new_values jsonb,
ADD COLUMN IF NOT EXISTS changed_fields text[];

-- Allow users to insert their own audit logs (drop if exists first)
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.user_settings_audit;
CREATE POLICY "Users can insert their own audit logs" 
ON public.user_settings_audit 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Delete market data older than 3 months
DELETE FROM public.market_data 
WHERE open_time < (EXTRACT(EPOCH FROM (NOW() - INTERVAL '3 months')) * 1000)::bigint;