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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`[REALTIME-MONITOR] Checking strategies for user: ${user.id}`);

    // Get active strategies for this user
    const { data: strategies, error: strategiesError } = await supabase
      .from('strategies')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (strategiesError) {
      throw new Error(`Failed to fetch strategies: ${strategiesError.message}`);
    }

    if (!strategies || strategies.length === 0) {
      console.log('[REALTIME-MONITOR] No active strategies found');
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          generatedSignals: [],
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // For real-time monitoring, we'll invoke the instant-signals function
    // which already has the logic to evaluate strategies and generate signals
    const generatedSignals = [];
    
    for (const strategy of strategies) {
      try {
        console.log(`[REALTIME-MONITOR] Processing strategy: ${strategy.name} (${strategy.id})`);
        
        // Call instant-signals for this strategy
        const { data: signalResult, error: signalError } = await supabase.functions.invoke(
          'instant-signals',
          {
            body: {
              strategy_id: strategy.id,
              symbol: strategy.symbol,
              timeframe: strategy.timeframe,
            },
          }
        );

        if (signalError) {
          console.error(`[REALTIME-MONITOR] Error processing strategy ${strategy.id}:`, signalError);
          continue;
        }

        if (signalResult?.signal) {
          generatedSignals.push({
            strategy_id: strategy.id,
            strategy_name: strategy.name,
            signal_type: signalResult.signal.signal_type,
            symbol: strategy.symbol,
            price: signalResult.signal.price,
            reason: signalResult.signal.reason,
          });
        }
      } catch (error) {
        console.error(`[REALTIME-MONITOR] Error processing strategy ${strategy.id}:`, error);
      }
    }

    console.log(`[REALTIME-MONITOR] Processed ${strategies.length} strategies, generated ${generatedSignals.length} signals`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: strategies.length,
        generatedSignals,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[REALTIME-MONITOR] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Real-time monitoring failed';
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
