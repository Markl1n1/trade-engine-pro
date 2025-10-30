import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getStrategyMonitorConfig } from '../helpers/strategy-config-loader.ts';

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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Get user from auth header using anon key client for proper JWT validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[REALTIME-MONITOR] No authorization header provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with anon key to validate JWT
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await anonClient.auth.getUser();

    if (userError || !user) {
      console.error('[REALTIME-MONITOR] Auth error:', userError?.message || 'No user found');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[REALTIME-MONITOR] Checking strategies for user: ${user.id}`);

    // Get active strategies for this user
    const { data: strategies, error: strategiesError } = await supabase
      .from('strategies')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
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

    // Evaluate strategies directly without calling instant-signals
    const generatedSignals = [];
    
    for (const strategy of strategies) {
      try {
        console.log(`[REALTIME-MONITOR] Evaluating strategy: ${strategy.name} (${strategy.id})`);
        
        // Fetch market data for this strategy
        const { data: candles, error: candlesError } = await supabase
          .from('market_data')
          .select('*')
          .eq('symbol', strategy.symbol)
          .eq('timeframe', strategy.timeframe)
          .order('open_time', { ascending: false })
          .limit(500);

        if (candlesError) {
          console.error(`[REALTIME-MONITOR] Error fetching candles for ${strategy.id}:`, candlesError);
          continue;
        }

        if (!candles || candles.length === 0) {
          console.log(`[REALTIME-MONITOR] No candles available for ${strategy.symbol} ${strategy.timeframe}`);
          continue;
        }

        // Sort candles by timestamp ascending for strategy evaluation
        const sortedCandles = candles.sort((a, b) => a.open_time - b.open_time);
        
        // Convert database candles to strategy format
        const formattedCandles = sortedCandles.map(c => ({
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.volume),
          timestamp: c.open_time
        }));

        // Evaluate strategy based on type
        let signal = null;
        const currentPrice = formattedCandles[formattedCandles.length - 1].close;

        switch (strategy.strategy_type) {
          case 'sma_crossover': {
            const { evaluateSMACrossoverStrategy } = await import('../helpers/sma-crossover-strategy.ts');
            const config = getStrategyMonitorConfig(strategy, 'sma_crossover');
            signal = evaluateSMACrossoverStrategy(formattedCandles, config, false);
            break;
          }
          
          case 'mtf_momentum': {
            const { evaluateMTFMomentum } = await import('../helpers/mtf-momentum-strategy.ts');
            
            // Fetch actual 1m, 5m, and 15m data from database for true MTF analysis
            const { data: candles1m, error: error1m } = await supabase
              .from('market_data')
              .select('*')
              .eq('symbol', strategy.symbol)
              .eq('timeframe', '1m')
              .order('open_time', { ascending: false })
              .limit(500);
            
            const { data: candles5m, error: error5m } = await supabase
              .from('market_data')
              .select('*')
              .eq('symbol', strategy.symbol)
              .eq('timeframe', '5m')
              .order('open_time', { ascending: false })
              .limit(200);
            
            const { data: candles15m, error: error15m } = await supabase
              .from('market_data')
              .select('*')
              .eq('symbol', strategy.symbol)
              .eq('timeframe', '15m')
              .order('open_time', { ascending: false })
              .limit(100);
            
            if (error1m || error5m || error15m || !candles1m || !candles5m || !candles15m) {
              console.error('[REALTIME-MONITOR] Error fetching MTF data:', { error1m, error5m, error15m });
              continue;
            }
            
            const formatted1m = candles1m.sort((a, b) => a.open_time - b.open_time).map(c => ({
              open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low),
              close: parseFloat(c.close), volume: parseFloat(c.volume), timestamp: c.open_time
            }));
            
            const formatted5m = candles5m.sort((a, b) => a.open_time - b.open_time).map(c => ({
              open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low),
              close: parseFloat(c.close), volume: parseFloat(c.volume), timestamp: c.open_time
            }));
            
            const formatted15m = candles15m.sort((a, b) => a.open_time - b.open_time).map(c => ({
              open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low),
              close: parseFloat(c.close), volume: parseFloat(c.volume), timestamp: c.open_time
            }));
            
            const config = getStrategyMonitorConfig(strategy, 'mtf_momentum');
            
            signal = evaluateMTFMomentum(formatted1m, formatted5m, formatted15m, config, false);
            break;
          }
          
          case '4h_reentry': {
            const { evaluate4hReentry } = await import('../helpers/4h-reentry-strategy.ts');
            signal = evaluate4hReentry(formattedCandles, null, strategy);
            break;
          }
          
          case 'ath_guard': {
            const { evaluateATHGuardStrategy } = await import('../helpers/ath-guard-strategy.ts');
            const config = getStrategyMonitorConfig(strategy, 'ath_guard_scalping');
            signal = evaluateATHGuardStrategy(formattedCandles, config, false);
            break;
          }
          
          case 'fvg_scalping': {
            const { evaluateFVGStrategy } = await import('../helpers/fvg-scalping-strategy.ts');
            const config = getStrategyMonitorConfig(strategy, 'fvg_scalping');
            signal = evaluateFVGStrategy(formattedCandles, config, false);
            break;
          }
          
          default:
            console.log(`[REALTIME-MONITOR] Unknown strategy type: ${strategy.strategy_type}`);
            continue;
        }

        // Check if signal is valid and actionable
        if (signal && signal.signal_type && signal.signal_type !== null) {
          console.log(`[REALTIME-MONITOR] Signal generated for ${strategy.name}:`, signal);
          generatedSignals.push({
            strategy_id: strategy.id,
            strategy_name: strategy.name,
            signal_type: signal.signal_type,
            symbol: strategy.symbol,
            price: currentPrice,
            reason: signal.reason || 'Strategy conditions met',
            confidence: signal.confidence,
            stop_loss: (signal as any).stop_loss,
            take_profit: (signal as any).take_profit
          });
        } else {
          console.log(`[REALTIME-MONITOR] No signal for ${strategy.name}: ${signal?.reason || 'No reason provided'}`);
        }
      } catch (error) {
        console.error(`[REALTIME-MONITOR] Error evaluating strategy ${strategy.id}:`, error);
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
