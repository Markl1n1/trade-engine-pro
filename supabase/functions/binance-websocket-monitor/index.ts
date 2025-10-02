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
const MAX_CANDLES = 200;

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

function evaluateCondition(condition: any, candles: Candle[], debug = false): boolean {
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
  switch (operator) {
    case 'greater_than':
      result = currentValue > parseFloat(value);
      break;
    case 'less_than':
      result = currentValue < parseFloat(value);
      break;
    case 'crosses_above':
      result = previousValue !== null && previousValue <= parseFloat(value) && currentValue > parseFloat(value);
      break;
    case 'crosses_below':
      result = previousValue !== null && previousValue >= parseFloat(value) && currentValue < parseFloat(value);
      break;
    default:
      result = false;
  }

  if (debug) {
    console.log(`[DEBUG] Condition: ${indicator_type} ${operator} ${value}`);
    console.log(`[DEBUG] Previous: ${previousValue?.toFixed(2)}, Current: ${currentValue.toFixed(2)}, Result: ${result}`);
  }

  return result;
}

function checkConditions(conditions: any[], candles: Candle[], debug = false): boolean {
  if (!conditions || conditions.length === 0) {
    if (debug) console.log('[DEBUG] No conditions to check');
    return false;
  }
  
  if (debug) console.log(`[DEBUG] Checking ${conditions.length} conditions`);
  const results = conditions.map(condition => evaluateCondition(condition, candles, debug));
  const allMet = results.every(r => r);
  
  if (debug) console.log(`[DEBUG] All conditions met: ${allMet}`);
  return allMet;
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
  userSettings: Map<string, any>
) {
  const symbol = kline.s;
  const interval = kline.i;
  const bufferKey = `${symbol}_${interval}`;

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
  } else {
    buffer.push(candle);
    if (buffer.length > MAX_CANDLES) {
      buffer.shift();
    }
  }

  // Check if candle is closed
  if (!kline.k.x) return; // Only process closed candles

  console.log(`[WEBSOCKET] Processing closed candle for ${symbol} ${interval} at price ${candle.close}`);

  // Evaluate all strategies for this symbol/timeframe
  for (const strategy of strategies) {
    if (strategy.symbol !== symbol || strategy.timeframe !== interval) continue;

    const strategyKey = `${strategy.id}_${symbol}_${interval}`;
    const now = Date.now();
    const lastSignal = lastSignalTime.get(strategyKey) || 0;

    if (now - lastSignal < SIGNAL_COOLDOWN_MS) {
      console.log(`[WEBSOCKET] Rate limit: Skipping ${strategy.name} (cooldown active)`);
      continue;
    }

    const liveState = strategy.liveState || { position_open: false, entry_price: null, entry_time: null };

    try {
      let signalGenerated = false;
      let signalType: 'buy' | 'sell' | null = null;
      let reason = '';

      console.log(`[DEBUG] Evaluating ${strategy.name}: position_open=${liveState.position_open}`);
      console.log(`[DEBUG] Entry conditions: ${strategy.entry_conditions.length}, Exit conditions: ${strategy.exit_conditions.length}`);

      if (!liveState.position_open) {
        // Check entry conditions
        console.log(`[DEBUG] Checking ENTRY conditions for ${strategy.name}`);
        if (checkConditions(strategy.entry_conditions, buffer, true)) {
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
        console.log(`[DEBUG] Checking EXIT conditions for ${strategy.name}`);
        if (checkConditions(strategy.exit_conditions, buffer, true)) {
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
        console.log(`[WEBSOCKET] 🚨 SIGNAL DETECTED: ${signalType.toUpperCase()} for ${strategy.name} at ${candle.close}`);

        // Insert signal
        const { data: signalData, error: signalError } = await supabase
          .from('strategy_signals')
          .insert({
            strategy_id: strategy.id,
            user_id: strategy.user_id,
            signal_type: signalType,
            symbol: symbol,
            price: candle.close.toString(),
            reason: reason,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (signalError) {
          console.error('[WEBSOCKET] Error inserting signal:', signalError);
        } else {
          lastSignalTime.set(strategyKey, now);
          console.log('[WEBSOCKET] Signal saved to database');

          // Send Telegram notification
          const settings = userSettings.get(strategy.user_id);
          if (settings?.telegram_enabled && settings.telegram_bot_token && settings.telegram_chat_id) {
            await sendTelegramSignal(
              settings.telegram_bot_token,
              settings.telegram_chat_id,
              {
                ...signalData,
                strategy_name: strategy.name
              }
            );
          }
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

      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
      binanceWs = new WebSocket(wsUrl);

      binanceWs.onopen = () => {
        console.log('[WEBSOCKET] ✅ Connected to Binance WebSocket');
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
            await processKlineUpdate(supabase, data.data, strategies, userSettings);
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
        console.log('[WEBSOCKET] Binance WebSocket closed. Reconnecting in 5s...');
        socket.send(JSON.stringify({ type: 'disconnected', timestamp: Date.now() }));
        
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        // Reconnect after 5 seconds
        reconnectTimeout = setTimeout(() => connect(), 5000);
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
