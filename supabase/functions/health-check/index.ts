import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[HEALTH-CHECK] Starting system health check');

    const results: any = {
      success: true,
      timestamp: new Date().toISOString(),
    };

    // Check Bybit API health
    try {
      const startBybit = Date.now();
      const bybitResponse = await fetch('https://api.bybit.com/v5/market/time', {
        signal: AbortSignal.timeout(5000),
      });
      const bybitLatency = Date.now() - startBybit;

      if (bybitResponse.ok) {
        const bybitData = await bybitResponse.json();
        results.binanceApi = {
          status: bybitData.retCode === 0 ? 'healthy' : 'degraded',
          latency: bybitLatency,
        };
      } else {
        results.binanceApi = {
          status: 'degraded',
          latency: bybitLatency,
        };
      }
    } catch (error) {
      console.error('[HEALTH-CHECK] Bybit API check failed:', error);
      results.binanceApi = {
        status: 'down',
        latency: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Check database health
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const supabase = createClient(supabaseUrl, supabaseKey);

      const startDb = Date.now();
      const { error: dbError } = await supabase
        .from('user_settings')
        .select('count')
        .limit(1)
        .single();
      const dbLatency = Date.now() - startDb;

      results.database = {
        status: dbError ? 'degraded' : 'healthy',
        latency: dbLatency,
      };

      if (dbError) {
        console.error('[HEALTH-CHECK] Database check warning:', dbError);
      }
    } catch (error) {
      console.error('[HEALTH-CHECK] Database check failed:', error);
      results.database = {
        status: 'down',
        latency: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    console.log('[HEALTH-CHECK] Health check completed:', results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[HEALTH-CHECK] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Health check failed';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
