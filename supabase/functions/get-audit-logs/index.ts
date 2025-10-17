import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AuditLogRequest {
  action?: 'get_logs' | 'get_stats' | 'cleanup';
  limit?: number;
  offset?: number;
  action_type?: string;
  entity_type?: string;
}

interface AuditLog {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id?: string;
  old_values?: any;
  new_values?: any;
  changed_fields?: string[];
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

interface AuditStats {
  total_logs: number;
  logs_last_24h: number;
  logs_last_7d: number;
  logs_last_30d: number;
  oldest_log: string;
  newest_log: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const request: AuditLogRequest = await req.json();

    switch (request.action) {
      case 'get_stats':
        return await handleGetStats(supabase, user.id);
      
      case 'cleanup':
        return await handleCleanup(supabase, user.id);
      
      case 'get_logs':
      default:
        return await handleGetLogs(supabase, user.id, request);
    }

  } catch (error: any) {
    console.error('Error in get-audit-logs:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function handleGetStats(supabase: any, userId: string): Promise<Response> {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get counts from security_audit_log
    const { count: securityTotal } = await supabase
      .from('security_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: security24h } = await supabase
      .from('security_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', last24h.toISOString());

    const { count: security7d } = await supabase
      .from('security_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', last7d.toISOString());

    const { count: security30d } = await supabase
      .from('security_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', last30d.toISOString());

    // Get counts from user_settings_audit
    const { count: settingsTotal } = await supabase
      .from('user_settings_audit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: settings24h } = await supabase
      .from('user_settings_audit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('accessed_at', last24h.toISOString());

    const { count: settings7d } = await supabase
      .from('user_settings_audit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('accessed_at', last7d.toISOString());

    const { count: settings30d } = await supabase
      .from('user_settings_audit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('accessed_at', last30d.toISOString());

    // Get oldest and newest from both tables
    const { data: oldestSecurity } = await supabase
      .from('security_audit_log')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    const { data: newestSecurity } = await supabase
      .from('security_audit_log')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const { data: oldestSettings } = await supabase
      .from('user_settings_audit')
      .select('accessed_at')
      .eq('user_id', userId)
      .order('accessed_at', { ascending: true })
      .limit(1)
      .single();

    const { data: newestSettings } = await supabase
      .from('user_settings_audit')
      .select('accessed_at')
      .eq('user_id', userId)
      .order('accessed_at', { ascending: false })
      .limit(1)
      .single();

    const oldestLog = [oldestSecurity?.created_at, oldestSettings?.accessed_at]
      .filter(Boolean)
      .sort()[0] || null;

    const newestLog = [newestSecurity?.created_at, newestSettings?.accessed_at]
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          total_logs: (securityTotal || 0) + (settingsTotal || 0),
          logs_last_24h: (security24h || 0) + (settings24h || 0),
          logs_last_7d: (security7d || 0) + (settings7d || 0),
          logs_last_30d: (security30d || 0) + (settings30d || 0),
          oldest_log: oldestLog,
          newest_log: newestLog
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    throw new Error(`Failed to get audit stats: ${error.message}`);
  }
}

async function handleGetLogs(supabase: any, userId: string, request: AuditLogRequest): Promise<Response> {
  try {
    // Fetch from security_audit_log
    const { data: securityLogs, error: securityError } = await supabase
      .from('security_audit_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (securityError) throw securityError;

    // Fetch from user_settings_audit
    const { data: settingsLogs, error: settingsError } = await supabase
      .from('user_settings_audit')
      .select('*')
      .eq('user_id', userId)
      .order('accessed_at', { ascending: false });

    if (settingsError) throw settingsError;

    // Map to common AuditLog shape
    const mappedSecurityLogs: AuditLog[] = (securityLogs || []).map((log: any) => ({
      id: log.id,
      action_type: log.action,
      entity_type: log.table_name,
      entity_id: log.record_id,
      old_values: null,
      new_values: null,
      changed_fields: [],
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      created_at: log.created_at
    }));

    const mappedSettingsLogs: AuditLog[] = (settingsLogs || []).map((log: any) => ({
      id: log.id,
      action_type: log.action,
      entity_type: 'user_settings',
      entity_id: null,
      old_values: null,
      new_values: null,
      changed_fields: [],
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      created_at: log.accessed_at
    }));

    // Merge and sort by created_at desc
    let allLogs = [...mappedSecurityLogs, ...mappedSettingsLogs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply filters
    if (request.action_type) {
      allLogs = allLogs.filter(log => log.action_type === request.action_type);
    }
    if (request.entity_type) {
      allLogs = allLogs.filter(log => log.entity_type === request.entity_type);
    }

    // Paginate
    const offset = request.offset || 0;
    const limit = request.limit || 50;
    const paginatedLogs = allLogs.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({
        success: true,
        data: paginatedLogs
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    throw new Error(`Failed to get audit logs: ${error.message}`);
  }
}

async function handleCleanup(supabase: any, userId: string): Promise<Response> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoff = cutoffDate.toISOString();

    // Delete from security_audit_log
    const { data: deletedSecurity, error: securityError } = await supabase
      .from('security_audit_log')
      .delete()
      .eq('user_id', userId)
      .lte('created_at', cutoff)
      .select('id');

    if (securityError) throw securityError;

    // Delete from user_settings_audit
    const { data: deletedSettings, error: settingsError } = await supabase
      .from('user_settings_audit')
      .delete()
      .eq('user_id', userId)
      .lte('accessed_at', cutoff)
      .select('id');

    if (settingsError) throw settingsError;

    const deletedCount = (deletedSecurity?.length || 0) + (deletedSettings?.length || 0);

    return new Response(
      JSON.stringify({
        success: true,
        data: { deleted_count: deletedCount, cleanup_date: new Date().toISOString() }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    throw new Error(`Failed to cleanup audit logs: ${error.message}`);
  }
}
