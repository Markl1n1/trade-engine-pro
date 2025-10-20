import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as indicators from "../indicators/all-indicators.ts";
import { 
  insertSignalWithRetry, 
  sendTelegramSignal as sendTelegramUtil,
  markSignalAsDelivered 
} from '../helpers/signal-utils.ts';
import { evaluateATHGuardStrategy } from '../helpers/ath-guard-strategy.ts';
import { evaluate4hReentry } from '../helpers/4h-reentry-strategy.ts';
import { evaluateMSTG } from '../helpers/mstg-strategy.ts';
import { evaluateSMACrossoverStrategy, defaultSMACrossoverConfig } from '../helpers/sma-crossover-strategy.ts';
import { evaluateMTFMomentum, defaultMTFMomentumConfig } from '../helpers/mtf-momentum-strategy.ts';
import { enhancedTelegramSignaler, TradingSignal } from '../helpers/enhanced-telegram-signaler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Валидация режимов торговли
function validateTradingMode(tradingMode: string, userSettings: any): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  switch (tradingMode) {
    case 'testnet_only':
      if (!userSettings?.binance_testnet_api_key || !userSettings?.binance_testnet_api_secret) {
        errors.push('Testnet API keys required for testnet_only mode');
      }
      break;
      
    case 'hybrid_safe':
      if (!userSettings?.binance_testnet_api_key || !userSettings?.binance_testnet_api_secret) {
        errors.push('Testnet API keys required for hybrid_safe mode');
      }
      if (!userSettings?.use_mainnet_data) {
        warnings.push('Hybrid safe mode should use mainnet data for accuracy');
      }
      break;
      
    case 'hybrid_live':
      if (!userSettings?.binance_testnet_api_key || !userSettings?.binance_testnet_api_secret) {
        errors.push('Testnet API keys required for hybrid_live mode');
      }
      if (!userSettings?.use_mainnet_data) {
        warnings.push('Hybrid live mode should use mainnet data for accuracy');
      }
      warnings.push('Hybrid live mode executes real trades via testnet API');
      break;
      
    case 'paper_trading':
      if (!userSettings?.use_mainnet_data) {
        warnings.push('Paper trading mode should use mainnet data for accuracy');
      }
      break;
      
    case 'mainnet_only':
      if (!userSettings?.binance_mainnet_api_key || !userSettings?.binance_mainnet_api_secret) {
        errors.push('Mainnet API keys required for mainnet_only mode');
      }
      if (userSettings?.use_testnet_api) {
        warnings.push('Mainnet only mode should not use testnet API');
      }
      warnings.push('Mainnet only mode executes real trades with real money');
      break;
      
    default:
      errors.push(`Unknown trading mode: ${tradingMode}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Определяет, нужно ли проверять позицию на бирже для данного режима
function shouldCheckExchangePosition(tradingMode: string): boolean {
  switch (tradingMode) {
    case 'mainnet_only':
    case 'hybrid_live':
      return true; // Режимы с реальным выполнением
    case 'testnet_only':
    case 'hybrid_safe':
    case 'paper_trading':
    default:
      return false; // Режимы без реального выполнения
  }
}

// Определяет, нужно ли выполнять реальные сделки для данного режима
function shouldExecuteRealTrades(tradingMode: string): boolean {
  switch (tradingMode) {
    case 'mainnet_only':
    case 'hybrid_live':
      return true; // Режимы с реальным выполнением
    case 'testnet_only':
    case 'hybrid_safe':
    case 'paper_trading':
    default:
      return false; // Режимы без реального выполнения
  }
}

// Triggers instant signal execution via instant-signals Edge Function
async function triggerInstantSignalExecution(signal: any, userSettings: any, tradingMode: string) {
  try {
    console.log(`[CRON] Triggering instant signal execution for signal ${signal.id}`);
    
    const instantSignalsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/instant-signals`;
    
    const signalPayload = {
      type: 'signal',
      signal: {
        id: signal.id,
        strategyId: signal.strategy_id,
        userId: signal.user_id,
        symbol: signal.symbol,
        signal_type: signal.signal_type,
        price: signal.price,
        quantity: 0.001, // Default for scalping
        reason: signal.reason,
        timestamp: signal.created_at,
        channels: ['websocket', 'telegram'],
        priority: 'high'
      }
    };
    
    const response = await fetch(instantSignalsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify(signalPayload)
    });
    
    if (!response.ok) {
      throw new Error(`Instant signals API error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`[CRON] Instant signal execution result:`, result);
    
  } catch (error) {
    console.error(`[CRON] Failed to trigger instant signal execution:`, error);
    throw error;
  }
}

const EXCHANGE_URLS = {
  binance: {
    mainnet: 'https://fapi.binance.com',
    testnet: 'https://testnet.binancefuture.com',
  },
  bybit: {
    mainnet: 'https://api.bybit.com',
    testnet: 'https://api-testnet.bybit.com',
  },
};

const INTERVAL_MAPPING: Record<string, Record<string, string>> = {
  binance: { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' },
  bybit: { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' },
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

// Fetch market data using hybrid data manager
async function fetchHybridMarketData(
  symbol: string,
  timeframe: string,
  limit: number
): Promise<Candle[]> {
  try {
    console.log(`[HYBRID] Fetching market data for ${symbol} ${timeframe}`);
    
    // Import hybrid data manager
    const { createHybridDataManager, getOptimalHybridConfig } = await import('../helpers/hybrid-data-manager.ts');
    
    // Get optimal configuration
    const config = getOptimalHybridConfig('medium', true);
    
    // Create data manager
    const dataManager = createHybridDataManager(config, 'binance');
    
    // Get market data
    const result = await dataManager.getMarketData({
      symbol,
      timeframe,
      limit
    });
    
    console.log(`[HYBRID] Retrieved ${result.data.length} candles from ${result.source} (quality: ${result.quality})`);
    
    if (result.warnings.length > 0) {
      console.warn(`[HYBRID] Warnings: ${result.warnings.join(', ')}`);
    }
    
    return result.data as unknown as Candle[];
    
  } catch (error) {
    console.error(`[HYBRID] Error fetching market data:`, error);
    throw error;
  }
}

// Fetch market data from exchange API with exponential backoff retry
async function fetchMarketData(
  symbol: string, 
  timeframe: string, 
  limit = 100, 
  exchangeType: string = 'binance',
  useTestnet: boolean = false,
  maxRetries = 3
): Promise<Candle[]> {
  // Check if we should use hybrid data manager
  if (Deno.env.get('USE_HYBRID_DATA') === 'true') {
    return await fetchHybridMarketData(symbol, timeframe, limit);
  }
  const exchange = exchangeType as 'binance' | 'bybit';
  const baseUrl = useTestnet ? EXCHANGE_URLS[exchange].testnet : EXCHANGE_URLS[exchange].mainnet;
  const mappedInterval = INTERVAL_MAPPING[exchange][timeframe] || timeframe;
  
  const endpoint = exchange === 'binance' 
    ? `/fapi/v1/klines?symbol=${symbol}&interval=${mappedInterval}&limit=${limit}`
    : `/v5/market/kline?category=linear&symbol=${symbol}&interval=${mappedInterval}&limit=${limit}`;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (exchange === 'binance') {
        return data.map((k: any) => ({
          timestamp: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
      } else {
        return data.result.list.reverse().map((k: any) => ({
          timestamp: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
      }
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      console.error(`[CRON] ${exchange.toUpperCase()} API attempt ${attempt + 1}/${maxRetries} failed for ${symbol}:`, error);
      
      if (isLastAttempt) {
        throw new Error(`Failed to fetch market data for ${symbol} after ${maxRetries} attempts`);
      }
      
      const delay = Math.pow(2, attempt) * 1000;
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
  timeframe: string,
  exchangeType: string = 'binance',
  useTestnet: boolean = false
): Promise<Candle[]> {
  const dbCandles = await loadCandlesFromDatabase(supabase, symbol, timeframe, 500);
  const apiCandles = await fetchMarketData(symbol, timeframe, 100, exchangeType, useTestnet);
  
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

async function checkExchangePosition(
  apiKey: string, 
  apiSecret: string, 
  useTestnet: boolean, 
  symbol: string,
  exchangeType: string = 'binance'
): Promise<boolean | null> {
  try {
    if (exchangeType === 'binance') {
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
        return null;
      }
      
      const positions = await response.json();
      const position = positions.find((p: any) => p.symbol === symbol);
      const hasPosition = position && parseFloat(position.positionAmt) !== 0;
      
      console.log(`[BINANCE] ✅ Position check successful for ${symbol}: ${hasPosition ? 'OPEN' : 'CLOSED'}`);
      return hasPosition;
    } else if (exchangeType === 'bybit') {
      const baseUrl = useTestnet 
        ? 'https://api-testnet.bybit.com'
        : 'https://api.bybit.com';
      
      const timestamp = Date.now();
      const queryString = `category=linear&symbol=${symbol}&timestamp=${timestamp}`;
      
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
        `${baseUrl}/v5/position/list?${queryString}&signature=${signatureHex}`,
        {
          headers: {
            'X-BAPI-API-KEY': apiKey,
            'X-BAPI-TIMESTAMP': timestamp.toString(),
            'X-BAPI-SIGN': signatureHex,
          }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[BYBIT] ⚠️ Position check failed (${response.status}): ${errorText.substring(0, 200)}`);
        console.warn(`[BYBIT] API keys may be expired/invalid. Continuing with signal generation...`);
        return null;
      }
      
      const data = await response.json();
      const positions = data.result?.list || [];
      const position = positions.find((p: any) => p.symbol === symbol);
      const hasPosition = position && parseFloat(position.size) !== 0;
      
      console.log(`[BYBIT] ✅ Position check successful for ${symbol}: ${hasPosition ? 'OPEN' : 'CLOSED'}`);
      return hasPosition;
    }
    
    return null;
  } catch (error) {
    console.warn(`[${exchangeType.toUpperCase()}] ⚠️ Position check error:`, error);
    console.warn(`[${exchangeType.toUpperCase()}] Network/API issue detected. Continuing with signal generation...`);
    return null;
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
          .select(`
            telegram_enabled, 
            telegram_bot_token, 
            telegram_chat_id, 
            exchange_type,
            use_testnet,
            trading_mode,
            use_mainnet_data,
            use_testnet_api,
            paper_trading_mode,
            binance_api_key,
            binance_api_secret,
            binance_testnet_api_key,
            binance_testnet_api_secret,
            binance_mainnet_api_key,
            binance_mainnet_api_secret,
            bybit_testnet_api_key,
            bybit_testnet_api_secret,
            bybit_mainnet_api_key,
            bybit_mainnet_api_secret
          `)
          .eq('user_id', strategy.user_id)
          .single();

        // Валидация режима торговли
        const tradingMode = userSettings?.trading_mode || 'hybrid_safe';
        const validationResult = validateTradingMode(tradingMode, userSettings);
        
        if (!validationResult.valid) {
          console.log(`[CRON] ⚠️ Invalid trading mode configuration for ${strategy.name}: ${validationResult.errors.join(', ')}`);
          continue;
        }
        
        if (validationResult.warnings.length > 0) {
          console.log(`[CRON] ⚠️ Trading mode warnings for ${strategy.name}: ${validationResult.warnings.join(', ')}`);
        }

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

        const exchangeType = userSettings?.exchange_type || 'binance';
        const useTestnet = userSettings?.use_testnet || false;
        const candles = await getCandlesWithHistory(
          supabase, 
          strategy.symbol, 
          strategy.timeframe,
          exchangeType,
          useTestnet
        );
        
        if (candles.length === 0) {
          console.log(`[CRON] ⚠️ No candle data available for ${strategy.name}`);
          continue;
        }

        // Fix: Support both 'buy'/'sell' (DB values) and 'entry'/'exit' (legacy)
        const buyConditions = strategy.strategy_conditions.filter((c: any) => 
          c.order_type === 'buy' || c.order_type === 'entry'
        );
        const sellConditions = strategy.strategy_conditions.filter((c: any) => 
          c.order_type === 'sell' || c.order_type === 'exit'
        );
        const currentPrice = candles[candles.length - 1].close;
        
        console.log(`[CRON] Strategy conditions for ${strategy.name}: ${buyConditions.length} buy, ${sellConditions.length} sell`);

        let signalType: string | null = null;
        let signalReason = '';
        
        // Variables to hold TP/SL data for Telegram
        let signalStopLoss: number | undefined;
        let signalTakeProfit: number | undefined;
        let signalTakeProfit1: number | undefined;
        let signalTakeProfit2: number | undefined;
        let signalStopLossPercent: number | undefined;
        let signalTakeProfitPercent: number | undefined;

        // Check if this is an ATH Guard Scalping strategy
        if (strategy.strategy_type === 'ath_guard_scalping') {
          // Updated ATH Guard config with 1:2 ratio defaults
          const athGuardConfig = {
            ema_slope_threshold: strategy.ath_guard_ema_slope_threshold || 0.15,
            pullback_tolerance: strategy.ath_guard_pullback_tolerance || 0.15,
            volume_multiplier: strategy.ath_guard_volume_multiplier || 1.8,
            stoch_oversold: strategy.ath_guard_stoch_oversold || 25,
            stoch_overbought: strategy.ath_guard_stoch_overbought || 75,
            atr_sl_multiplier: strategy.ath_guard_atr_sl_multiplier || 1.0,  // 1:2 ratio - SL = 1.0x ATR
            atr_tp1_multiplier: strategy.ath_guard_atr_tp1_multiplier || 1.0, // Partial TP = 1.0x ATR
            atr_tp2_multiplier: strategy.ath_guard_atr_tp2_multiplier || 2.0, // Full TP = 2.0x ATR (1:2 ratio)
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
            signalStopLoss = athGuardSignal.stop_loss;
            signalTakeProfit = athGuardSignal.take_profit_1; // Use first TP for display
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
            signalStopLoss = reentrySignal.stop_loss;
            signalTakeProfit = reentrySignal.take_profit;
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
        else if (strategy.strategy_type === 'market_sentiment_trend_gauge' || strategy.strategy_type === 'mtf_momentum') {
          // Replace legacy MSTG with new Multi-Timeframe Momentum for scalping (1m/5m/15m)
          console.log(`[CRON] 🎯 Evaluating MTF Momentum strategy for ${strategy.symbol}`);
          
          // Short cooldown for scalping to avoid signal spam
          const SIGNAL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
          const lastSignalTime = liveState?.last_signal_time ? new Date(liveState.last_signal_time).getTime() : 0;
          const timeSinceLastSignal = Date.now() - lastSignalTime;
          if (lastSignalTime > 0 && timeSinceLastSignal < SIGNAL_COOLDOWN_MS) {
            const remaining = Math.ceil((SIGNAL_COOLDOWN_MS - timeSinceLastSignal) / 1000);
            console.log(`[CRON] ⏸️ MTF cooldown active. ${remaining}s remaining`);
            continue;
          }
          
          // Force scalping timeframes: 1m/5m/15m
          const candles1m = await getCandlesWithHistory(supabase, strategy.symbol, '1m', exchangeType, useTestnet);
          const candles5m = await getCandlesWithHistory(supabase, strategy.symbol, '5m', exchangeType, useTestnet);
          const candles15m = await getCandlesWithHistory(supabase, strategy.symbol, '15m', exchangeType, useTestnet);
          
          const mtfSignal = evaluateMTFMomentum(
            candles1m,
            candles5m,
            candles15m,
            defaultMTFMomentumConfig,
            liveState?.position_open || false
          );
          
          if (mtfSignal.signal_type) {
            signalType = mtfSignal.signal_type;
            signalReason = mtfSignal.reason;
            // Tight SL/TP for scalping 1:1.5
            signalStopLossPercent = strategy.stop_loss_percent || 0.5;
            signalTakeProfitPercent = strategy.take_profit_percent || 0.75;
            
            await supabase
              .from('strategy_live_states')
              .update({
                last_signal_time: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('strategy_id', strategy.id);
            
            console.log(`[CRON] ✅ MTF signal generated: ${signalType} - ${signalReason}`);
          } else {
            console.log(`[CRON] ⏸️ No MTF signal: ${mtfSignal.reason}`);
          }
        }
        else if (!liveState.position_open) {
          // Check if position already exists on exchange before generating entry signal
          const exchangeType = userSettings?.exchange_type || 'binance';
          const useTestnet = userSettings?.use_testnet || false;
          
          // Get appropriate API keys based on exchange and testnet
          let apiKey: string | undefined;
          let apiSecret: string | undefined;
          
          if (exchangeType === 'binance') {
            apiKey = useTestnet ? userSettings?.binance_testnet_api_key : userSettings?.binance_mainnet_api_key;
            apiSecret = useTestnet ? userSettings?.binance_testnet_api_secret : userSettings?.binance_mainnet_api_secret;
          } else if (exchangeType === 'bybit') {
            apiKey = useTestnet ? userSettings?.bybit_testnet_api_key : userSettings?.bybit_mainnet_api_key;
            apiSecret = useTestnet ? userSettings?.bybit_testnet_api_secret : userSettings?.bybit_mainnet_api_secret;
          }
          
          // Проверяем позицию только для режимов с реальным выполнением
          if (shouldCheckExchangePosition(tradingMode)) {
            if (apiKey && apiSecret) {
              const positionExists = await checkExchangePosition(
                apiKey,
                apiSecret,
                useTestnet,
                strategy.symbol,
                exchangeType
              );
              
              // Only skip if we CONFIRMED position exists (true)
              // If null (API error), continue with signal generation
              if (positionExists === true) {
                console.log(`[CRON] ⚠️ Skipping entry signal for ${strategy.name} - position confirmed open on ${exchangeType.toUpperCase()}`);
                continue;
              } else if (positionExists === null) {
                console.log(`[CRON] ⚠️ Could not verify ${exchangeType.toUpperCase()} position for ${strategy.name} - continuing with signal generation`);
              }
            }
          }

          // Support code-defined strategies: SMA 20/200 with RSI filter (scalping)
          if (strategy.strategy_type === 'sma_20_200_rsi') {
            const smaSignal = evaluateSMACrossoverStrategy(
              candles.map(c => ({
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume,
                timestamp: c.timestamp,
              })),
              defaultSMACrossoverConfig,
              false
            );
            if (smaSignal.signal_type) {
              signalType = smaSignal.signal_type;
              signalReason = smaSignal.reason;
              signalStopLoss = smaSignal.stop_loss;
              signalTakeProfit = smaSignal.take_profit;
              console.log(`[CRON] ✅ SMA 20/200 with RSI signal: ${signalType} - ${signalReason}`);
            } else {
              console.log(`[CRON] ⏸️ SMA: ${smaSignal.reason}`);
            }
          }

          const buyConditionsMet = checkConditions(buyConditions, candles);
          console.log(`[CRON] Buy conditions check for ${strategy.name}: ${buyConditionsMet}`);
          
          if (buyConditionsMet) {
            signalType = 'BUY';
            signalReason = 'Entry conditions met';
            // Use 1:2 ratio for custom strategies: SL = -1%, TP = +2%
            signalStopLossPercent = strategy.stop_loss_percent || 1.0;
            signalTakeProfitPercent = strategy.take_profit_percent || 2.0;
            console.log(`[CRON] ✅ BUY signal generated for ${strategy.name} (SL: ${signalStopLossPercent}%, TP: ${signalTakeProfitPercent}%)`);
            
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
          const sellConditionsMet = checkConditions(sellConditions, candles);
          console.log(`[CRON] Sell conditions check for ${strategy.name}: ${sellConditionsMet}`);
          
          if (sellConditionsMet) {
            signalType = 'SELL';
            signalReason = 'Exit conditions met';
            // Use 1:2 ratio for custom strategies: SL = -1%, TP = +2%
            signalStopLossPercent = strategy.stop_loss_percent || 1.0;
            signalTakeProfitPercent = strategy.take_profit_percent || 2.0;
            console.log(`[CRON] ✅ SELL signal generated for ${strategy.name} (SL: ${signalStopLossPercent}%, TP: ${signalTakeProfitPercent}%)`);
            
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

          // Выполняем сделку в зависимости от режима торговли
          if (shouldExecuteRealTrades(tradingMode)) {
            try {
              console.log(`[CRON] Executing real trade for ${strategy.name} in ${tradingMode} mode`);
              
              // Trigger instant-signals for real-time execution
              await triggerInstantSignalExecution(signal, userSettings, tradingMode);
              
            } catch (error) {
              console.error(`[CRON] Trade execution failed for ${strategy.name}:`, error);
            }
          } else {
            console.log(`[CRON] Signal generated for ${strategy.name} in ${tradingMode} mode (no real execution)`);
          }

          // Send enhanced Telegram notification IMMEDIATELY
          if (userSettings?.telegram_enabled && userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
            try {
              const telegramStartTime = Date.now();
              console.log(`[TELEGRAM-TIMING] ⏱️ Starting Telegram delivery for ${signalType} signal (${strategy.name}) at ${new Date(telegramStartTime).toISOString()}`);
              
              // Create enhanced trading signal
              const enhancedSignal: TradingSignal = {
                id: signal.id,
                userId: strategy.user_id,
                strategyId: strategy.id,
                strategyName: strategy.name,
                signalType: signalType as 'BUY' | 'SELL' | 'LONG' | 'SHORT',
                symbol: strategy.symbol,
                price: currentPrice,
                stopLoss: signalStopLoss,
                takeProfit: signalTakeProfit,
                takeProfit1: signalTakeProfit1,
                takeProfit2: signalTakeProfit2,
                reason: signalReason,
                timestamp: Date.now(),
                priority: 'high', // Default priority for trading signals
                tradingMode: userSettings.trading_mode || 'mainnet_only',
                originalSignalId: signal.id
              };
              
              const telegramSent = await enhancedTelegramSignaler.sendTradingSignal(enhancedSignal, userSettings);
              
              const telegramEndTime = Date.now();
              const telegramLatency = telegramEndTime - telegramStartTime;
              
              if (telegramSent) {
                await markSignalAsDelivered(supabase, signal.id);
                console.log(`[TELEGRAM-TIMING] ✅ ${signalType} signal DELIVERED for ${strategy.name}`);
                console.log(`[TELEGRAM-TIMING] ⏱️ Total delivery time: ${telegramLatency}ms (${(telegramLatency / 1000).toFixed(2)}s)`);
                console.log(`[TELEGRAM-TIMING] 📤 Signal sent at: ${new Date(telegramEndTime).toISOString()}`);
              } else {
                console.error(`[TELEGRAM-TIMING] ❌ Failed to send ${signalType} signal for ${strategy.name} after ${telegramLatency}ms`);
              }
            } catch (telegramError) {
              console.error(`[ENHANCED-TELEGRAM] ❌ Error sending Telegram notification for ${strategy.name}:`, telegramError);
            }
          } else {
            console.log(`[ENHANCED-TELEGRAM] Telegram disabled or not configured for ${strategy.name}`);
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
