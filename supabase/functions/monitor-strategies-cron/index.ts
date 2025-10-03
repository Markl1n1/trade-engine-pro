import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as indicators from "../indicators/all-indicators.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface StrategyState {
  position_open: boolean;
  entry_price: number | null;
  entry_time: string | null;
  range_high: number | null;
  range_low: number | null;
}

// Fetch market data from Binance Futures API
async function fetchMarketData(symbol: string, timeframe: string, limit = 100): Promise<Candle[]> {
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch market data for ${symbol}`);
  }
  
  const data = await response.json();
  
  return data.map((candle: any) => ({
    timestamp: candle[0],
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5]),
  }));
}

// Calculate technical indicators - comprehensive version supporting all 50+ indicators
function calculateIndicator(type: string, candles: Candle[], params: any): number | null {
  if (!candles || candles.length === 0) return null;

  const closes = candles.map(c => c.close);
  
  try {
    switch (type.toLowerCase()) {
      case 'sma':
        const sma = indicators.calculateSMA(closes, params.period_1 || 20);
        return sma[sma.length - 1];
      
      case 'ema':
        const ema = indicators.calculateEMA(closes, params.period_1 || 20);
        return ema[ema.length - 1];
      
      case 'rsi':
        const rsi = indicators.calculateRSI(closes, params.period_1 || 14);
        return rsi[rsi.length - 1];
      
      case 'macd':
        const macd = indicators.calculateMACD(closes, 12, 26, 9);
        return macd.macd[macd.macd.length - 1];
      
      case 'bollinger_upper':
        const bb = indicators.calculateBollingerBands(closes, params.period_1 || 20, params.deviation || 2);
        return bb.upper[bb.upper.length - 1];
      
      case 'bollinger_lower':
        const bbLower = indicators.calculateBollingerBands(closes, params.period_1 || 20, params.deviation || 2);
        return bbLower.lower[bbLower.lower.length - 1];
      
      case 'atr':
        const atr = indicators.calculateATR(candles, params.period_1 || 14);
        return atr[atr.length - 1];
      
      case 'psar':
        const psar = indicators.calculateParabolicSAR(candles, params.acceleration || 0.02, 0.2);
        return psar[psar.length - 1];
      
      case 'supertrend':
        const st = indicators.calculateSuperTrend(candles, params.period_1 || 10, params.multiplier || 3);
        return st.trend[st.trend.length - 1];
      
      case 'kdj_j':
        const kdj = indicators.calculateKDJ(candles, params.period_1 || 9, params.smoothing || 3, 3);
        return kdj.j[kdj.j.length - 1];
      
      case 'stochastic':
        const stoch = indicators.calculateStochastic(candles, params.period_1 || 14, 3, 3);
        return stoch.k[stoch.k.length - 1];
      
      case 'adx':
        const adx = indicators.calculateADX(candles, params.period_1 || 14);
        return adx.adx[adx.adx.length - 1];
      
      case 'cmf':
        const cmf = indicators.calculateCMF(candles, params.period_1 || 20);
        return cmf[cmf.length - 1];
      
      case 'vwap':
        const vwap = indicators.calculateVWAP(candles);
        return vwap[vwap.length - 1];
      
      case 'anchored_vwap':
        const avwap = indicators.calculateAnchoredVWAP(candles, params.anchor || 0);
        return avwap[avwap.length - 1];
      
      case 'obv':
        const obv = indicators.calculateOBV(candles);
        return obv[obv.length - 1];
      
      case 'cci':
        const cci = indicators.calculateCCI(candles, params.period_1 || 20);
        return cci[cci.length - 1];
      
      case 'wpr':
        const wpr = indicators.calculateWPR(candles, params.period_1 || 14);
        return wpr[wpr.length - 1];
      
      case 'mfi':
        const mfi = indicators.calculateMFI(candles, params.period_1 || 14);
        return mfi[mfi.length - 1];
      
      case 'bb_width':
        const bbWidth = indicators.calculateBollingerBands(closes, params.period_1 || 20, params.deviation || 2);
        const width = indicators.calculateBollingerWidth(bbWidth.upper, bbWidth.lower);
        return width[width.length - 1];
      
      case 'percent_b':
        const bbPercent = indicators.calculateBollingerBands(closes, params.period_1 || 20, params.deviation || 2);
        const percentB = indicators.calculatePercentB(closes, bbPercent.upper, bbPercent.lower);
        return percentB[percentB.length - 1];
      
      case 'td_sequential':
        const td = indicators.calculateTDSequential(candles);
        return td.setup[td.setup.length - 1];
      
      case 'ema_crossover':
        const shortEMA = indicators.calculateEMA(closes, params.period_1 || 10);
        const longEMA = indicators.calculateEMA(closes, params.period_2 || 21);
        const crossover = indicators.detectEMACrossover(shortEMA, longEMA);
        return crossover[crossover.length - 1];
      
      case 'ichimoku_tenkan':
        const ichimoku = indicators.calculateIchimoku(candles, 9, 26, 52);
        return ichimoku.tenkan[ichimoku.tenkan.length - 1];
      
      case 'price':
        return closes[closes.length - 1];
      
      case 'open':
        return candles[candles.length - 1].open;
      
      case 'high':
        return candles[candles.length - 1].high;
      
      case 'low':
        return candles[candles.length - 1].low;
      
      case 'volume':
        return candles[candles.length - 1].volume;
      
      default:
        console.warn(`[CRON] Unknown indicator type: ${type}`);
        return null;
    }
  } catch (error) {
    console.error(`[CRON] Error calculating ${type}:`, error);
    return null;
  }
}

// Evaluate a single condition
function evaluateCondition(condition: any, candles: Candle[]): boolean {
  const value1 = calculateIndicator(condition.indicator_type, candles, condition);
  
  if (value1 === null) return false;
  
  let value2: number;
  if (condition.indicator_type_2) {
    const calculated = calculateIndicator(condition.indicator_type_2, candles, {
      period_1: condition.period_2,
      deviation: condition.deviation,
    });
    if (calculated === null) return false;
    value2 = calculated;
  } else {
    value2 = condition.value;
  }
  
  // Normalize operator to lowercase for case-insensitive matching
  switch (condition.operator.toLowerCase()) {
    case 'greater_than':
      return value1 > value2;
    case 'less_than':
      return value1 < value2;
    case 'equals':
      return Math.abs(value1 - value2) < 0.0001;
    case 'crosses_above':
      if (candles.length < 2) return false;
      const prev1 = calculateIndicator(condition.indicator_type, candles.slice(0, -1), condition);
      const prev2 = condition.indicator_type_2
        ? calculateIndicator(condition.indicator_type_2, candles.slice(0, -1), {
            period_1: condition.period_2,
            deviation: condition.deviation,
          })
        : condition.value;
      return prev1 !== null && prev2 !== null && prev1 <= prev2 && value1 > value2;
    case 'crosses_below':
      if (candles.length < 2) return false;
      const prev1Below = calculateIndicator(condition.indicator_type, candles.slice(0, -1), condition);
      const prev2Below = condition.indicator_type_2
        ? calculateIndicator(condition.indicator_type_2, candles.slice(0, -1), {
            period_1: condition.period_2,
            deviation: condition.deviation,
          })
        : condition.value;
      return prev1Below !== null && prev2Below !== null && prev1Below >= prev2Below && value1 < value2;
    default:
      console.warn(`[CRON] Unknown operator: ${condition.operator}`);
      return false;
  }
}

// Check all conditions for a strategy
function checkConditions(conditions: any[], candles: Candle[]): boolean {
  if (!conditions || conditions.length === 0) return false;
  
  return conditions.every(condition => evaluateCondition(condition, candles));
}

// Send Telegram notification
async function sendTelegramSignal(botToken: string, chatId: string, signal: any): Promise<void> {
  const message = `
🤖 *Trading Signal*

Strategy: ${signal.strategy_name}
Symbol: ${signal.symbol}
Signal: ${signal.signal_type.toUpperCase()}
Price: ${signal.price}
${signal.reason ? `\nReason: ${signal.reason}` : ''}

Time: ${new Date().toISOString()}
  `.trim();

  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    })
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for global access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[CRON] Starting global strategy monitoring...');

    // Check if monitoring is enabled
    const { data: monitoringSetting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'monitoring_enabled')
      .single();

    if (monitoringSetting?.setting_value !== 'true') {
      console.log('[CRON] Monitoring is disabled');
      return new Response(
        JSON.stringify({ message: 'Monitoring disabled', signals: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last monitoring run timestamp
    await supabase
      .from('system_settings')
      .update({ setting_value: new Date().toISOString() })
      .eq('setting_key', 'last_monitoring_run');

    console.log('[CRON] Starting resource-optimized monitoring...');

    // Fetch ALL active strategies from ALL users
    const { data: strategies, error: strategiesError } = await supabase
      .from('strategies')
      .select(`
        *,
        strategy_conditions (*),
        condition_groups (*)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (strategiesError) {
      console.error('[CRON] Error fetching strategies:', strategiesError);
      throw strategiesError;
    }

    if (!strategies || strategies.length === 0) {
      console.log('[CRON] No active strategies found');
      return new Response(
        JSON.stringify({ message: 'No active strategies', signals: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CRON] Processing ${strategies.length} active strategies...`);

    const allSignals: any[] = [];

    // Process each strategy
    for (const strategy of strategies) {
      try {
        console.log(`[CRON] Processing strategy: ${strategy.name} (User: ${strategy.user_id})`);

        // Fetch user's settings for this strategy
        const { data: userSettings } = await supabase
          .from('user_settings')
          .select('telegram_enabled, telegram_bot_token, telegram_chat_id')
          .eq('user_id', strategy.user_id)
          .single();

        // Get or create strategy live state
        let { data: liveState } = await supabase
          .from('strategy_live_states')
          .select('*')
          .eq('strategy_id', strategy.id)
          .eq('user_id', strategy.user_id)
          .single();

        if (!liveState) {
          const { data: newState } = await supabase
            .from('strategy_live_states')
            .insert({
              strategy_id: strategy.id,
              user_id: strategy.user_id,
              position_open: false
            })
            .select()
            .single();
          liveState = newState;
        }

        // Fetch market data for this strategy's symbol
        const candles = await fetchMarketData(strategy.symbol, strategy.timeframe, 100);
        const currentPrice = candles[candles.length - 1].close;
        const lastCandleTime = candles[candles.length - 1].timestamp;
        const lastCandleTimeISO = new Date(lastCandleTime).toISOString();

        console.log(`[CRON] ${strategy.name}: Current price ${currentPrice}, Last candle ${lastCandleTimeISO}`);

        // Skip if this candle was already processed (prevents duplicates from WebSocket)
        if (liveState?.last_processed_candle_time && liveState.last_processed_candle_time >= lastCandleTime) {
          console.log(`[CRON] ⏭️ Skipping ${strategy.name} - candle ${lastCandleTime} already processed at ${liveState.last_processed_candle_time}`);
          continue;
        }

        // Get entry and exit conditions (use 'buy' and 'sell' not 'entry' and 'exit')
        const entryConditions = strategy.strategy_conditions?.filter(
          (c: any) => c.order_type === 'buy'
        ) || [];
        const exitConditions = strategy.strategy_conditions?.filter(
          (c: any) => c.order_type === 'sell'
        ) || [];

        console.log(`[CRON] ${strategy.name}: Entry conditions=${entryConditions.length}, Exit conditions=${exitConditions.length}`);

        let signal = null;

        // Check for exit conditions if position is open
        if (liveState?.position_open && exitConditions.length > 0) {
          console.log(`[CRON] ${strategy.name}: Checking EXIT conditions (position open)`);
          const exitMet = checkConditions(exitConditions, candles);
          console.log(`[CRON] ${strategy.name}: EXIT conditions result=${exitMet}`);
          
          if (exitMet) {
            signal = {
              signal_type: 'sell',
              price: currentPrice,
              reason: 'Exit conditions met',
              strategy_id: strategy.id,
              user_id: strategy.user_id,
              symbol: strategy.symbol,
              strategy_name: strategy.name
            };

            // Update live state
            await supabase
              .from('strategy_live_states')
              .update({
                position_open: false,
                entry_price: null,
                entry_time: null
              })
              .eq('id', liveState.id);

            console.log(`[CRON] EXIT signal generated for ${strategy.name}`);
          }
        }

        // Check for entry conditions if no position is open
        if (!liveState?.position_open && entryConditions.length > 0) {
          console.log(`[CRON] ${strategy.name}: Checking ENTRY conditions (no position)`);
          const entryMet = checkConditions(entryConditions, candles);
          console.log(`[CRON] ${strategy.name}: ENTRY conditions result=${entryMet}`);
          
          if (entryMet) {
            signal = {
              signal_type: 'buy',
              price: currentPrice,
              reason: 'Entry conditions met',
              strategy_id: strategy.id,
              user_id: strategy.user_id,
              symbol: strategy.symbol,
              strategy_name: strategy.name
            };

            // Update live state
            await supabase
              .from('strategy_live_states')
              .update({
                position_open: true,
                entry_price: currentPrice,
                entry_time: new Date().toISOString()
              })
              .eq('id', liveState.id);

            console.log(`[CRON] ENTRY signal generated for ${strategy.name}`);
          }
        }

        // If signal was generated, save it and send notification
        if (signal) {
          // Insert signal into database
          await supabase
            .from('strategy_signals')
            .insert({
              strategy_id: signal.strategy_id,
              user_id: signal.user_id,
              signal_type: signal.signal_type,
              symbol: signal.symbol,
              price: signal.price,
              reason: signal.reason
            });

          allSignals.push(signal);

          // Send Telegram notification if enabled
          if (userSettings?.telegram_enabled && 
              userSettings?.telegram_bot_token && 
              userSettings?.telegram_chat_id) {
            try {
              await sendTelegramSignal(
                userSettings.telegram_bot_token,
                userSettings.telegram_chat_id,
                signal
              );
              console.log(`[CRON] Telegram notification sent for ${strategy.name}`);
            } catch (telegramError) {
              console.error('[CRON] Telegram notification failed:', telegramError);
            }
          }
        }

        // Update last_processed_candle_time to prevent duplicate processing
        await supabase
          .from('strategy_live_states')
          .update({ 
            last_processed_candle_time: lastCandleTime,
            updated_at: new Date().toISOString()
          })
          .eq('strategy_id', strategy.id);

        console.log(`[CRON] ✅ Updated last_processed_candle_time to ${lastCandleTime} for ${strategy.name}`);

      } catch (strategyError) {
        console.error(`[CRON] Error processing strategy ${strategy.id}:`, strategyError);
        // Continue processing other strategies
      }
    }

    console.log(`[CRON] Monitoring complete. Generated ${allSignals.length} signals`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${strategies.length} strategies`,
        signals_generated: allSignals.length,
        signals: allSignals
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CRON] Global error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
