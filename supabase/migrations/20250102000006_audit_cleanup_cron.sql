-- Create cron job for automatic cleanup of audit logs
-- This will run on the 1st of every month at 00:00 to delete logs older than 1 month

SELECT cron.schedule(
  'cleanup-audit-logs',
  '0 0 1 * *', -- Every 1st of the month at 00:00
  $$
  -- Delete audit logs older than 1 month
  DELETE FROM public.audit_logs 
  WHERE created_at < NOW() - INTERVAL '1 month';
  
  -- Log the cleanup operation
  INSERT INTO public.system_health_logs (service_name, status, message, metrics)
  VALUES (
    'audit_cleanup', 
    'healthy', 
    'Audit logs cleaned up successfully',
    jsonb_build_object(
      'deleted_count', (SELECT COUNT(*) FROM public.audit_logs WHERE created_at < NOW() - INTERVAL '1 month'),
      'cleanup_date', NOW()
    )
  );
  $$
);

-- Create function to manually trigger audit cleanup (for testing)
CREATE OR REPLACE FUNCTION public.cleanup_audit_logs_manual()
RETURNS TABLE(deleted_count BIGINT, cleanup_date TIMESTAMP WITH TIME ZONE) AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  -- Count logs to be deleted
  SELECT COUNT(*) INTO deleted_count FROM public.audit_logs WHERE created_at < NOW() - INTERVAL '1 month';
  
  -- Delete the logs
  DELETE FROM public.audit_logs WHERE created_at < NOW() - INTERVAL '1 month';
  
  -- Log the cleanup operation
  INSERT INTO public.system_health_logs (service_name, status, message, metrics)
  VALUES (
    'audit_cleanup_manual', 
    'healthy', 
    'Manual audit logs cleanup completed',
    jsonb_build_object(
      'deleted_count', deleted_count,
      'cleanup_date', NOW()
    )
  );
  
  -- Return results
  RETURN QUERY SELECT deleted_count, NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to get audit log statistics
CREATE OR REPLACE FUNCTION public.get_audit_log_stats()
RETURNS TABLE(
  total_logs BIGINT,
  logs_last_24h BIGINT,
  logs_last_7d BIGINT,
  logs_last_30d BIGINT,
  oldest_log TIMESTAMP WITH TIME ZONE,
  newest_log TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    COUNT(*) as total_logs,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as logs_last_24h,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as logs_last_7d,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as logs_last_30d,
    MIN(created_at) as oldest_log,
    MAX(created_at) as newest_log
  FROM public.audit_logs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to get user audit logs (with pagination)
CREATE OR REPLACE FUNCTION public.get_user_audit_logs(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_action_type TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  action_type TEXT,
  entity_type TEXT,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    al.id,
    al.action_type,
    al.entity_type,
    al.entity_id,
    al.old_values,
    al.new_values,
    al.changed_fields,
    al.ip_address,
    al.user_agent,
    al.created_at
  FROM public.audit_logs al
  WHERE al.user_id = p_user_id
    AND (p_action_type IS NULL OR al.action_type = p_action_type)
    AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
  ORDER BY al.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add comments for documentation
COMMENT ON FUNCTION public.cleanup_audit_logs_manual() IS 'Manually trigger audit logs cleanup for testing purposes';
COMMENT ON FUNCTION public.get_audit_log_stats() IS 'Get statistics about audit logs';
COMMENT ON FUNCTION public.get_user_audit_logs(UUID, INTEGER, INTEGER, TEXT, TEXT) IS 'Get user audit logs with pagination and filtering';
