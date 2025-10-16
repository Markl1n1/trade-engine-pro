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
        return await handleCleanup(supabase);
      
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
    const { data: stats, error } = await supabase.rpc('get_audit_log_stats');
    
    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        data: stats[0] || {
          total_logs: 0,
          logs_last_24h: 0,
          logs_last_7d: 0,
          logs_last_30d: 0,
          oldest_log: null,
          newest_log: null
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
    const { data: logs, error } = await supabase.rpc('get_user_audit_logs', {
      p_user_id: userId,
      p_limit: request.limit || 50,
      p_offset: request.offset || 0,
      p_action_type: request.action_type || null,
      p_entity_type: request.entity_type || null
    });
    
    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        data: logs || []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    throw new Error(`Failed to get audit logs: ${error.message}`);
  }
}

async function handleCleanup(supabase: any): Promise<Response> {
  try {
    const { data: result, error } = await supabase.rpc('cleanup_audit_logs_manual');
    
    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        data: result[0] || { deleted_count: 0, cleanup_date: new Date().toISOString() }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    throw new Error(`Failed to cleanup audit logs: ${error.message}`);
  }
}
