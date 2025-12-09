import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getStrategyMonitorConfig } from '../helpers/strategy-config-loader.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Signal cooldown: 5 minutes per strategy
const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[REALTIME-MONITOR] No authorization header provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token from Authorization header
    const token = authHeader.replace('Bearer ', '');
    
    // Use service role client to validate JWT
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[REALTIME-MONITOR] Auth error:', userError?.message || 'No user found');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Get strategy live states for deduplication
    const { data: liveStates } = await supabase
      .from('strategy_live_states')
      .select('strategy_id, last_signal_time, last_signal_candle_time')
      .eq('user_id', user.id);

    const liveStateMap = new Map(
      (liveStates || []).map(s => [s.strategy_id, s])
    );

    // Evaluate strategies directly without calling instant-signals
    const generatedSignals = [];
    const now = Date.now();
    
    for (const strategy of strategies) {
      try {
        // Check cooldown: skip if signal was generated recently
        const liveState = liveStateMap.get(strategy.id);
        if (liveState?.last_signal_time) {
          const lastSignalTime = new Date(liveState.last_signal_time).getTime();
          const timeSinceLastSignal = now - lastSignalTime;
          
          if (timeSinceLastSignal < SIGNAL_COOLDOWN_MS) {
            console.log(`[REALTIME-MONITOR] Skipping ${strategy.name} - cooldown active (${Math.round((SIGNAL_COOLDOWN_MS - timeSinceLastSignal) / 1000)}s remaining)`);
            continue;
          }
        }

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
        const lastCandle = sortedCandles[sortedCandles.length - 1];
        const currentCandleTime = lastCandle.close_time;

        // Check if we already processed this candle
        if (liveState?.last_signal_candle_time && liveState.last_signal_candle_time >= currentCandleTime) {
          console.log(`[REALTIME-MONITOR] Skipping ${strategy.name} - candle ${currentCandleTime} already processed`);
          continue;
        }
        
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
          case 'sma_crossover':
          case 'sma_20_200_rsi': {
            const { evaluateSMACrossoverStrategy } = await import('../helpers/sma-crossover-strategy.ts');
            // Build config from database values
            const smaConfig = {
              sma_fast_period: strategy.sma_fast_period || 20,
              sma_slow_period: strategy.sma_slow_period || 200,
              rsi_period: strategy.rsi_period || 14,
              rsi_overbought: strategy.rsi_overbought || 75,
              rsi_oversold: strategy.rsi_oversold || 25,
              volume_multiplier: strategy.volume_multiplier || 0.9,
              atr_sl_multiplier: strategy.atr_sl_multiplier || 2.0,
              atr_tp_multiplier: strategy.atr_tp_multiplier || 4.0,
              adx_threshold: strategy.adx_threshold || 15,
              bollinger_period: strategy.bollinger_period || 20,
              bollinger_std: strategy.bollinger_std || 2.0,
              trailing_stop_percent: strategy.trailing_stop_percent || 0,
              max_position_time: strategy.max_position_time || 480,
              min_trend_strength: strategy.min_trend_strength || 0.2,
            };
            console.log(`[REALTIME-MONITOR] SMA Crossover config for ${strategy.name}: Fast=${smaConfig.sma_fast_period}, Slow=${smaConfig.sma_slow_period}`);
            signal = evaluateSMACrossoverStrategy(formattedCandles, smaConfig, false);
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
          
          case 'ema_crossover_scalping': {
            const { evaluateEMACrossoverScalping, getDefaultEMACrossoverConfig } = await import('../helpers/ema-crossover-scalping-strategy.ts');
            // Build config from database values - use sma_fast_period/sma_slow_period for EMA too
            const emaConfig = {
              ...getDefaultEMACrossoverConfig(),
              fast_ema_period: strategy.sma_fast_period || 9,
              slow_ema_period: strategy.sma_slow_period || 21,
              atr_sl_multiplier: strategy.atr_sl_multiplier || 1.0,
              atr_tp_multiplier: strategy.atr_tp_multiplier || 1.5,
              max_position_time: (strategy.max_position_time || 15) * 60, // Convert minutes to seconds
            };
            console.log(`[REALTIME-MONITOR] EMA Crossover config for ${strategy.name}: Fast=${emaConfig.fast_ema_period}, Slow=${emaConfig.slow_ema_period}`);
            signal = evaluateEMACrossoverScalping(formattedCandles, formattedCandles.length - 1, emaConfig, false);
            break;
          }
          
          case 'ath_guard_scalping': {
            const { evaluateATHGuardStrategy } = await import('../helpers/ath-guard-strategy.ts');
            const config = getStrategyMonitorConfig(strategy, 'ath_guard_scalping');
            signal = evaluateATHGuardStrategy(formattedCandles, config, false);
            break;
          }
          
          case 'fvg_scalping': {
            const { evaluateFVGStrategy } = await import('../helpers/fvg-scalping-strategy.ts');
            const config = getStrategyMonitorConfig(strategy, 'fvg_scalping');
            
            // For FVG strategy, use analysis timeframe instead of strategy timeframe
            const analysisTimeframe = strategy.fvg_analysis_timeframe || '1m';
            const { data: fvgCandles, error: fvgCandlesError } = await supabase
              .from('market_data')
              .select('*')
              .eq('symbol', strategy.symbol)
              .eq('timeframe', analysisTimeframe)
              .order('open_time', { ascending: false })
              .limit(500);

            if (fvgCandlesError || !fvgCandles || fvgCandles.length === 0) {
              console.log(`[REALTIME-MONITOR] No candles available for ${strategy.symbol} ${analysisTimeframe}`);
              continue;
            }

            const sortedFvgCandles = fvgCandles.sort((a, b) => a.open_time - b.open_time);
            const formattedFvgCandles = sortedFvgCandles.map(c => ({
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
              volume: parseFloat(c.volume),
              timestamp: c.open_time
            }));
            
            signal = evaluateFVGStrategy(formattedFvgCandles, config, false, strategy.symbol);
            break;
          }
          
          default:
            console.log(`[REALTIME-MONITOR] Unknown strategy type: ${strategy.strategy_type}`);
            continue;
        }

        // Check if signal is valid and actionable
        if (signal && signal.signal_type && signal.signal_type !== null) {
          console.log(`[REALTIME-MONITOR] Signal generated for ${strategy.name}:`, signal);
          
          // Update live state with last signal time to prevent duplicates
          await supabase
            .from('strategy_live_states')
            .upsert({
              strategy_id: strategy.id,
              user_id: user.id,
              last_signal_time: new Date().toISOString(),
              last_signal_candle_time: currentCandleTime,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'strategy_id'
            });

          generatedSignals.push({
            strategy_id: strategy.id,
            strategy_name: strategy.name,
            signal_type: signal.signal_type,
            symbol: strategy.symbol,
            price: currentPrice,
            reason: signal.reason || 'Strategy conditions met',
            confidence: signal.confidence,
            stop_loss: (signal as any).stop_loss,
            take_profit: (signal as any).take_profit,
            candle_close_time: currentCandleTime
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
