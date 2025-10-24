import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { auditLogsSchema, validateInput } from '../helpers/input-validation.ts';

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

    const rawRequest = await req.json();
    const request: AuditLogRequest = validateInput(auditLogsSchema, rawRequest);

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

    // Get oldest and newest from user_settings_audit
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

    const oldestLog = oldestSettings?.accessed_at || null;
    const newestLog = newestSettings?.accessed_at || null;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          total_logs: settingsTotal || 0,
          logs_last_24h: settings24h || 0,
          logs_last_7d: settings7d || 0,
          logs_last_30d: settings30d || 0,
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
    // Fetch from user_settings_audit
    const { data: settingsLogs, error: settingsError } = await supabase
      .from('user_settings_audit')
      .select('*')
      .eq('user_id', userId)
      .order('accessed_at', { ascending: false });

    if (settingsError) throw settingsError;

    // Map to common AuditLog shape
    const mappedSettingsLogs: AuditLog[] = (settingsLogs || []).map((log: any) => ({
      id: log.id,
      action_type: log.action,
      entity_type: log.entity_type || 'user_settings',
      entity_id: log.entity_id,
      old_values: log.old_values,
      new_values: log.new_values,
      changed_fields: log.changed_fields,
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      created_at: log.accessed_at
    }));

    // Sort by created_at desc
    let allLogs = mappedSettingsLogs
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

    // Delete from user_settings_audit
    const { data: deletedSettings, error: settingsError } = await supabase
      .from('user_settings_audit')
      .delete()
      .eq('user_id', userId)
      .lte('accessed_at', cutoff)
      .select('id');

    if (settingsError) throw settingsError;

    const deletedCount = deletedSettings?.length || 0;

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
