import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { 
  insertSignalWithRetry, 
  sendTelegramSignal as sendTelegramUtil,
  markSignalAsDelivered 
} from '../helpers/signal-utils.ts';
import { evaluateATHGuardStrategy } from '../helpers/ath-guard-strategy.ts';

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
}

interface ActiveStrategy {
  id: string;
  user_id: string;
  name: string;
  symbol: string;
  timeframe: string;
  strategy_type?: string;
  entry_conditions: any;
  exit_conditions: any;
  liveState?: StrategyState;
  ath_guard_ema_slope_threshold?: number;
  ath_guard_pullback_tolerance?: number;
  ath_guard_volume_multiplier?: number;
  ath_guard_stoch_oversold?: number;
  ath_guard_stoch_overbought?: number;
  ath_guard_atr_sl_multiplier?: number;
  ath_guard_atr_tp1_multiplier?: number;
  ath_guard_atr_tp2_multiplier?: number;
  ath_guard_ath_safety_distance?: number;
  ath_guard_rsi_threshold?: number;
}

// Rolling candle buffer for each symbol-timeframe pair
const candleBuffers = new Map<string, Candle[]>();
const MAX_CANDLES = 500; // Increased for accurate indicator calculations (EMA200, Ichimoku, etc.)

// Last signal time tracker (rate limiting)
const lastSignalTime = new Map<string, number>();
const SIGNAL_COOLDOWN_MS = 60000; // 60 seconds

// Calculate technical indicators
function calculateIndicator(type: string, candles: Candle[], params: any): number | null {
  if (candles.length === 0) return null;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  switch (type.toLowerCase()) {
    case 'sma': {
      const period = params.period || 20;
      if (closes.length < period) return null;
      const sum = closes.slice(-period).reduce((a, b) => a + b, 0);
      return sum / period;
    }

    case 'ema': {
      const period = params.period || 20;
      if (closes.length < period) return null;
      
      const multiplier = 2 / (period + 1);
      let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      
      for (let i = period; i < closes.length; i++) {
        ema = (closes[i] - ema) * multiplier + ema;
      }
      return ema;
    }

    case 'rsi': {
      const period = params.period || 14;
      if (closes.length < period + 1) return null;

      let gains = 0, losses = 0;
      for (let i = closes.length - period; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }

      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) return 100;

      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    }

    case 'price':
      return closes[closes.length - 1];

    case 'open':
      return candles[candles.length - 1].open;

    case 'high':
      return highs[highs.length - 1];

    case 'low':
      return lows[lows.length - 1];

    case 'volume':
      return volumes[volumes.length - 1];

    default:
      return null;
  }
}

async function evaluateCondition(
  condition: any, 
  candles: Candle[], 
  supabase: any,
  strategyId: string,
  liveState: any,
  debug = false
): Promise<boolean> {
  if (candles.length < 2) {
    if (debug) console.log('[DEBUG] Not enough candles:', candles.length);
    return false;
  }

  const { indicator_type, operator, value, period_1 } = condition;
  const params = period_1 ? { period: period_1 } : {};
  
  const currentValue = calculateIndicator(indicator_type, candles, params);
  if (currentValue === null) {
    if (debug) console.log(`[DEBUG] Indicator ${indicator_type} returned null`);
    return false;
  }

  const previousCandles = candles.slice(0, -1);
  const previousValue = calculateIndicator(indicator_type, previousCandles, params);

  let result = false;
  const threshold = parseFloat(value);
  
  switch (operator) {
    case 'greater_than':
      result = currentValue > threshold;
      break;
    case 'less_than':
      result = currentValue < threshold;
      break;
    case 'crosses_above': {
      const crossed = previousValue !== null && previousValue <= threshold && currentValue > threshold;
      
      if (crossed) {
        const lastDirection = liveState?.last_cross_direction;
        if (lastDirection !== 'up') {
          const { error } = await supabase
            .from('strategy_live_states')
            .update({ 
              last_cross_direction: 'up',
              updated_at: new Date().toISOString()
            })
            .eq('strategy_id', strategyId)
            .eq('version', liveState?.version || 1);
          
          if (error && debug) {
            console.log(`[DEBUG] Failed to update cross direction (possible race condition):`, error);
          }
          
          result = true;
          if (debug) console.log(`[DEBUG] ✅ CROSS ABOVE detected and state updated`);
        } else {
          result = false;
          if (debug) console.log(`[DEBUG] ❌ CROSS ABOVE already signaled (last_direction=${lastDirection})`);
        }
      } else if (currentValue <= threshold && liveState?.last_cross_direction === 'up') {
        await supabase
          .from('strategy_live_states')
          .update({ 
            last_cross_direction: 'none',
            updated_at: new Date().toISOString()
          })
          .eq('strategy_id', strategyId);
        
        result = false;
        if (debug) console.log(`[DEBUG] Reset cross direction to 'none'`);
      } else {
        result = false;
      }
      break;
    }
    case 'crosses_below': {
      const crossed = previousValue !== null && previousValue >= threshold && currentValue < threshold;
      
      if (crossed) {
        const lastDirection = liveState?.last_cross_direction;
        if (lastDirection !== 'down') {
          const { error } = await supabase
            .from('strategy_live_states')
            .update({ 
              last_cross_direction: 'down',
              updated_at: new Date().toISOString()
            })
            .eq('strategy_id', strategyId)
            .eq('version', liveState?.version || 1);
          
          if (error && debug) {
            console.log(`[DEBUG] Failed to update cross direction (possible race condition):`, error);
          }
          
          result = true;
          if (debug) console.log(`[DEBUG] ✅ CROSS BELOW detected and state updated`);
        } else {
          result = false;
          if (debug) console.log(`[DEBUG] ❌ CROSS BELOW already signaled (last_direction=${lastDirection})`);
        }
      } else if (currentValue >= threshold && liveState?.last_cross_direction === 'down') {
        await supabase
          .from('strategy_live_states')
          .update({ 
            last_cross_direction: 'none',
            updated_at: new Date().toISOString()
          })
          .eq('strategy_id', strategyId);
        
        result = false;
        if (debug) console.log(`[DEBUG] Reset cross direction to 'none'`);
      } else {
        result = false;
      }
      break;
    }
    default:
      result = false;
  }

  if (debug) {
    console.log(`[DEBUG] Condition: ${indicator_type} ${operator} ${value}`);
    console.log(`[DEBUG] Previous: ${previousValue?.toFixed(2)}, Current: ${currentValue.toFixed(2)}, Result: ${result}`);
  }

  return result;
}

async function checkConditions(
  conditions: any[], 
  candles: Candle[], 
  supabase: any,
  strategyId: string,
  liveState: any,
  debug = false
): Promise<boolean> {
  if (!conditions || conditions.length === 0) {
    if (debug) console.log('[DEBUG] No conditions to check');
    return false;
  }
  
  if (debug) console.log(`[DEBUG] Checking ${conditions.length} conditions`);
  const results = await Promise.all(
    conditions.map(condition => evaluateCondition(condition, candles, supabase, strategyId, liveState, debug))
  );
  const allMet = results.every(r => r);
  
  if (debug) console.log(`[DEBUG] All conditions met: ${allMet}`);
  return allMet;
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

async function bufferSignal(supabase: any, signal: any): Promise<void> {
  const { error } = await supabase
    .from('signal_buffer')
    .insert(signal);
    
  if (error) {
    console.error('[BUFFER] Failed to buffer signal:', error);
  }
}

async function processKlineUpdate(
  supabase: any,
  kline: any,
  strategies: ActiveStrategy[],
  userSettings: Map<string, any>,
  binanceWs: WebSocket | null
) {
  const symbol = kline.k.s;
  const interval = kline.k.i;
  const bufferKey = `${symbol}_${interval}`;
  
  console.log(`[WEBSOCKET] Received kline: symbol=${symbol}, interval=${interval}, closed=${kline.k.x}`);

  // Update candle buffer
  const candle: Candle = {
    open: parseFloat(kline.k.o),
    high: parseFloat(kline.k.h),
    low: parseFloat(kline.k.l),
    close: parseFloat(kline.k.c),
    volume: parseFloat(kline.k.v),
    timestamp: kline.k.t
  };

  if (!candleBuffers.has(bufferKey)) {
    candleBuffers.set(bufferKey, []);
  }

  const buffer = candleBuffers.get(bufferKey)!;
  
  if (buffer.length > 0 && buffer[buffer.length - 1].timestamp === candle.timestamp) {
    buffer[buffer.length - 1] = candle;
  } else if (kline.k.x) {
    buffer.push(candle);
    if (buffer.length > MAX_CANDLES) {
      buffer.shift();
    }
  }

  const isPriceOnlyConditions = (conditions: any[]): boolean => {
    if (!conditions || conditions.length === 0) return false;
    const priceIndicators = ['price', 'open', 'high', 'low', 'volume'];
    return conditions.every(cond => priceIndicators.includes(cond.indicator_type));
  };

  console.log(`[WEBSOCKET] Processing ${kline.k.x ? 'closed' : 'live'} candle for ${symbol} ${interval} at price ${candle.close}`);

  for (const strategy of strategies) {
    if (strategy.symbol !== symbol || strategy.timeframe !== interval) continue;

    const entryPriceOnly = isPriceOnlyConditions(strategy.entry_conditions);
    const exitPriceOnly = isPriceOnlyConditions(strategy.exit_conditions);
    
    if (!kline.k.x && !entryPriceOnly && !exitPriceOnly) {
      continue;
    }

    const strategyKey = `${strategy.id}_${symbol}_${interval}`;
    const now = Date.now();
    const lastSignal = lastSignalTime.get(strategyKey) || 0;

    if (now - lastSignal < SIGNAL_COOLDOWN_MS) {
      console.log(`[WEBSOCKET] Rate limit: Skipping ${strategy.name} (cooldown active)`);
      continue;
    }

    const { data: liveStateData } = await supabase
      .from('strategy_live_states')
      .select('*')
      .eq('strategy_id', strategy.id)
      .maybeSingle();

    const liveState = liveStateData || { 
      position_open: false, 
      entry_price: null, 
      entry_time: null,
      version: 1,
      last_cross_direction: 'none',
      last_processed_candle_time: null
    };

    if (kline.k.x && liveState.last_processed_candle_time && liveState.last_processed_candle_time >= kline.k.t) {
      console.log(`[WEBSOCKET] ⏭️ Skipping ${strategy.name} - candle ${kline.k.t} already processed at ${liveState.last_processed_candle_time}`);
      continue;
    }

    try {
      let signalType: 'BUY' | 'SELL' | null = null;
      let reason = '';

      console.log(`[DEBUG] Evaluating ${strategy.name}: position_open=${liveState.position_open}, cross_dir=${liveState.last_cross_direction}, tick=${!kline.k.x}, priceOnly=${entryPriceOnly}/${exitPriceOnly}`);
      console.log(`[DEBUG] Entry conditions: ${strategy.entry_conditions.length}, Exit conditions: ${strategy.exit_conditions.length}`);

      const evalBuffer = (entryPriceOnly || exitPriceOnly) && !kline.k.x ? [...buffer, candle] : buffer;
      const currentPrice = candle.close;

      // Check if this is an ATH Guard Scalping strategy
      if (strategy.strategy_type === 'ath_guard_scalping') {
        // For ATH Guard, we need enough candles
        if (evalBuffer.length >= 150) {
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

          const athGuardSignal = evaluateATHGuardStrategy(
            evalBuffer,
            athGuardConfig,
            liveState.position_open
          );

          if (athGuardSignal.signal_type) {
            signalType = athGuardSignal.signal_type;
            reason = athGuardSignal.reason;
            console.log(`[WEBSOCKET] ATH Guard signal: ${signalType} - ${reason}`);
            
            // Update position state based on signal
            if (signalType === 'BUY' && !liveState.position_open) {
              await supabase
                .from('strategy_live_states')
                .upsert({
                  strategy_id: strategy.id,
                  position_open: true,
                  entry_price: currentPrice,
                  entry_time: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                }, { onConflict: 'strategy_id' });
            } else if (signalType === 'SELL' && liveState.position_open) {
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
        }
      } else if (!liveState.position_open) {
        const userSettingsForCheck = userSettings.get(strategy.user_id);
        if (userSettingsForCheck?.binance_api_key && userSettingsForCheck?.binance_api_secret) {
          const positionExists = await checkBinancePosition(
            userSettingsForCheck.binance_api_key,
            userSettingsForCheck.binance_api_secret,
            userSettingsForCheck.use_testnet,
            symbol
          );
          
          // Only skip if we CONFIRMED position exists (true)
          // If null (API error), continue with signal generation
          if (positionExists === true) {
            console.log(`[WEBSOCKET] ⚠️ Skipping entry signal for ${strategy.name} - position confirmed open on Binance`);
            continue;
          } else if (positionExists === null) {
            console.log(`[WEBSOCKET] ⚠️ Could not verify Binance position for ${strategy.name} - continuing with signal generation`);
          }
        }
        
        console.log(`[DEBUG] Checking ENTRY conditions for ${strategy.name} (tick=${!kline.k.x})`);
        if (await checkConditions(strategy.entry_conditions, evalBuffer, supabase, strategy.id, liveState, true)) {
          signalType = 'BUY';
          reason = 'Entry conditions met';
          console.log(`[DEBUG] ✅ ENTRY SIGNAL GENERATED for ${strategy.name}`);
          
          await supabase
            .from('strategy_live_states')
            .upsert({
              strategy_id: strategy.id,
              position_open: true,
              entry_price: currentPrice,
              entry_time: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'strategy_id' });
        } else {
          console.log(`[DEBUG] ❌ Entry conditions NOT met for ${strategy.name}`);
        }
      } else {
        console.log(`[DEBUG] Checking EXIT conditions for ${strategy.name} (tick=${!kline.k.x})`);
        if (await checkConditions(strategy.exit_conditions, evalBuffer, supabase, strategy.id, liveState, true)) {
          signalType = 'SELL';
          reason = 'Exit conditions met';
          console.log(`[DEBUG] ✅ EXIT SIGNAL GENERATED for ${strategy.name}`);
          
          await supabase
            .from('strategy_live_states')
            .update({
              position_open: false,
              entry_price: null,
              entry_time: null,
              updated_at: new Date().toISOString()
            })
            .eq('strategy_id', strategy.id);
        } else {
          console.log(`[DEBUG] ❌ Exit conditions NOT met for ${strategy.name}`);
        }
      }

      if (signalType) {
        const signalReason = reason;
        
        // Insert signal with deduplication hash and latency tracking
        const insertResult = await insertSignalWithRetry(supabase, {
          user_id: strategy.user_id,
          strategy_id: strategy.id,
          signal_type: signalType,
          symbol: strategy.symbol,
          price: currentPrice,
          reason: signalReason,
          candle_close_time: candle.timestamp,
        });

        if (!insertResult.success) {
          console.error(`[SIGNAL] Failed to insert ${signalType} signal after retries`);
          await bufferSignal(supabase, {
            user_id: strategy.user_id,
            strategy_id: strategy.id,
            signal_type: signalType,
            symbol: strategy.symbol,
            price: currentPrice,
            reason: signalReason,
            candle_timestamp: candle.timestamp,
          });
          continue;
        }

        if (!insertResult.data) {
          console.log(`[SIGNAL] Skipped duplicate ${signalType} signal`);
          continue;
        }

        lastSignalTime.set(strategyKey, now);

        if (kline.k.x) {
          await supabase
            .from('strategy_live_states')
            .update({ 
              last_processed_candle_time: kline.k.t,
              updated_at: new Date().toISOString()
            })
            .eq('strategy_id', strategy.id);
        }

        const userSettingsData = userSettings.get(strategy.user_id);
        if (userSettingsData?.telegram_enabled && userSettingsData.telegram_bot_token && userSettingsData.telegram_chat_id) {
          try {
            console.log(`[TELEGRAM] Attempting to send ${signalType} signal for ${strategy.name}...`);
            const telegramStartTime = Date.now();
            
            const telegramSent = await sendTelegramUtil(
              userSettingsData.telegram_bot_token,
              userSettingsData.telegram_chat_id,
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
              console.log(`[TELEGRAM] ✅ ${signalType} signal sent for ${strategy.name} (${telegramLatency}ms)`);
              await markSignalAsDelivered(supabase, insertResult.data.id);
            } else {
              console.error(`[TELEGRAM] ❌ Failed to send ${signalType} signal for ${strategy.name} (${telegramLatency}ms)`);
            }
          } catch (error) {
            console.error(`[TELEGRAM] ❌ Error sending ${signalType} signal for ${strategy.name}:`, error);
          }
        } else {
          console.log(`[TELEGRAM] Telegram disabled or not configured for ${strategy.name}`);
        }
      }
    } catch (error) {
      console.error(`[WEBSOCKET] Error processing ${strategy.name}:`, error);
    }
  }
}

async function loadActiveStrategies(supabase: any): Promise<ActiveStrategy[]> {
  const { data, error } = await supabase
    .from('strategies')
    .select(`
      *,
      strategy_conditions (*)
    `)
    .eq('status', 'active');

  if (error) {
    console.error('[WEBSOCKET] Error loading strategies:', error);
    return [];
  }

  return data.map((strategy: any) => ({
    id: strategy.id,
    user_id: strategy.user_id,
    name: strategy.name,
    symbol: strategy.symbol,
    timeframe: strategy.timeframe,
    entry_conditions: strategy.strategy_conditions.filter((c: any) => c.order_type === 'entry'),
    exit_conditions: strategy.strategy_conditions.filter((c: any) => c.order_type === 'exit'),
  }));
}

async function initializeCandleBuffer(supabase: any, symbol: string, timeframe: string): Promise<void> {
  const bufferKey = `${symbol}_${timeframe}`;
  
  const { data: dbCandles } = await supabase
    .from('market_data')
    .select('*')
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .order('close_time', { ascending: false })
    .limit(MAX_CANDLES);

  if (dbCandles && dbCandles.length > 0) {
    const candles = dbCandles.reverse().map((row: any) => ({
      timestamp: row.open_time,
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseFloat(row.volume),
    }));
    
    candleBuffers.set(bufferKey, candles);
    console.log(`[WEBSOCKET] Initialized buffer for ${bufferKey} with ${candles.length} candles`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  let binanceWs: WebSocket | null = null;
  let heartbeatInterval: number | null = null;
  let reconnectTimeout: number | null = null;
  let isConnecting = false;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  socket.onopen = async () => {
    console.log('[MONITOR] WebSocket connected');
    
    const strategies = await loadActiveStrategies(supabase);
    console.log(`[MONITOR] Loaded ${strategies.length} active strategies`);

    const userSettings = new Map();
    const uniqueUsers = [...new Set(strategies.map(s => s.user_id))];
    
    for (const userId of uniqueUsers) {
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (data) {
        userSettings.set(userId, data);
      }
    }

    const uniqueStreams = new Set(strategies.map(s => `${s.symbol.toLowerCase()}@kline_${s.timeframe}`));
    
    for (const stream of uniqueStreams) {
      const [symbol, klineData] = stream.split('@');
      const timeframe = klineData.split('_')[1];
      await initializeCandleBuffer(supabase, symbol.toUpperCase(), timeframe);
    }

    const connectBinance = () => {
      if (isConnecting || binanceWs?.readyState === WebSocket.OPEN) return;
      
      isConnecting = true;
      const streams = Array.from(uniqueStreams).join('/');
      binanceWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);

      binanceWs.onopen = () => {
        console.log('[BINANCE-WS] Connected to Binance');
        isConnecting = false;
        
        socket.send(JSON.stringify({
          type: 'connected',
          streams: uniqueStreams.size,
          strategies: strategies.length,
          strategyDetails: strategies.map(s => ({
            name: s.name,
            symbol: s.symbol,
            timeframe: s.timeframe,
            hasEntry: s.entry_conditions.length > 0,
            hasExit: s.exit_conditions.length > 0
          })),
          timestamp: Date.now()
        }));

        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
          }
        }, 30000);
      };

      binanceWs.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.stream && data.data) {
            await processKlineUpdate(supabase, data.data, strategies, userSettings, binanceWs);
          }
        } catch (error) {
          console.error('[BINANCE-WS] Error processing message:', error);
        }
      };

      binanceWs.onerror = (error) => {
        console.error('[BINANCE-WS] Error:', error);
        isConnecting = false;
      };

      binanceWs.onclose = () => {
        console.log('[BINANCE-WS] Disconnected, reconnecting in 5s...');
        isConnecting = false;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectBinance, 5000);
      };
    };

    connectBinance();
  };

  socket.onclose = () => {
    console.log('[MONITOR] Client disconnected');
    if (binanceWs) binanceWs.close();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  };

  return response;
});

