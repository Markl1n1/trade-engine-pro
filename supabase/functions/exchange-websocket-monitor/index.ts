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
const MAX_CANDLES = 500;

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

    case 'volume_avg': {
      const period = params.period || 20;
      if (volumes.length < period) return null;
      const sum = volumes.slice(-period).reduce((a, b) => a + b, 0);
      return sum / period;
    }

    default:
      return null;
  }
}

// Check if conditions are met
function checkConditions(conditions: any[], candles: Candle[]): boolean {
  if (!conditions || conditions.length === 0) return false;

  return conditions.every(cond => {
    const value = calculateIndicator(cond.indicator_type, candles, { 
      period: cond.period_1 || cond.period || 14 
    });
    
    if (value === null) return false;

    switch (cond.operator) {
      case 'greater_than':
        return value > cond.value;
      case 'less_than':
        return value < cond.value;
      case 'crosses_above':
      case 'crosses_below':
        return Math.abs(value - cond.value) < (value * 0.01);
      default:
        return false;
    }
  });
}

// Initialize candle buffer from database
async function initializeCandleBuffer(supabase: any, symbol: string, timeframe: string, exchangeType: string) {
  const key = `${symbol}-${timeframe}-${exchangeType}`;
  
  if (candleBuffers.has(key)) {
    console.log(`[INIT] Buffer already exists for ${key}`);
    return;
  }

  try {
    const { data: historicalCandles, error } = await supabase
      .from('market_data')
      .select('*')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe)
      .eq('exchange_type', exchangeType)
      .order('open_time', { ascending: false })
      .limit(MAX_CANDLES);

    if (error) {
      console.error(`[INIT] Error fetching historical data for ${key}:`, error);
      candleBuffers.set(key, []);
      return;
    }

    if (!historicalCandles || historicalCandles.length === 0) {
      console.log(`[INIT] No historical data for ${key}, starting fresh`);
      candleBuffers.set(key, []);
      return;
    }

    const candles: Candle[] = historicalCandles
      .reverse()
      .map((c: any) => ({
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume),
        timestamp: c.open_time
      }));

    candleBuffers.set(key, candles);
    console.log(`[INIT] Loaded ${candles.length} candles for ${key}`);
  } catch (error) {
    console.error(`[INIT] Exception loading buffer for ${key}:`, error);
    candleBuffers.set(key, []);
  }
}

// Process Binance kline update
async function processBinanceKline(
  supabase: any,
  klineData: any,
  strategies: ActiveStrategy[],
  userSettings: any,
  exchangeWs: WebSocket
) {
  const symbol = klineData.s;
  const timeframe = klineData.k.i;
  const key = `${symbol}-${timeframe}-binance`;

  if (!klineData.k.x) return;

  const candle: Candle = {
    open: parseFloat(klineData.k.o),
    high: parseFloat(klineData.k.h),
    low: parseFloat(klineData.k.l),
    close: parseFloat(klineData.k.c),
    volume: parseFloat(klineData.k.v),
    timestamp: klineData.k.t
  };

  let buffer = candleBuffers.get(key) || [];
  buffer.push(candle);
  if (buffer.length > MAX_CANDLES) buffer = buffer.slice(-MAX_CANDLES);
  candleBuffers.set(key, buffer);

  // Store in database with exchange_type
  await supabase.from('market_data').insert({
    symbol,
    timeframe,
    exchange_type: 'binance',
    open_time: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    close_time: klineData.k.T
  });

  // Check strategies for this symbol/timeframe
  const relevantStrategies = strategies.filter(s => 
    s.symbol === symbol && s.timeframe === timeframe
  );

  for (const strategy of relevantStrategies) {
    await evaluateStrategy(supabase, strategy, buffer, userSettings);
  }
}

// Process Bybit kline update
async function processBybitKline(
  supabase: any,
  klineData: any,
  strategies: ActiveStrategy[],
  userSettings: any,
  exchangeWs: WebSocket
) {
  const symbol = klineData.data[0].symbol;
  const timeframe = klineData.data[0].interval;
  const key = `${symbol}-${timeframe}-bybit`;
  
  const kline = klineData.data[0];
  if (!kline.confirm) return; // Only process confirmed candles

  const candle: Candle = {
    open: parseFloat(kline.open),
    high: parseFloat(kline.high),
    low: parseFloat(kline.low),
    close: parseFloat(kline.close),
    volume: parseFloat(kline.volume),
    timestamp: kline.start
  };

  let buffer = candleBuffers.get(key) || [];
  buffer.push(candle);
  if (buffer.length > MAX_CANDLES) buffer = buffer.slice(-MAX_CANDLES);
  candleBuffers.set(key, buffer);

  // Store in database with exchange_type
  await supabase.from('market_data').insert({
    symbol,
    timeframe,
    exchange_type: 'bybit',
    open_time: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    close_time: kline.end
  });

  // Check strategies for this symbol/timeframe
  const relevantStrategies = strategies.filter(s => 
    s.symbol === symbol && s.timeframe === timeframe
  );

  for (const strategy of relevantStrategies) {
    await evaluateStrategy(supabase, strategy, buffer, userSettings);
  }
}

// Evaluate strategy conditions
async function evaluateStrategy(
  supabase: any,
  strategy: ActiveStrategy,
  candles: Candle[],
  userSettings: any
) {
  if (candles.length < 200) return;

  const cooldownKey = `${strategy.id}-${strategy.user_id}`;
  const now = Date.now();
  const lastSignal = lastSignalTime.get(cooldownKey) || 0;
  
  if (now - lastSignal < SIGNAL_COOLDOWN_MS) return;

  const currentCandle = candles[candles.length - 1];
  const liveState = strategy.liveState || { position_open: false, entry_price: null, entry_time: null };

  let signalType: 'BUY' | 'SELL' | null = null;
  let reason = '';

  if (strategy.strategy_type === 'ath_guard_scalping') {
    const athSignal = evaluateATHGuardStrategy(candles, {
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
    }, liveState.position_open);

    if (athSignal.signal_type) {
      signalType = athSignal.signal_type;
      reason = athSignal.reason;
    }
  } else {
    // Standard condition-based strategies
    if (!liveState.position_open && checkConditions(strategy.entry_conditions, candles)) {
      signalType = 'BUY';
      reason = 'Entry conditions met';
    } else if (liveState.position_open && checkConditions(strategy.exit_conditions, candles)) {
      signalType = 'SELL';
      reason = 'Exit conditions met';
    }
  }

  if (signalType) {
    lastSignalTime.set(cooldownKey, now);

    const signal = {
      user_id: strategy.user_id,
      strategy_id: strategy.id,
      symbol: strategy.symbol,
      signal_type: signalType,
      price: currentCandle.close,
      reason,
      candle_close_time: currentCandle.timestamp,
      status: 'pending'
    };

    const { data: insertedSignal, error: insertError } = await insertSignalWithRetry(supabase, signal, 3);
    
    if (!insertError && insertedSignal) {
      console.log(`[SIGNAL] ${signalType} for ${strategy.name} at ${currentCandle.close}`);
      
      if (userSettings.telegram_enabled && userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
        const telegramSuccess = await sendTelegramUtil(
          userSettings.telegram_bot_token,
          userSettings.telegram_chat_id,
          {
            strategy_name: strategy.name,
            signal_type: signalType,
            symbol: strategy.symbol,
            price: currentCandle.close,
            reason,
            timestamp: currentCandle.timestamp
          }
        );

        if (telegramSuccess) {
          await markSignalAsDelivered(supabase, insertedSignal.id);
        }
      }

      // Update strategy state
      if (signalType === 'BUY') {
        await supabase
          .from('strategy_live_states')
          .upsert({
            strategy_id: strategy.id,
            user_id: strategy.user_id,
            position_open: true,
            entry_price: currentCandle.close,
            entry_time: new Date().toISOString(),
            last_signal_time: new Date().toISOString(),
            last_processed_candle_time: currentCandle.timestamp
          });
      } else if (signalType === 'SELL') {
        await supabase
          .from('strategy_live_states')
          .update({
            position_open: false,
            entry_price: null,
            entry_time: null,
            last_signal_time: new Date().toISOString(),
            last_processed_candle_time: currentCandle.timestamp
          })
          .eq('strategy_id', strategy.id);
      }
    }
  }
}

// Map timeframe to Bybit format
function mapTimeframeToBybit(timeframe: string): string {
  const map: Record<string, string> = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
    '1M': 'M'
  };
  return map[timeframe] || timeframe;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get('upgrade') || '';
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426, headers: corsHeaders });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let exchangeWs: WebSocket | null = null;
  let heartbeatInterval: number | null = null;
  let reconnectTimeout: number | null = null;
  let isConnecting = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;

  socket.onopen = async () => {
    console.log('[MONITOR] Client connected');

    // Fetch active strategies
    const { data: strategies, error: strategyError } = await supabase
      .from('strategies')
      .select(`
        *,
        entry_conditions:strategy_conditions!strategy_conditions_strategy_id_fkey(*)
      `)
      .eq('status', 'active');

    if (strategyError || !strategies || strategies.length === 0) {
      socket.send(JSON.stringify({ 
        type: 'error', 
        message: 'No active strategies found',
        timestamp: Date.now()
      }));
      socket.close();
      return;
    }

    // Get user settings to determine exchange
    const userId = strategies[0].user_id;
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    const exchangeType = settings?.exchange_type || 'binance';
    console.log(`[MONITOR] Using exchange: ${exchangeType}`);

    // Fetch live states
    const { data: liveStates } = await supabase
      .from('strategy_live_states')
      .select('*')
      .in('strategy_id', strategies.map(s => s.id));

    const stateMap = new Map(liveStates?.map(s => [s.strategy_id, s]) || []);
    
    const processedStrategies = strategies.map(s => ({
      ...s,
      entry_conditions: s.entry_conditions || [],
      exit_conditions: [], // Loaded separately if needed
      liveState: stateMap.get(s.id)
    }));

    // Build unique streams
    const uniqueStreams = new Set<string>();
    for (const strategy of processedStrategies) {
      if (exchangeType === 'bybit') {
        uniqueStreams.add(`${strategy.symbol}.${mapTimeframeToBybit(strategy.timeframe)}`);
      } else {
        uniqueStreams.add(`${strategy.symbol.toLowerCase()}@kline_${strategy.timeframe}`);
      }
    }

    // Initialize candle buffers
    for (const strategy of processedStrategies) {
      await initializeCandleBuffer(
        supabase, 
        strategy.symbol, 
        strategy.timeframe,
        exchangeType
      );
    }

    // Connect to appropriate exchange
    const connectExchange = () => {
      if (isConnecting || exchangeWs?.readyState === WebSocket.OPEN) return;
      
      isConnecting = true;
      
      if (exchangeType === 'bybit') {
        connectBybit(processedStrategies, settings, uniqueStreams);
      } else {
        connectBinance(processedStrategies, settings, uniqueStreams);
      }
    };

    const connectBinance = (strategies: any[], userSettings: any, streams: Set<string>) => {
      const streamList = Array.from(streams).join('/');
      exchangeWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${streamList}`);

      exchangeWs.onopen = () => {
        console.log('[BINANCE-WS] Connected');
        isConnecting = false;
        reconnectAttempts = 0;
        
        socket.send(JSON.stringify({
          type: 'connected',
          exchange: 'binance',
          streams: streams.size,
          strategies: strategies.length,
          timestamp: Date.now()
        }));

        // Binance heartbeat: ping every 3 minutes
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (exchangeWs?.readyState === WebSocket.OPEN) {
            exchangeWs.send('ping');
          }
          // Client heartbeat
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
          }
        }, 180000); // 3 minutes
      };

      exchangeWs.onmessage = async (event) => {
        if (event.data === 'pong') return; // Binance pong response
        
        try {
          const data = JSON.parse(event.data);
          if (data.stream && data.data) {
            await processBinanceKline(supabase, data.data, strategies, userSettings, exchangeWs!);
          }
        } catch (error) {
          console.error('[BINANCE-WS] Error processing message:', error);
        }
      };

      exchangeWs.onerror = (error) => {
        console.error('[BINANCE-WS] Error:', error);
        isConnecting = false;
      };

      exchangeWs.onclose = () => {
        console.log('[BINANCE-WS] Disconnected');
        isConnecting = false;
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts), 60000);
          console.log(`[BINANCE-WS] Reconnecting in ${backoffTime}ms (attempt ${reconnectAttempts})`);
          
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => connectBinance(strategies, userSettings, streams), backoffTime);
        }
      };
    };

    const connectBybit = (strategies: any[], userSettings: any, streams: Set<string>) => {
      exchangeWs = new WebSocket('wss://stream.bybit.com/v5/public/linear');

      exchangeWs.onopen = () => {
        console.log('[BYBIT-WS] Connected');
        isConnecting = false;
        reconnectAttempts = 0;
        
        // Subscribe to kline streams
        const subscribeArgs = Array.from(streams).map(stream => {
          const [symbol, interval] = stream.split('.');
          return `kline.${interval}.${symbol}`;
        });

        exchangeWs!.send(JSON.stringify({
          op: 'subscribe',
          args: subscribeArgs
        }));

        socket.send(JSON.stringify({
          type: 'connected',
          exchange: 'bybit',
          streams: streams.size,
          strategies: strategies.length,
          timestamp: Date.now()
        }));

        // Bybit heartbeat: ping every 20 seconds
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (exchangeWs?.readyState === WebSocket.OPEN) {
            exchangeWs.send(JSON.stringify({ op: 'ping' }));
          }
          // Client heartbeat
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
          }
        }, 20000); // 20 seconds
      };

      exchangeWs.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.op === 'pong') return; // Bybit pong response
          
          if (data.topic && data.topic.startsWith('kline')) {
            await processBybitKline(supabase, data, strategies, userSettings, exchangeWs!);
          }
        } catch (error) {
          console.error('[BYBIT-WS] Error processing message:', error);
        }
      };

      exchangeWs.onerror = (error) => {
        console.error('[BYBIT-WS] Error:', error);
        console.error('[BYBIT-WS] WebSocket state:', exchangeWs?.readyState);
        console.error('[BYBIT-WS] WebSocket URL:', exchangeWs?.url);
        isConnecting = false;
      };

      exchangeWs.onclose = () => {
        console.log('[BYBIT-WS] Disconnected');
        isConnecting = false;
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts), 60000);
          console.log(`[BYBIT-WS] Reconnecting in ${backoffTime}ms (attempt ${reconnectAttempts})`);
          
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => connectBybit(strategies, userSettings, streams), backoffTime);
        }
      };
    };

    connectExchange();
  };

  socket.onclose = () => {
    console.log('[MONITOR] Client disconnected');
    if (exchangeWs) exchangeWs.close();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  };

  return response;
});
