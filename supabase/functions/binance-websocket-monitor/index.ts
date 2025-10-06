import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
  entry_conditions: any;
  exit_conditions: any;
  liveState?: StrategyState;
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
      // Check if we have an actual cross
      const crossed = previousValue !== null && previousValue <= threshold && currentValue > threshold;
      
      if (crossed) {
        // Check if we haven't already signaled this cross
        const lastDirection = liveState?.last_cross_direction;
        if (lastDirection !== 'up') {
          // Update state to prevent duplicate signals (with optimistic locking)
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
        // Reset when crossing back down
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
      // Check if we have an actual cross
      const crossed = previousValue !== null && previousValue >= threshold && currentValue < threshold;
      
      if (crossed) {
        // Check if we haven't already signaled this cross
        const lastDirection = liveState?.last_cross_direction;
        if (lastDirection !== 'down') {
          // Update state to prevent duplicate signals (with optimistic locking)
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
        // Reset when crossing back up
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

async function checkBinancePosition(apiKey: string, apiSecret: string, useTestnet: boolean, symbol: string): Promise<boolean> {
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
      console.error(`[BINANCE] Failed to fetch position: ${response.status}`);
      return false;
    }
    
    const positions = await response.json();
    const position = positions.find((p: any) => p.symbol === symbol);
    
    return position && parseFloat(position.positionAmt) !== 0;
  } catch (error) {
    console.error('[BINANCE] Error checking position:', error);
    return false;
  }
}

async function sendTelegramSignal(botToken: string, chatId: string, signal: any): Promise<void> {
  try {
    const message = `🔔 *${signal.signal_type.toUpperCase()} Signal*\n\n` +
      `Strategy: ${signal.strategy_name}\n` +
      `Symbol: ${signal.symbol}\n` +
      `Price: $${signal.price}\n` +
      `Time: ${new Date(signal.created_at).toLocaleString()}\n` +
      `Reason: ${signal.reason || 'Conditions met'}`;

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      console.error('[WEBSOCKET] Telegram notification failed:', await response.text());
    } else {
      console.log('[WEBSOCKET] Telegram notification sent successfully');
    }
  } catch (error) {
    console.error('[WEBSOCKET] Error sending Telegram notification:', error);
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
  
  // Update or append candle
  if (buffer.length > 0 && buffer[buffer.length - 1].timestamp === candle.timestamp) {
    buffer[buffer.length - 1] = candle;
  } else if (kline.k.x) {
    // Only append to historical buffer when candle closes
    buffer.push(candle);
    if (buffer.length > MAX_CANDLES) {
      buffer.shift();
    }
  }

  // Helper to check if conditions only use price-based indicators
  const isPriceOnlyConditions = (conditions: any[]): boolean => {
    if (!conditions || conditions.length === 0) return false;
    const priceIndicators = ['price', 'open', 'high', 'low', 'volume'];
    return conditions.every(cond => priceIndicators.includes(cond.indicator_type));
  };

  console.log(`[WEBSOCKET] Processing ${kline.k.x ? 'closed' : 'live'} candle for ${symbol} ${interval} at price ${candle.close}`);

  // Evaluate all strategies for this symbol/timeframe
  for (const strategy of strategies) {
    if (strategy.symbol !== symbol || strategy.timeframe !== interval) continue;

    // Check if this strategy uses only price-based indicators
    const entryPriceOnly = isPriceOnlyConditions(strategy.entry_conditions);
    const exitPriceOnly = isPriceOnlyConditions(strategy.exit_conditions);
    
    // Skip if not a closed candle and strategy doesn't use price-only conditions
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

    // Fetch latest live state with new fields
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

    // Skip if this closed candle was already processed (prevents duplicates from cron + WebSocket)
    if (kline.k.x && liveState.last_processed_candle_time && liveState.last_processed_candle_time >= kline.k.t) {
      console.log(`[WEBSOCKET] ⏭️ Skipping ${strategy.name} - candle ${kline.k.t} already processed at ${liveState.last_processed_candle_time}`);
      continue;
    }

    try {
      let signalGenerated = false;
      let signalType: 'buy' | 'sell' | null = null;
      let reason = '';

      console.log(`[DEBUG] Evaluating ${strategy.name}: position_open=${liveState.position_open}, cross_dir=${liveState.last_cross_direction}, tick=${!kline.k.x}, priceOnly=${entryPriceOnly}/${exitPriceOnly}`);
      console.log(`[DEBUG] Entry conditions: ${strategy.entry_conditions.length}, Exit conditions: ${strategy.exit_conditions.length}`);

      // For price-only strategies on live ticks, include current candle
      // For technical indicators, only use closed candles
      const evalBuffer = (entryPriceOnly || exitPriceOnly) && !kline.k.x ? [...buffer, candle] : buffer;

      if (!liveState.position_open) {
        // Check if position already exists on Binance before generating entry signal
        const userSettingsForCheck = userSettings.get(strategy.user_id);
        if (userSettingsForCheck?.binance_api_key && userSettingsForCheck?.binance_api_secret) {
          const positionExists = await checkBinancePosition(
            userSettingsForCheck.binance_api_key,
            userSettingsForCheck.binance_api_secret,
            userSettingsForCheck.use_testnet,
            symbol
          );
          
          if (positionExists) {
            console.log(`[WEBSOCKET] ⚠️ Skipping entry signal for ${strategy.name} - position already open on Binance`);
            continue;
          }
        }
        
        // Check entry conditions
        console.log(`[DEBUG] Checking ENTRY conditions for ${strategy.name} (tick=${!kline.k.x})`);
        if (await checkConditions(strategy.entry_conditions, evalBuffer, supabase, strategy.id, liveState, true)) {
          signalType = 'buy';
          reason = 'Entry conditions met';
          console.log(`[DEBUG] ✅ ENTRY SIGNAL GENERATED for ${strategy.name}`);
          
          // Update live state
          await supabase
            .from('strategy_live_states')
            .upsert({
              strategy_id: strategy.id,
              position_open: true,
              entry_price: candle.close,
              entry_time: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'strategy_id' });

          signalGenerated = true;
        } else {
          console.log(`[DEBUG] ❌ Entry conditions NOT met for ${strategy.name}`);
        }
      } else {
        // Check exit conditions
        console.log(`[DEBUG] Checking EXIT conditions for ${strategy.name} (tick=${!kline.k.x})`);
        if (await checkConditions(strategy.exit_conditions, evalBuffer, supabase, strategy.id, liveState, true)) {
          signalType = 'sell';
          reason = 'Exit conditions met';
          console.log(`[DEBUG] ✅ EXIT SIGNAL GENERATED for ${strategy.name}`);
          
          // Update live state
          await supabase
            .from('strategy_live_states')
            .upsert({
              strategy_id: strategy.id,
              position_open: false,
              entry_price: null,
              entry_time: null,
              updated_at: new Date().toISOString()
            }, { onConflict: 'strategy_id' });

          signalGenerated = true;
        } else {
          console.log(`[DEBUG] ❌ Exit conditions NOT met for ${strategy.name}`);
        }
      }

      if (signalGenerated && signalType) {
        console.log(`[WEBSOCKET] 🚨 SIGNAL DETECTED: ${signalType.toUpperCase()} for ${strategy.name} at ${candle.close} [instant=${!kline.k.x}]`);

        const signalData = {
          strategy_id: strategy.id,
          user_id: strategy.user_id,
          signal_type: signalType.toUpperCase(),
          symbol: symbol,
          price: candle.close.toString(),
          reason: reason,
          created_at: new Date().toISOString()
        };

        // Check if WebSocket is connected
        if (binanceWs?.readyState !== WebSocket.OPEN) {
          console.log('[WEBSOCKET] ⚠️ Disconnected - buffering signal to database');
          await bufferSignal(supabase, signalData, kline.k.t);
        } else {
          // Insert signal with retry logic
          const result = await insertSignalWithRetry(supabase, signalData);
          
          if (result.success) {
            lastSignalTime.set(strategyKey, now);
            console.log('[WEBSOCKET] Signal saved to database');

            // Send Telegram notification
            const settings = userSettings.get(strategy.user_id);
            if (settings?.telegram_enabled && settings.telegram_bot_token && settings.telegram_chat_id) {
              try {
                await sendTelegramSignal(
                  settings.telegram_bot_token,
                  settings.telegram_chat_id,
                  {
                    ...result.data,
                    strategy_name: strategy.name
                  }
                );
                
                // Update signal status to 'delivered' after successful send
                await supabase
                  .from('strategy_signals')
                  .update({ status: 'delivered' })
                  .eq('id', result.data.id);
                
                console.log('[WEBSOCKET] Telegram notification sent and signal marked as delivered');
              } catch (telegramError) {
                console.error('[WEBSOCKET] Telegram notification failed:', telegramError);
              }
            }
          } else {
            console.error(`[WEBSOCKET] ❌ Failed to insert signal after retries: ${result.error}`);
            // Buffer signal as fallback
            console.log('[WEBSOCKET] Buffering failed signal to database');
            await bufferSignal(supabase, signalData, kline.k.t);
          }
        }
      }

      // Update last_processed_candle_time for closed candles (prevents duplicate processing)
      if (kline.k.x) {
        const { error: updateError } = await supabase
          .from('strategy_live_states')
          .update({ 
            last_processed_candle_time: kline.k.t,
            updated_at: new Date().toISOString()
          })
          .eq('strategy_id', strategy.id);

        if (updateError) {
          console.error(`[WEBSOCKET] Failed to update last_processed_candle_time:`, updateError);
        } else {
          console.log(`[WEBSOCKET] ✅ Updated last_processed_candle_time to ${kline.k.t} for ${strategy.name}`);
        }
      }
    } catch (error) {
      console.error(`[WEBSOCKET] Error processing strategy ${strategy.name}:`, error);
    }
  }
}

async function loadActiveStrategies(supabase: any): Promise<{ strategies: ActiveStrategy[], userSettings: Map<string, any> }> {
  const { data: strategies, error: strategiesError } = await supabase
    .from('strategies')
    .select('*, strategy_conditions(*), strategy_live_states(*)')
    .eq('status', 'active');

  if (strategiesError) {
    console.error('[WEBSOCKET] Error loading strategies:', strategiesError);
    return { strategies: [], userSettings: new Map() };
  }

  const userIds = [...new Set(strategies.map((s: any) => s.user_id))];
  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .in('user_id', userIds);

  const userSettings = new Map();
  settings?.forEach((s: any) => userSettings.set(s.user_id, s));

  const activeStrategies: ActiveStrategy[] = strategies.map((s: any) => ({
    id: s.id,
    user_id: s.user_id,
    name: s.name,
    symbol: s.symbol,
    timeframe: s.timeframe,
    entry_conditions: s.strategy_conditions?.filter((c: any) => c.order_type === 'buy') || [],
    exit_conditions: s.strategy_conditions?.filter((c: any) => c.order_type === 'sell') || [],
    liveState: s.strategy_live_states?.[0] || { position_open: false, entry_price: null, entry_time: null }
  }));

  // Log loaded strategies for debugging
  console.log('[WEBSOCKET] Strategy details:', activeStrategies.map(s => ({
    name: s.name,
    symbol: s.symbol,
    timeframe: s.timeframe,
    entryConditions: s.entry_conditions.length,
    exitConditions: s.exit_conditions.length
  })));

  console.log(`[WEBSOCKET] Loaded ${activeStrategies.length} active strategies`);
  return { strategies: activeStrategies, userSettings };
}

// Initialize candle buffer from database (warm-up for accurate indicator calculations)
async function initializeCandleBuffer(
  supabase: any,
  symbol: string,
  timeframe: string
): Promise<Candle[]> {
  try {
    console.log(`[WEBSOCKET] Loading initial candle buffer for ${symbol} ${timeframe}...`);
    
    const { data, error } = await supabase
      .from('market_data')
      .select('*')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe)
      .order('open_time', { ascending: false })
      .limit(MAX_CANDLES);
    
    if (error) {
      console.error(`[WEBSOCKET] Error loading initial candles for ${symbol} ${timeframe}:`, error);
      return [];
    }
    
    if (!data || data.length === 0) {
      console.log(`[WEBSOCKET] No historical data found for ${symbol} ${timeframe}, starting fresh`);
      return [];
    }
    
    // Reverse to get chronological order (oldest first)
    const candles = data.reverse().map((d: any) => ({
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volume),
      timestamp: d.open_time
    }));
    
    console.log(`[WEBSOCKET] ✅ Loaded ${candles.length} historical candles for ${symbol} ${timeframe}`);
    return candles;
  } catch (error) {
    console.error(`[WEBSOCKET] Exception loading initial candles:`, error);
    return [];
  }
}

// Buffer signal during disconnection (persists to database)
async function bufferSignal(
  supabase: any,
  signalData: any,
  candleTimestamp: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from('signal_buffer')
      .insert({
        strategy_id: signalData.strategy_id,
        user_id: signalData.user_id,
        signal_type: signalData.signal_type,
        symbol: signalData.symbol,
        price: signalData.price,
        reason: signalData.reason,
        candle_timestamp: candleTimestamp,
        buffered_at: new Date().toISOString(),
        processed: false
      });
    
    if (error) {
      console.error('[BUFFER] Failed to buffer signal:', error);
    } else {
      console.log(`[BUFFER] ✅ Signal buffered for ${signalData.symbol} ${signalData.signal_type}`);
    }
  } catch (error) {
    console.error('[BUFFER] Exception buffering signal:', error);
  }
}

// Insert signal with retry (exponential backoff)
async function insertSignalWithRetry(
  supabase: any,
  signalData: any,
  maxRetries = 3
): Promise<{ success: boolean; data?: any; error?: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { data, error } = await supabase
        .from('strategy_signals')
        .insert(signalData)
        .select()
        .single();
      
      if (!error) {
        console.log(`[SIGNAL] ✅ Signal inserted successfully (attempt ${attempt + 1})`);
        return { success: true, data };
      }
      
      // Retry with exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`[SIGNAL] Retry ${attempt + 1} failed, waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[SIGNAL] Attempt ${attempt + 1} exception:`, errorMsg);
      
      if (attempt === maxRetries - 1) {
        return { success: false, error: errorMsg };
      }
    }
  }
  
  return { success: false, error: 'Max retries exceeded' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get('upgrade') || '';
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket connection', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('[WEBSOCKET] Client connecting...');

  const { socket, response } = Deno.upgradeWebSocket(req);
  let binanceWs: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  let heartbeatInterval: number | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_DELAY = 60000; // 1 minute max delay

  const connect = async () => {
    try {
      console.log('[WEBSOCKET] Loading active strategies...');
      const { strategies, userSettings } = await loadActiveStrategies(supabase);

      if (strategies.length === 0) {
        console.log('[WEBSOCKET] No active strategies found');
        socket.send(JSON.stringify({ type: 'status', message: 'No active strategies to monitor' }));
        return;
      }

      // Build stream subscriptions
      const streams = [...new Set(
        strategies.map(s => `${s.symbol.toLowerCase()}@kline_${s.timeframe}`)
      )];

      console.log(`[WEBSOCKET] Subscribing to ${streams.length} streams:`, streams);

      // Initialize candle buffers from database before connecting to WebSocket
      console.log('[WEBSOCKET] Initializing candle buffers from database...');
      const uniquePairs = [...new Set(strategies.map(s => `${s.symbol}_${s.timeframe}`))];
      
      for (const pair of uniquePairs) {
        const [symbol, timeframe] = pair.split('_');
        const bufferKey = `${symbol}_${timeframe}`;
        const initialCandles = await initializeCandleBuffer(supabase, symbol, timeframe);
        candleBuffers.set(bufferKey, initialCandles);
        console.log(`[WEBSOCKET] Buffer initialized: ${bufferKey} with ${initialCandles.length} candles`);
      }
      
      console.log('[WEBSOCKET] ✅ All candle buffers initialized, connecting to Binance...');

      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
      binanceWs = new WebSocket(wsUrl);

      binanceWs.onopen = () => {
        console.log('[WEBSOCKET] ✅ Connected to Binance WebSocket');
        reconnectAttempts = 0; // Reset counter on successful connection
        
        const connectionInfo = { 
          type: 'connected', 
          streams: streams.length,
          strategies: strategies.length,
          strategyDetails: strategies.map(s => ({
            name: s.name,
            symbol: s.symbol,
            timeframe: s.timeframe,
            hasEntry: s.entry_conditions.length > 0,
            hasExit: s.exit_conditions.length > 0
          })),
          timestamp: Date.now()
        };
        socket.send(JSON.stringify(connectionInfo));
        console.log('[WEBSOCKET] Connection info sent:', connectionInfo);

        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          if (binanceWs?.readyState === WebSocket.OPEN) {
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
          console.error('[WEBSOCKET] Error processing message:', error);
        }
      };

      binanceWs.onerror = (error) => {
        console.error('[WEBSOCKET] Binance WebSocket error:', error);
        socket.send(JSON.stringify({ type: 'error', message: 'Connection error' }));
      };

      binanceWs.onclose = () => {
        reconnectAttempts++;
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttempts), 
          MAX_RECONNECT_DELAY
        );
        
        console.log(`[WEBSOCKET] Binance WebSocket closed. Reconnect attempt ${reconnectAttempts} in ${delay}ms...`);
        socket.send(JSON.stringify({ 
          type: 'disconnected', 
          timestamp: Date.now(),
          reconnectAttempt: reconnectAttempts,
          nextRetryIn: delay
        }));
        
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        // Reconnect with exponential backoff
        reconnectTimeout = setTimeout(() => connect(), delay);
      };
    } catch (error) {
      console.error('[WEBSOCKET] Connection error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      socket.send(JSON.stringify({ type: 'error', message }));
    }
  };

  socket.onopen = () => {
    console.log('[WEBSOCKET] Client connected');
    connect();
  };

  socket.onclose = () => {
    console.log('[WEBSOCKET] Client disconnected');
    if (binanceWs) {
      binanceWs.close();
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  };

  return response;
});
