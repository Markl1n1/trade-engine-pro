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
            const config = strategy.config || {
              sma_fast_period: 20,
              sma_slow_period: 200,
              rsi_period: 14,
              rsi_overbought: 75,
              rsi_oversold: 25,
              volume_multiplier: 1.3,
              atr_sl_multiplier: 2.5,
              atr_tp_multiplier: 4.0,
              adx_threshold: 25,
              bollinger_period: 20,
              bollinger_std: 2,
              trailing_stop_percent: 1.0,
              max_position_time: 240,
              min_trend_strength: 0.6
            };
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
            
            const config = strategy.config || {
              rsi_period: 14,
              rsi_entry_threshold: 50,
              macd_fast: 8,
              macd_slow: 21,
              macd_signal: 5,
              volume_multiplier: 1.1
            };
            
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
            const config = strategy.config || {
              ema_slope_threshold: 0.01,
              pullback_tolerance: 0.5,
              volume_multiplier: 1.5,
              stoch_oversold: 20,
              stoch_overbought: 80,
              atr_sl_multiplier: 1.5,
              atr_tp1_multiplier: 2.0,
              atr_tp2_multiplier: 3.0,
              ath_safety_distance: 0.2,
              rsi_threshold: 70,
              adx_threshold: 25,
              bollinger_period: 20,
              bollinger_std: 2,
              trailing_stop_percent: 0.5,
              max_position_time: 30,
              min_volume_spike: 1.2,
              momentum_threshold: 10,
              support_resistance_lookback: 20
            };
            signal = evaluateATHGuardStrategy(formattedCandles, config, false);
            break;
          }
          
          case 'fvg_scalping': {
            const { evaluateFVGStrategy } = await import('../helpers/fvg-scalping-strategy.ts');
            const config = {
              keyTimeStart: strategy.fvg_key_candle_time?.split('-')[0] || "09:30",
              keyTimeEnd: strategy.fvg_key_candle_time?.split('-')[1] || "09:35",
              keyTimeframe: strategy.fvg_key_timeframe || "5m",
              analysisTimeframe: strategy.fvg_analysis_timeframe || "1m",
              riskRewardRatio: strategy.fvg_risk_reward_ratio || 3.0,
              tickSize: strategy.fvg_tick_size || 0.01
            };
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
