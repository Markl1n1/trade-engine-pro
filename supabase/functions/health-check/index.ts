import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthMetrics {
  websocket_status: string;
  cron_status: string;
  buffered_signals_count: number;
  pending_signals_count: number;
  failed_signals_count: number;
  active_strategies_count: number;
  recent_signals_24h: number;
  api_reachable: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[HEALTH] Starting health check...');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const metrics: Partial<HealthMetrics> = {};

    // Check Binance API reachability
    try {
      const apiResponse = await fetch('https://fapi.binance.com/fapi/v1/ping', {
        signal: AbortSignal.timeout(5000),
      });
      metrics.api_reachable = apiResponse.ok;
    } catch {
      metrics.api_reachable = false;
    }

    // Count buffered signals
    const { count: bufferedCount } = await supabase
      .from('signal_buffer')
      .select('*', { count: 'exact', head: true })
      .eq('processed', false);
    metrics.buffered_signals_count = bufferedCount || 0;

    // Count pending signals
    const { count: pendingCount } = await supabase
      .from('strategy_signals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    metrics.pending_signals_count = pendingCount || 0;

    // Count failed signals
    const { count: failedCount } = await supabase
      .from('strategy_signals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');
    metrics.failed_signals_count = failedCount || 0;

    // Count active strategies
    const { count: activeStrategies } = await supabase
      .from('strategies')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    metrics.active_strategies_count = activeStrategies || 0;

    // Count recent signals (last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentSignals } = await supabase
      .from('strategy_signals')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', twentyFourHoursAgo);
    metrics.recent_signals_24h = recentSignals || 0;

    // Check cron job status
    const { data: cronRun } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'last_monitoring_run')
      .single();

    const lastRunTime = cronRun?.setting_value ? new Date(cronRun.setting_value) : null;
    const timeSinceLastRun = lastRunTime ? Date.now() - lastRunTime.getTime() : Infinity;
    metrics.cron_status = timeSinceLastRun < 15 * 60 * 1000 ? 'active' : 'stale';

    // Determine overall status
    let status = 'healthy';
    const warnings: string[] = [];

    if (!metrics.api_reachable) {
      status = 'degraded';
      warnings.push('Binance API unreachable');
    }

    if (metrics.buffered_signals_count > 50) {
      status = 'degraded';
      warnings.push(`High buffered signals: ${metrics.buffered_signals_count}`);
    }

    if (metrics.pending_signals_count > 100) {
      status = 'degraded';
      warnings.push(`High pending signals: ${metrics.pending_signals_count}`);
    }

    if (metrics.cron_status === 'stale') {
      status = 'error';
      warnings.push('Cron job not running (>15 min since last run)');
    }

    // Log health status
    await supabase.from('system_health_logs').insert({
      service_name: 'signal-delivery-system',
      status,
      message: warnings.length > 0 ? warnings.join('; ') : 'All systems operational',
      metrics: metrics as any,
    });

    const response = {
      status,
      warnings,
      metrics,
      timestamp: new Date().toISOString(),
      uptime: Deno.env.get('DENO_DEPLOYMENT_ID') || 'development',
    };

    console.log('[HEALTH] Check complete:', status);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: status === 'error' ? 503 : 200,
    });

  } catch (error) {
    console.error('[HEALTH] Health check failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
