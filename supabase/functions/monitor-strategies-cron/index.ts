import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as indicators from "../indicators/all-indicators.ts";
import { 
  insertSignalWithRetry, 
  sendTelegramSignal as sendTelegramUtil,
  markSignalAsDelivered 
} from '../helpers/signal-utils.ts';
import { evaluateATHGuardStrategy } from '../helpers/ath-guard-strategy.ts';
import { evaluate4hReentry } from '../helpers/4h-reentry-strategy.ts';

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

// Fetch market data from Binance Futures API with exponential backoff retry
async function fetchMarketData(symbol: string, timeframe: string, limit = 100, maxRetries = 3): Promise<Candle[]> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      console.error(`[CRON] Binance API attempt ${attempt + 1}/${maxRetries} failed for ${symbol}:`, error);
      
      if (isLastAttempt) {
        throw new Error(`Failed to fetch market data for ${symbol} after ${maxRetries} attempts`);
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[CRON] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Failed to fetch market data for ${symbol}`);
}

async function loadCandlesFromDatabase(
  supabase: any,
  symbol: string,
  timeframe: string,
  limit = 500
): Promise<Candle[]> {
  const { data, error } = await supabase
    .from('market_data')
    .select('*')
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .order('close_time', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[CRON] Error loading candles from DB for ${symbol}:`, error);
    return [];
  }

  if (!data || data.length === 0) {
    console.log(`[CRON] No historical data in DB for ${symbol} ${timeframe}`);
    return [];
  }

  return data.reverse().map((row: any) => ({
    timestamp: row.open_time,
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseFloat(row.volume),
  }));
}

async function getCandlesWithHistory(
  supabase: any,
  symbol: string,
  timeframe: string
): Promise<Candle[]> {
  const dbCandles = await loadCandlesFromDatabase(supabase, symbol, timeframe, 500);
  const apiCandles = await fetchMarketData(symbol, timeframe, 100);
  
  if (dbCandles.length === 0) {
    console.log(`[CRON] Using only API candles for ${symbol} (${apiCandles.length} candles)`);
    return apiCandles;
  }
  
  const oldestApiTime = apiCandles[0].timestamp;
  const olderDbCandles = dbCandles.filter(c => c.timestamp < oldestApiTime);
  
  const merged = [...olderDbCandles, ...apiCandles];
  console.log(`[CRON] Merged ${olderDbCandles.length} DB + ${apiCandles.length} API = ${merged.length} total candles for ${symbol}`);
  
  return merged;
}

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

function checkConditions(conditions: any[], candles: Candle[]): boolean {
  if (!conditions || conditions.length === 0) return false;
  
  return conditions.every(condition => evaluateCondition(condition, candles));
}

async function checkBinancePosition(apiKey: string, apiSecret: string, useTestnet: boolean, symbol: string): Promise<boolean | null> {
  try {
    const baseUrl = useTestnet 
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';
    
    const timestamp = Date.now();
    const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const messageData = encoder.encode(queryString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const response = await fetch(
      `${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signatureHex}`,
      {
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[BINANCE] ⚠️ Position check failed (${response.status}): ${errorText.substring(0, 200)}`);
      console.warn(`[BINANCE] API keys may be expired/invalid. Continuing with signal generation...`);
      return null; // Unknown state - can't confirm position status
    }
    
    const positions = await response.json();
    const position = positions.find((p: any) => p.symbol === symbol);
    const hasPosition = position && parseFloat(position.positionAmt) !== 0;
    
    console.log(`[BINANCE] ✅ Position check successful for ${symbol}: ${hasPosition ? 'OPEN' : 'CLOSED'}`);
    return hasPosition;
  } catch (error) {
    console.warn('[BINANCE] ⚠️ Position check error:', error);
    console.warn('[BINANCE] Network/API issue detected. Continuing with signal generation...');
    return null; // Unknown state - can't confirm position status
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[CRON] Starting global strategy monitoring...');

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

    await supabase
      .from('system_settings')
      .update({ setting_value: new Date().toISOString() })
      .eq('setting_key', 'last_monitoring_run');

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

    for (const strategy of strategies) {
      try {
        console.log(`[CRON] Processing strategy: ${strategy.name} (User: ${strategy.user_id})`);

        const { data: userSettings } = await supabase
          .from('user_settings')
          .select('telegram_enabled, telegram_bot_token, telegram_chat_id, binance_api_key, binance_api_secret, use_testnet')
          .eq('user_id', strategy.user_id)
          .single();

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

        const candles = await getCandlesWithHistory(supabase, strategy.symbol, strategy.timeframe);
        
        if (candles.length === 0) {
          console.log(`[CRON] ⚠️ No candle data available for ${strategy.name}`);
          continue;
        }

        const entryConditions = strategy.strategy_conditions.filter((c: any) => c.order_type === 'entry');
        const exitConditions = strategy.strategy_conditions.filter((c: any) => c.order_type === 'exit');
        const currentPrice = candles[candles.length - 1].close;

        let signalType: string | null = null;
        let signalReason = '';

        // Check if this is an ATH Guard Scalping strategy
        if (strategy.strategy_type === 'ath_guard_scalping') {
          const athGuardConfig = {
            ema_slope_threshold: strategy.ath_guard_ema_slope_threshold || 0.15,
            pullback_tolerance: strategy.ath_guard_pullback_tolerance || 0.15,
            volume_multiplier: strategy.ath_guard_volume_multiplier || 1.8,
            stoch_oversold: strategy.ath_guard_stoch_oversold || 25,
            stoch_overbought: strategy.ath_guard_stoch_overbought || 75,
            atr_sl_multiplier: strategy.ath_guard_atr_sl_multiplier || 1.5,
            atr_tp1_multiplier: strategy.ath_guard_atr_tp1_multiplier || 1.0,
            atr_tp2_multiplier: strategy.ath_guard_atr_tp2_multiplier || 2.0,
            ath_safety_distance: strategy.ath_guard_ath_safety_distance || 0.2,
            rsi_threshold: strategy.ath_guard_rsi_threshold || 70,
          };

          console.log(`[CRON] 🎯 Evaluating ATH Guard strategy for ${strategy.symbol}`);
          console.log(`[CRON] Config:`, athGuardConfig);
          console.log(`[CRON] Position open: ${liveState?.position_open || false}`);
          
          const athGuardSignal = evaluateATHGuardStrategy(
            candles.map(c => ({
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
              timestamp: c.timestamp,
            })),
            athGuardConfig,
            liveState?.position_open || false
          );

          if (athGuardSignal.signal_type) {
            signalType = athGuardSignal.signal_type;
            signalReason = athGuardSignal.reason;
            console.log(`[CRON] ✅ ATH Guard signal generated: ${signalType} - ${signalReason}`);
          } else {
            console.log(`[CRON] ⏸️ ATH Guard: ${athGuardSignal.reason}`);
          }
        } 
        // Check if this is a 4h Reentry strategy
        else if (strategy.strategy_type === '4h_reentry') {
          console.log(`[CRON] 🎯 Evaluating 4h Reentry strategy for ${strategy.symbol}`);
          console.log(`[CRON] Current position state: ${liveState?.position_open ? 'OPEN' : 'CLOSED'}`);
          console.log(`[CRON] Current range: H_4h=${liveState?.range_high || 'N/A'}, L_4h=${liveState?.range_low || 'N/A'}`);
          
          const reentrySignal = evaluate4hReentry(
            candles.map(c => ({
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
              timestamp: c.timestamp,
            })),
            liveState,
            strategy
          );

          if (reentrySignal.signal_type) {
            signalType = reentrySignal.signal_type;
            signalReason = reentrySignal.reason;
            console.log(`[CRON] ✅ 4h Reentry signal generated: ${signalType} - ${signalReason}`);
            
            // Update live state with range data
            if (reentrySignal.range_high !== undefined && reentrySignal.range_low !== undefined) {
              await supabase
                .from('strategy_live_states')
                .update({
                  range_high: reentrySignal.range_high,
                  range_low: reentrySignal.range_low,
                  updated_at: new Date().toISOString()
                })
                .eq('strategy_id', strategy.id);
              
              console.log(`[CRON] 📊 Updated range state: H_4h=${reentrySignal.range_high.toFixed(2)}, L_4h=${reentrySignal.range_low.toFixed(2)}`);
            }
          } else {
            console.log(`[CRON] ⏸️ 4h Reentry: ${reentrySignal.reason}`);
            
            // Still update range even if no signal
            if (reentrySignal.range_high !== undefined && reentrySignal.range_low !== undefined) {
              await supabase
                .from('strategy_live_states')
                .update({
                  range_high: reentrySignal.range_high,
                  range_low: reentrySignal.range_low,
                  updated_at: new Date().toISOString()
                })
                .eq('strategy_id', strategy.id);
            }
          }
        } 
        else if (!liveState.position_open) {
          // Check if position already exists on Binance before generating entry signal
          if (userSettings?.binance_api_key && userSettings?.binance_api_secret) {
            const positionExists = await checkBinancePosition(
              userSettings.binance_api_key,
              userSettings.binance_api_secret,
              userSettings.use_testnet,
              strategy.symbol
            );
            
            // Only skip if we CONFIRMED position exists (true)
            // If null (API error), continue with signal generation
            if (positionExists === true) {
              console.log(`[CRON] ⚠️ Skipping entry signal for ${strategy.name} - position confirmed open on Binance`);
              continue;
            } else if (positionExists === null) {
              console.log(`[CRON] ⚠️ Could not verify Binance position for ${strategy.name} - continuing with signal generation`);
            }
          }

          if (checkConditions(entryConditions, candles)) {
            signalType = 'BUY';
            signalReason = 'Entry conditions met';
            
            await supabase
              .from('strategy_live_states')
              .update({
                position_open: true,
                entry_price: currentPrice,
                entry_time: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('strategy_id', strategy.id);
          }
        } else {
          if (checkConditions(exitConditions, candles)) {
            signalType = 'SELL';
            signalReason = 'Exit conditions met';
            
            await supabase
              .from('strategy_live_states')
              .update({
                position_open: false,
                entry_price: null,
                entry_time: null,
                updated_at: new Date().toISOString()
              })
              .eq('strategy_id', strategy.id);
          }
        }

        if (signalType) {
          // Save signal with deduplication and latency tracking
          const insertResult = await insertSignalWithRetry(supabase, {
            user_id: strategy.user_id,
            strategy_id: strategy.id,
            signal_type: signalType,
            symbol: strategy.symbol,
            price: currentPrice,
            reason: signalReason,
            candle_close_time: candles[candles.length - 1].timestamp,
          });

          if (!insertResult.success || !insertResult.data) {
            if (insertResult.data === null) {
              console.log(`[SIGNAL] Skipped duplicate ${signalType} signal`);
            } else {
              console.error(`[ERROR] Failed to save ${signalType} signal:`, insertResult.error);
            }
            continue;
          }

          const signal = insertResult.data;
          allSignals.push(signal);

          // Send Telegram notification
          if (userSettings?.telegram_enabled && userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
            try {
              console.log(`[TELEGRAM] Attempting to send ${signalType} signal for ${strategy.name}...`);
              const telegramStartTime = Date.now();
              
              const telegramSent = await sendTelegramUtil(
                userSettings.telegram_bot_token,
                userSettings.telegram_chat_id,
                {
                  strategy_name: strategy.name,
                  signal_type: signalType,
                  symbol: strategy.symbol,
                  price: currentPrice,
                  reason: signalReason,
                }
              );
              
              const telegramLatency = Date.now() - telegramStartTime;
              
              if (telegramSent) {
                await markSignalAsDelivered(supabase, signal.id);
                console.log(`[TELEGRAM] ✅ ${signalType} signal sent for ${strategy.name} (${telegramLatency}ms)`);
              } else {
                console.error(`[TELEGRAM] ❌ Failed to send ${signalType} signal for ${strategy.name} (${telegramLatency}ms)`);
              }
            } catch (telegramError) {
              console.error(`[TELEGRAM] ❌ Error sending Telegram notification for ${strategy.name}:`, telegramError);
            }
          } else {
            console.log(`[TELEGRAM] Telegram disabled or not configured for ${strategy.name}`);
          }
        }
      } catch (error) {
        console.error(`[ERROR] Failed to process strategy ${strategy.name}:`, error);
      }
    }

    console.log(`[CRON] ✅ Generated ${allSignals.length} signals`);

    return new Response(
      JSON.stringify({ 
        success: true,
        signals: allSignals,
        strategiesProcessed: strategies.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[CRON] ❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
