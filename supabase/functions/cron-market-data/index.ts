import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[CRON-MARKET-DATA] Starting scheduled market data refresh...');

    // Call the load-market-data function
    const response = await fetch('https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/load-market-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indua2p0a2lncHlmbnRobmZtZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzk2MDcsImV4cCI6MjA3NDc1NTYwN30.OI2lkhbd7gmZhkLzhhprWc7gFjREE6YzA9i04v4zeJY'
      },
      body: JSON.stringify({ load: true })
    });

    const result = await response.json();
    
    console.log('[CRON-MARKET-DATA] Market data refresh completed:', result);

    // Log the result to system health
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await supabase.from('system_health_logs').insert({
      service_name: 'cron-market-data',
      status: response.ok ? 'healthy' : 'error',
      message: `Market data refresh ${response.ok ? 'completed' : 'failed'}`,
      metrics: {
        success: response.ok,
        timestamp: new Date().toISOString(),
        result: result
      }
    });

    return new Response(
      JSON.stringify({
        success: response.ok,
        message: 'Market data refresh completed',
        result: result,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CRON-MARKET-DATA] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
