import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { backtestSchema, validateInput } from '../helpers/input-validation.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as indicators from "../indicators/all-indicators.ts";
import { evaluateATHGuardStrategy } from '../helpers/ath-guard-strategy.ts';
import { evaluateSMACrossoverStrategy, defaultSMACrossoverConfig } from '../helpers/sma-crossover-strategy.ts';
import { EnhancedBacktestEngine } from '../helpers/backtest-engine.ts';

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
  open_time: number;
  close_time: number;
}

interface Trade {
  entry_price: number;
  entry_time: number;
  exit_price?: number;
  exit_time?: number;
  type: 'buy' | 'sell';
  quantity: number;
  profit?: number;
}

interface IndicatorCache {
  [key: string]: number[] | { [subkey: string]: number[] };
}

// Timezone conversion utility for NY time with DST handling
function convertToNYTime(timestamp: number): Date {
  const date = new Date(timestamp);
  
  // Determine if date is in DST (second Sunday in March to first Sunday in November)
  const year = date.getUTCFullYear();
  
  // Second Sunday in March
  const marchSecondSunday = new Date(Date.UTC(year, 2, 1)); // March 1
  marchSecondSunday.setUTCDate(1 + (7 - marchSecondSunday.getUTCDay()) + 7);
  
  // First Sunday in November
  const novFirstSunday = new Date(Date.UTC(year, 10, 1)); // November 1
  novFirstSunday.setUTCDate(1 + (7 - novFirstSunday.getUTCDay()));
  
  // DST begins at 2:00 AM on second Sunday in March, ends at 2:00 AM on first Sunday in November
  const isDST = date >= marchSecondSunday && date < novFirstSunday;
  
  // NY is UTC-4 (EDT) during DST, UTC-5 (EST) otherwise
  const offset = isDST ? -4 : -5;
  
  const utcTime = date.getTime();
  const nyTime = new Date(utcTime + (offset * 60 * 60 * 1000));
  
  return nyTime;
}

function isInNYSession(timestamp: number, sessionStart: string, sessionEnd: string): boolean {
  const nyTime = convertToNYTime(timestamp);
  const hours = nyTime.getUTCHours();
  const minutes = nyTime.getUTCMinutes();
  const currentMinutes = hours * 60 + minutes;
  
  const [startHours, startMins] = sessionStart.split(':').map(Number);
  const [endHours, endMins] = sessionEnd.split(':').map(Number);
  const startMinutes = startHours * 60 + startMins;
  const endMinutes = endHours * 60 + endMins;
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

async function runATHGuardBacktest(strategy: any, candles: Candle[], initialBalance: number, productType: string, leverage: number, makerFee: number, takerFee: number, slippage: number, executionTiming: string, supabaseClient: any, strategyId: string, startDate: string, endDate: string, corsHeaders: any) {
  console.log(`[ATH-GUARD] Starting optimized backtest for ${candles.length} candles`);
  
  let balance = initialBalance;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;

  const athGuardConfig = { 
    ema_slope_threshold: strategy.ath_guard_ema_slope_threshold || 0.15, 
    pullback_tolerance: strategy.ath_guard_pullback_tolerance || 0.15, 
    volume_multiplier: strategy.ath_guard_volume_multiplier || 1.8, 
    stoch_oversold: strategy.ath_guard_stoch_oversold || 25, 
    stoch_overbought: strategy.ath_guard_stoch_overbought || 75, 
    atr_sl_multiplier: 1.5, 
    atr_tp1_multiplier: 1.0, 
    atr_tp2_multiplier: 2.0, 
    ath_safety_distance: 0.2, 
    rsi_threshold: 70 
  };

  // Pre-calculate all indicators once
  console.log(`[ATH-GUARD] Pre-calculating indicators...`);
  const closes = candles.map(c => c.close);
  
  const ema50Array = calculateEMA(closes, 50);
  const ema100Array = calculateEMA(closes, 100);
  const ema150Array = calculateEMA(closes, 150);
  const vwapArray = calculateVWAP(candles);
  const macdData = calculateMACD(closes);
  const stochData = calculateStochastic(candles, 14);
  const rsiArray = calculateRSI(closes, 14);
  const atrArray = calculateATR(candles, 14);
  
  console.log(`[ATH-GUARD] Indicators calculated, starting simulation...`);

  // Main backtest loop - now just evaluates conditions
  for (let i = 150; i < candles.length; i++) {
    const signal = evaluateATHGuardStrategyOptimized(
      candles, 
      i, 
      athGuardConfig, 
      position !== null,
      ema50Array,
      ema100Array,
      ema150Array,
      vwapArray,
      macdData,
      stochData,
      rsiArray,
      atrArray
    );
    
    const currentCandle = candles[i];
    const executionPrice = currentCandle.close;

    if (signal.signal_type === 'BUY' && !position) {
      const quantity = (balance * 0.95) / executionPrice;
      position = { entry_price: executionPrice, entry_time: currentCandle.open_time, type: 'buy', quantity };
      trades.push(position);
    } else if (signal.signal_type === 'SELL' && position) {
      const profit = (executionPrice - position.entry_price) * position.quantity;
      position.exit_price = executionPrice;
      position.exit_time = currentCandle.open_time;
      position.profit = profit;
      balance += profit;
      position = null;
    }
    if (balance > maxBalance) maxBalance = balance;
    maxDrawdown = Math.max(maxDrawdown, ((maxBalance - balance) / maxBalance) * 100);
  }

  console.log(`[ATH-GUARD] Backtest complete: ${trades.length} trades, ${balance.toFixed(2)} final balance`);

  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winningTrades = trades.filter(t => t.profit && t.profit > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  await supabaseClient.from('strategy_backtest_results').insert({ 
    strategy_id: strategyId, 
    start_date: startDate, 
    end_date: endDate, 
    initial_balance: initialBalance, 
    final_balance: balance, 
    total_return: totalReturn, 
    total_trades: trades.length, 
    winning_trades: winningTrades, 
    losing_trades: trades.length - winningTrades, 
    win_rate: winRate, 
    max_drawdown: maxDrawdown, 
    sharpe_ratio: 0 
  });

  return new Response(JSON.stringify({ success: true, balance, totalReturn, trades: trades.length, winRate, maxDrawdown }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Helper functions for ATH Guard (imported from helper but duplicated here for performance)
function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(sma);
  for (let i = period; i < data.length; i++) {
    const ema = (data[i] - result[result.length - 1]) * multiplier + result[result.length - 1];
    result.push(ema);
  }
  return result;
}

function calculateVWAP(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    result.push(cumulativeVolume === 0 ? 0 : cumulativePV / cumulativeVolume);
  }
  return result;
}

function calculateMACD(data: number[]): { macd: number[], signal: number[], histogram: number[] } {
  const fastEMA = calculateEMA(data, 12);
  const slowEMA = calculateEMA(data, 26);
  const macd = fastEMA.map((v, i) => v - slowEMA[i]);
  const signal = calculateEMA(macd.slice(26), 9);
  const paddedSignal = new Array(26).fill(0).concat(signal);
  const histogram = macd.map((v, i) => v - paddedSignal[i]);
  return { macd, signal: paddedSignal, histogram };
}

function calculateStochastic(candles: Candle[], period: number = 14): { k: number[], d: number[] } {
  const k: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      k.push(0);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const low = Math.min(...slice.map(c => c.low));
      const high = Math.max(...slice.map(c => c.high));
      const close = candles[i].close;
      if (high === low) {
        k.push(50);
      } else {
        k.push(((close - low) / (high - low)) * 100);
      }
    }
  }
  const smoothedK = calculateSMA(k, 3);
  const d = calculateSMA(smoothedK, 3);
  return { k: smoothedK, d };
}

function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(50);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }
    }
  }
  return [50, ...result];
}

function calculateATR(candles: Candle[], period: number = 14): number[] {
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return [0, ...calculateEMA(tr, period)];
}

// Optimized evaluation function that uses pre-calculated indicators
function evaluateATHGuardStrategyOptimized(
  candles: Candle[],
  index: number,
  config: any,
  positionOpen: boolean,
  ema50Array: number[],
  ema100Array: number[],
  ema150Array: number[],
  vwapArray: number[],
  macdData: { macd: number[], signal: number[], histogram: number[] },
  stochData: { k: number[], d: number[] },
  rsiArray: number[],
  atrArray: number[]
): { signal_type: 'BUY' | 'SELL' | null; reason: string; stop_loss?: number; take_profit_1?: number; take_profit_2?: number } {
  
  if (index < 150) {
    return { signal_type: null, reason: 'Insufficient candle data' };
  }
  
  const currentPrice = candles[index].close;
  const currentEMA50 = ema50Array[index];
  const currentEMA100 = ema100Array[index];
  const currentEMA150 = ema150Array[index];
  const currentVWAP = vwapArray[index];
  const currentRSI = rsiArray[index];
  const currentATR = atrArray[index];
  
  const prevEMA150 = ema150Array[index - 1];
  const ema150Slope = ((currentEMA150 - prevEMA150) / prevEMA150) * 100;
  
  // Step 1: Check bias filter
  let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  
  if (
    currentPrice > currentEMA150 &&
    currentEMA50 > currentEMA100 &&
    currentEMA100 > currentEMA150 &&
    ema150Slope > config.ema_slope_threshold
  ) {
    bias = 'LONG';
  } else if (
    currentPrice < currentEMA150 &&
    currentEMA50 < currentEMA100 &&
    currentEMA100 < currentEMA150 &&
    ema150Slope < -config.ema_slope_threshold
  ) {
    bias = 'SHORT';
  }
  
  if (bias === 'NEUTRAL') {
    return { signal_type: null, reason: 'No clear bias - EMA alignment not met' };
  }
  
  // Step 2: Check pullback
  const previousPrice = candles[index - 1].close;
  const tolerance = config.pullback_tolerance / 100;
  
  let hasPullback = false;
  if (bias === 'LONG') {
    const distanceToVWAP = Math.abs(previousPrice - currentVWAP) / currentVWAP;
    const distanceToEMA = Math.abs(previousPrice - currentEMA50) / currentEMA50;
    const wasNearSupport = distanceToVWAP <= tolerance || distanceToEMA <= tolerance;
    const reclaimedSupport = currentPrice > currentVWAP || currentPrice > currentEMA50;
    hasPullback = wasNearSupport && reclaimedSupport;
  } else {
    const distanceToVWAP = Math.abs(previousPrice - currentVWAP) / currentVWAP;
    const distanceToEMA = Math.abs(previousPrice - currentEMA50) / currentEMA50;
    const wasNearResistance = distanceToVWAP <= tolerance || distanceToEMA <= tolerance;
    const rejectedResistance = currentPrice < currentVWAP || currentPrice < currentEMA50;
    hasPullback = wasNearResistance && rejectedResistance;
  }
  
  if (!hasPullback) {
    return { signal_type: null, reason: 'Waiting for pullback to VWAP/EMA50' };
  }
  
  // Step 3: Check momentum triggers
  const prevIdx = index - 1;
  const currentMACD = macdData.macd[index];
  const currentSignal = macdData.signal[index];
  const currentHistogram = macdData.histogram[index];
  const prevMACD = macdData.macd[prevIdx];
  const prevSignal = macdData.signal[prevIdx];
  const currentK = stochData.k[index];
  const currentD = stochData.d[index];
  const prevK = stochData.k[prevIdx];
  const prevD = stochData.d[prevIdx];
  
  let hasMomentum = false;
  if (bias === 'LONG') {
    const macdCross = prevMACD <= prevSignal && currentMACD > currentSignal && currentHistogram > 0;
    const stochCross = prevK <= prevD && currentK > currentD && prevK < config.stoch_oversold;
    hasMomentum = macdCross && stochCross;
  } else {
    const macdCross = prevMACD >= prevSignal && currentMACD < currentSignal && currentHistogram < 0;
    const stochCross = prevK >= prevD && currentK < currentD && prevK > config.stoch_overbought;
    hasMomentum = macdCross && stochCross;
  }
  
  if (!hasMomentum) {
    return { signal_type: null, reason: 'Momentum triggers not aligned (MACD + Stochastic)' };
  }
  
  // Step 4: Check volume
  if (index < 21) {
    return { signal_type: null, reason: 'Insufficient volume data' };
  }
  const currentVolume = candles[index].volume;
  const last20Volumes = candles.slice(index - 20, index).map(c => c.volume);
  const avgVolume = last20Volumes.reduce((a, b) => a + b, 0) / 20;
  const hasVolume = currentVolume >= avgVolume * config.volume_multiplier;
  
  if (!hasVolume) {
    return { signal_type: null, reason: `Volume too low (< ${config.volume_multiplier}x average)` };
  }
  
  // Step 5: Check ATH safety
  const lookback = Math.min(100, index);
  const recentCandles = candles.slice(index - lookback, index + 1);
  const recentHigh = Math.max(...recentCandles.map(c => c.high));
  const distanceToATH = ((currentPrice - recentHigh) / recentHigh) * 100;
  
  let athSafe = true;
  if (bias === 'LONG' && Math.abs(distanceToATH) < config.ath_safety_distance && currentRSI > config.rsi_threshold) {
    athSafe = false;
  }
  
  if (!athSafe) {
    return { signal_type: null, reason: 'Near ATH with high RSI - skipping aggressive entry' };
  }
  
  // All conditions met - generate signal
  if (!positionOpen && bias === 'LONG') {
    const stopLoss = currentPrice - (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice + (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice + (config.atr_tp2_multiplier * currentATR);
    
    return {
      signal_type: 'BUY',
      reason: 'ATH Guard LONG: Bias filter + Pullback + MACD cross + Stoch cross + Volume spike',
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
    };
  }
  
  if (!positionOpen && bias === 'SHORT') {
    const stopLoss = currentPrice + (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice - (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice - (config.atr_tp2_multiplier * currentATR);
    
    return {
      signal_type: 'SELL',
      reason: 'ATH Guard SHORT: Bias filter + Rejection + MACD cross + Stoch cross + Volume spike',
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
    };
  }
  
  // Exit logic
  if (positionOpen) {
    const positionType = currentPrice > currentEMA50 ? 'LONG' : 'SHORT';
    
    if (positionType === 'LONG' && currentPrice < currentEMA50) {
      return {
        signal_type: 'SELL',
        reason: 'Exit LONG: Price closed below EMA50',
      };
    }
    
    if (positionType === 'SHORT' && currentPrice > currentEMA50) {
      return {
        signal_type: 'BUY',
        reason: 'Exit SHORT: Price closed above EMA50',
      };
    }
  }
  
  return { signal_type: null, reason: 'No signal' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Validate input parameters
    const validated = validateInput(backtestSchema, {
      strategyId: body.strategyId,
      startDate: body.startDate,
      endDate: body.endDate,
      initialBalance: body.initialBalance || 10000,
      leverage: body.leverage || 1,
      makerFee: body.makerFee || 0.02,
      takerFee: body.takerFee || 0.04,
      slippage: body.slippage || 0.01,
      stopLossPercent: body.stopLossPercent,
      takeProfitPercent: body.takeProfitPercent,
      trailingStopPercent: body.trailingStopPercent,
      productType: body.productType || 'spot',
      executionTiming: body.executionTiming || 'close'
    });
    
    const { 
      strategyId, 
      startDate, 
      endDate, 
      initialBalance, 
      stopLossPercent, 
      takeProfitPercent,
      trailingStopPercent,
      leverage,
      makerFee,
      takerFee,
      slippage
    } = validated;
    
    // These have defaults in schema but TypeScript doesn't know that
    const productType = validated.productType ?? 'spot';
    const executionTiming = validated.executionTiming ?? 'close';

    console.log(`Running backtest for strategy ${strategyId} (${productType.toUpperCase()}, ${leverage}x leverage)`);
    console.log(`[BACKTEST] Parameters received:`, {
      stopLossPercent,
      takeProfitPercent,
      trailingStopPercent,
      initialBalance,
      productType,
      leverage
    });

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch strategy details
    const { data: strategy, error: strategyError } = await supabaseClient
      .from('strategies')
      .select('*')
      .eq('id', strategyId)
      .single();

    if (strategyError || !strategy) {
      throw new Error('Strategy not found');
    }

    console.log(`Strategy: ${strategy.name}, Symbol: ${strategy.symbol}, Timeframe: ${strategy.timeframe}, Type: ${strategy.strategy_type || 'standard'}`);

    // Fetch user settings to get exchange_type
    const { data: userSettings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('exchange_type')
      .eq('user_id', strategy.user_id)
      .single();

    if (settingsError) {
      console.warn('[BACKTEST] Could not fetch user settings, defaulting to binance:', settingsError);
    }

    // ✅ ПРАВИЛЬНО: Determine exchange-specific fees
    const exchangeType = userSettings?.exchange_type || 'binance';
    let exchangeMakerFee = makerFee;
    let exchangeTakerFee = takerFee;
    
    if (exchangeType === 'bybit') {
      // Bybit fees: 0.01% maker, 0.06% taker
      exchangeMakerFee = 0.01;
      exchangeTakerFee = 0.06;
    } else {
      // Binance fees: 0.02% maker, 0.04% taker (default)
      exchangeMakerFee = makerFee;
      exchangeTakerFee = takerFee;
    }
    
    console.log(`[BACKTEST] Exchange: ${exchangeType}, Maker Fee: ${exchangeMakerFee}%, Taker Fee: ${exchangeTakerFee}%`);

    // Fetch conditions separately (embedded select doesn't work reliably)
    const { data: conditions, error: conditionsError } = await supabaseClient
      .from('strategy_conditions')
      .select('*')
      .eq('strategy_id', strategyId)
      .order('order_index', { ascending: true });

    if (conditionsError) {
      console.error('Error fetching conditions:', conditionsError);
      throw new Error('Failed to load strategy conditions');
    }

    console.log(`Loaded ${conditions?.length || 0} conditions from database`);

    // Fetch condition groups
    const { data: groups, error: groupsError } = await supabaseClient
      .from('condition_groups')
      .select('*')
      .eq('strategy_id', strategyId)
      .order('order_index', { ascending: true });

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
    }

    console.log(`Loaded ${groups?.length || 0} condition groups from database`);

    // Validate strategy has conditions (skip for custom strategy types like 4h_reentry)
    const isCustomStrategy = strategy.strategy_type && strategy.strategy_type !== 'standard';
    if (!isCustomStrategy && (!conditions || conditions.length === 0)) {
      throw new Error('Strategy has no conditions defined. Please add entry/exit conditions before running backtest.');
    }
    
    console.log(`Strategy type: ${strategy.strategy_type || 'standard'}, Custom logic: ${isCustomStrategy}`);

    // Normalize indicator types and operators to lowercase for compatibility
    const normalizedConditions = conditions.map(c => ({
      ...c,
      indicator_type: c.indicator_type?.toLowerCase(),
      indicator_type_2: c.indicator_type_2?.toLowerCase(),
      operator: c.operator?.toLowerCase()
    }));

    // Fetch market data (fetch ALL candles - Supabase default limit is 1000)
    let allMarketData: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    console.log(`Fetching market data from ${startDate} to ${endDate}...`);

    while (hasMore) {
      const { data: batch, error: batchError } = await supabaseClient
        .from('market_data')
        .select('*')
        .eq('symbol', strategy.symbol)
        .eq('timeframe', strategy.timeframe)
        .eq('exchange_type', exchangeType)
        .gte('open_time', new Date(startDate).getTime())
        .lte('open_time', new Date(endDate).getTime())
        .order('open_time', { ascending: true })
        .range(from, from + batchSize - 1);

      if (batchError) {
        throw new Error(`Error fetching market data: ${batchError.message}`);
      }

      if (!batch || batch.length === 0) {
        hasMore = false;
      } else {
        allMarketData = allMarketData.concat(batch);
        console.log(`Fetched batch ${Math.floor(from / batchSize) + 1}: ${batch.length} candles (total: ${allMarketData.length})`);
        
        if (batch.length < batchSize) {
          hasMore = false;
        } else {
          from += batchSize;
        }
      }
    }

    let marketData = allMarketData;

    // Fallback to Binance data if selected exchange has no data
    if ((!marketData || marketData.length === 0) && exchangeType !== 'binance') {
      console.warn(`⚠️ No market data found for exchange type '${exchangeType}'. Attempting fallback to Binance data...`);
      
      // Try to fetch Binance data as fallback
      let binanceFallbackData: any[] = [];
      let fallbackFrom = 0;
      let fallbackHasMore = true;

      while (fallbackHasMore) {
        const { data: fallbackBatch, error: fallbackError } = await supabaseClient
          .from('market_data')
          .select('*')
          .eq('symbol', strategy.symbol)
          .eq('timeframe', strategy.timeframe)
          .eq('exchange_type', 'binance')
          .gte('open_time', new Date(startDate).getTime())
          .lte('open_time', new Date(endDate).getTime())
          .order('open_time', { ascending: true })
          .range(fallbackFrom, fallbackFrom + batchSize - 1);

        if (fallbackError) {
          console.error('Fallback fetch error:', fallbackError);
          fallbackHasMore = false;
        } else if (!fallbackBatch || fallbackBatch.length === 0) {
          fallbackHasMore = false;
        } else {
          binanceFallbackData = binanceFallbackData.concat(fallbackBatch);
          console.log(`Fetched Binance fallback batch: ${fallbackBatch.length} candles (total: ${binanceFallbackData.length})`);
          
          if (fallbackBatch.length < batchSize) {
            fallbackHasMore = false;
          } else {
            fallbackFrom += batchSize;
          }
        }
      }

      if (binanceFallbackData.length > 0) {
        marketData = binanceFallbackData;
        console.log(`✅ Using ${binanceFallbackData.length} candles from Binance as fallback data`);
      }
    }

    if (!marketData || marketData.length === 0) {
      throw new Error(`No market data found for ${strategy.symbol} on ${strategy.timeframe} timeframe for the specified period. Please ensure the exchange-websocket-monitor is running to collect data.`);
    }

    console.log(`Total candles fetched: ${marketData.length}`);

    console.log(`Found ${marketData.length} candles for backtesting`);

    // Convert to candles
    const candles: Candle[] = marketData.map(d => ({
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volume),
      open_time: d.open_time,
      close_time: d.close_time,
    }));

    // Pre-calculate all needed indicators
    const closePrices = candles.map(c => c.close);
    const indicatorCache: IndicatorCache = {};

    // Analyze conditions to determine which indicators to calculate
    const indicatorRequirements = new Set<string>();
    normalizedConditions.forEach((condition: any) => {
      const key1 = buildIndicatorKey(condition.indicator_type, condition);
      indicatorRequirements.add(key1);
      
      if (condition.indicator_type_2) {
        const key2 = buildIndicatorKey(condition.indicator_type_2, { 
          period_1: condition.period_2,
          deviation: condition.deviation,
          smoothing: condition.smoothing,
          multiplier: condition.multiplier,
          acceleration: condition.acceleration
        });
        indicatorRequirements.add(key2);
      }
    });

    console.log(`Pre-calculating ${indicatorRequirements.size} indicators...`);

    // Pre-calculate all required indicators
    indicatorRequirements.forEach((key) => {
      try {
        calculateAndCacheIndicator(key, candles, closePrices, indicatorCache);
      } catch (error) {
        console.warn(`Failed to calculate indicator ${key}:`, error);
      }
    });

    console.log(`Indicators cached, starting simulation...`);

    // Check if this is a 4h Reentry strategy
    const is4hReentry = strategy.strategy_type === '4h_reentry';
    
    if (is4hReentry) {
      console.log('Running 4h Reentry strategy backtest...');
      return await run4hReentryBacktest(
        strategy,
        candles,
        initialBalance,
        productType,
        leverage,
        makerFee,
        takerFee,
        slippage,
        executionTiming,
        supabaseClient,
        strategyId,
        startDate,
        endDate,
        corsHeaders
      );
    }


    // Check if this is SMA Crossover strategy
    const isSMACrossover = strategy.strategy_type === 'sma_crossover';
    
    if (isSMACrossover) {
      console.log('Running SMA 20/200 Crossover strategy backtest...');
      return await runSMACrossoverBacktest(
        strategy,
        candles,
        initialBalance,
        productType,
        leverage,
        makerFee,
        takerFee,
        slippage,
        executionTiming,
        supabaseClient,
        strategyId,
        startDate,
        endDate,
        corsHeaders
      );
    }

    // Check if this is ATH Guard Scalping strategy
    const isATHGuard = strategy.strategy_type === 'ath_guard_scalping';
    
    if (isATHGuard) {
      console.log('Running ATH Guard Mode (1-min Scalping) backtest...');
      return await runATHGuardBacktest(
        strategy,
        candles,
        initialBalance,
        productType,
        leverage,
        makerFee,
        takerFee,
        slippage,
        executionTiming,
        supabaseClient,
        strategyId,
        startDate,
        endDate,
        corsHeaders
      );
    }

    // Check if this is SMA 20/200 RSI strategy
    const isSMA20_200RSI = strategy.strategy_type === 'sma_20_200_rsi';
    
    if (isSMA20_200RSI) {
      console.log('Running SMA 20/200 RSI strategy backtest...');
      return await runSMACrossoverBacktest(
        strategy,
        candles,
        initialBalance,
        productType,
        leverage,
        makerFee,
        takerFee,
        slippage,
        executionTiming,
        supabaseClient,
        strategyId,
        startDate,
        endDate,
        corsHeaders
      );
    }

    // Check if this is MTF Momentum strategy
    const isMTFMomentum = strategy.strategy_type === 'mtf_momentum';
    
    if (isMTFMomentum) {
      console.log('Running MTF Momentum strategy backtest...');
      return await runMTFMomentumBacktest(
        strategy,
        candles,
        initialBalance,
        productType,
        leverage,
        makerFee,
        takerFee,
        slippage,
        executionTiming,
        supabaseClient,
        strategyId,
        startDate,
        endDate,
        corsHeaders
      );
    }

    // ✅ ПРАВИЛЬНО: Use enhanced backtest engine with exchange type support
    const backtestConfig = {
      initialBalance: initialBalance || strategy.initial_capital || 1000,
      stopLossPercent: stopLossPercent ?? strategy.stop_loss_percent,
      takeProfitPercent: takeProfitPercent ?? strategy.take_profit_percent,
      trailingStopPercent: trailingStopPercent, // New trailing stop feature
      productType,
      leverage,
      makerFee: exchangeMakerFee, // ✅ ПРАВИЛЬНО: Используем правильные комиссии
      takerFee: exchangeTakerFee, // ✅ ПРАВИЛЬНО: Используем правильные комиссии
      slippage,
      executionTiming,
      positionSizePercent: strategy.position_size_percent || 100,
      exchangeType: exchangeType // ✅ ПРАВИЛЬНО: Используем определенный тип биржи
    };

    console.log(`[ENHANCED] Using enhanced backtest engine with config:`, backtestConfig);

    // Initialize enhanced backtest engine
    const backtestEngine = new EnhancedBacktestEngine(candles, backtestConfig);

    // Run enhanced backtest with trailing stop support
    const results = backtestEngine.runBacktest(normalizedConditions, groups || []);

    console.log(`[ENHANCED] Backtest complete: ${results.total_trades} trades, ${results.win_rate.toFixed(1)}% win rate, PF: ${results.profit_factor.toFixed(2)}`);

    // Save backtest results
    const { error: insertError } = await supabaseClient
      .from('strategy_backtest_results')
      .insert({
        strategy_id: strategyId,
        start_date: startDate,
        end_date: endDate,
        initial_balance: results.initial_balance,
        final_balance: results.final_balance,
        total_return: results.total_return,
        total_trades: results.total_trades,
        winning_trades: results.winning_trades,
        losing_trades: results.losing_trades,
        win_rate: results.win_rate,
        max_drawdown: results.max_drawdown,
      });

    if (insertError) {
      console.error('Error saving backtest results:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: {
          initial_balance: results.initial_balance,
          final_balance: results.final_balance,
          total_return: results.total_return,
          total_trades: results.total_trades,
          winning_trades: results.winning_trades,
          losing_trades: results.losing_trades,
          win_rate: results.win_rate,
          max_drawdown: results.max_drawdown,
          profit_factor: results.profit_factor,
          avg_win: results.avg_win,
          avg_loss: results.avg_loss,
          balance_history: results.balance_history,
          trades: results.trades,
          config: {
            product_type: productType,
            leverage,
            maker_fee: makerFee,
            taker_fee: takerFee,
            slippage,
            execution_timing: executionTiming,
            trailing_stop_percent: trailingStopPercent // New trailing stop info
          }
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error running backtest:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function buildIndicatorKey(indicatorType: string, params: any): string {
  const parts = [indicatorType];
  if (params.period_1) parts.push(`p${params.period_1}`);
  if (params.period_2) parts.push(`p2${params.period_2}`);
  if (params.deviation) parts.push(`d${params.deviation}`);
  if (params.smoothing) parts.push(`s${params.smoothing}`);
  if (params.multiplier) parts.push(`m${params.multiplier}`);
  if (params.acceleration) parts.push(`a${params.acceleration}`);
  return parts.join('_');
}

function calculateAndCacheIndicator(
  key: string,
  candles: Candle[],
  closePrices: number[],
  cache: IndicatorCache
): void {
  if (cache[key]) return; // Already calculated

  const parts = key.split('_');
  const type = parts[0];
  const params: any = {};
  
  parts.slice(1).forEach(part => {
    const prefix = part[0];
    const value = parseFloat(part.slice(1));
    if (prefix === 'p') params.period = value;
    if (prefix === 'd') params.deviation = value;
    if (prefix === 's') params.smoothing = value;
    if (prefix === 'm') params.multiplier = value;
    if (prefix === 'a') params.acceleration = value;
  });

  const period = params.period || 14;

  try {
    switch (type.toLowerCase()) {
      // Moving Averages
      case 'sma':
        cache[key] = indicators.calculateSMA(closePrices, period);
        break;
      case 'ema':
        cache[key] = indicators.calculateEMA(closePrices, period);
        break;
      case 'wma':
        cache[key] = indicators.calculateWMA(closePrices, period);
        break;
      case 'dema':
        cache[key] = indicators.calculateDEMA(closePrices, period);
        break;
      case 'tema':
        cache[key] = indicators.calculateTEMA(closePrices, period);
        break;
      case 'hull_ma':
        cache[key] = indicators.calculateHullMA(closePrices, period);
        break;
      case 'vwma':
        cache[key] = indicators.calculateVWMA(candles, period);
        break;

      // Oscillators
      case 'rsi':
        cache[key] = indicators.calculateRSI(closePrices, period);
        break;
      case 'stochastic':
      case 'stoch':
        const stoch = indicators.calculateStochastic(candles, period, params.smoothing || 3, 3);
        cache[key] = { k: stoch.k, d: stoch.d };
        break;
      case 'cci':
        cache[key] = indicators.calculateCCI(candles, period);
        break;
      case 'wpr':
        cache[key] = indicators.calculateWPR(candles, period);
        break;
      case 'mfi':
        cache[key] = indicators.calculateMFI(candles, period);
        break;
      case 'stochrsi':
      case 'stoch_rsi':
        cache[key] = indicators.calculateStochRSI(closePrices, period, 14);
        break;
      case 'momentum':
        cache[key] = indicators.calculateMomentum(closePrices, period);
        break;
      case 'roc':
        cache[key] = indicators.calculateROC(closePrices, period);
        break;
      case 'kdj_j':
        const kdj = indicators.calculateKDJ(candles, period, params.smoothing || 3, 3);
        cache[key] = { k: kdj.k, d: kdj.d, j: kdj.j };
        break;

      // Volume Indicators
      case 'obv':
        cache[key] = indicators.calculateOBV(candles);
        break;
      case 'ad_line':
        cache[key] = indicators.calculateADLine(candles);
        break;
      case 'cmf':
        cache[key] = indicators.calculateCMF(candles, period);
        break;
      case 'vwap':
        cache[key] = indicators.calculateVWAP(candles);
        break;
      case 'anchored_vwap':
        cache[key] = indicators.calculateAnchoredVWAP(candles, params.anchor || 0);
        break;

      // Trend Indicators
      case 'macd':
        const macd = indicators.calculateMACD(closePrices, 12, 26, 9);
        cache[key] = { macd: macd.macd, signal: macd.signal, histogram: macd.histogram };
        break;
      case 'adx':
        const adx = indicators.calculateADX(candles, period);
        cache[key] = { adx: adx.adx, plusDI: adx.plusDI, minusDI: adx.minusDI };
        break;
      case 'psar':
        cache[key] = indicators.calculateParabolicSAR(candles, params.acceleration || 0.02, 0.2);
        break;
      case 'supertrend':
        const st = indicators.calculateSuperTrend(candles, period, params.multiplier || 3);
        cache[key] = { trend: st.trend, direction: st.direction };
        break;
      case 'ema_crossover':
        const shortEMA = indicators.calculateEMA(closePrices, period);
        const longEMA = indicators.calculateEMA(closePrices, params.period2 || 21);
        cache[key] = indicators.detectEMACrossover(shortEMA, longEMA);
        break;
      case 'ichimoku_tenkan':
      case 'ichimoku_kijun':
      case 'ichimoku_senkou_a':
      case 'ichimoku_senkou_b':
      case 'ichimoku_chikou':
        const ichimoku = indicators.calculateIchimoku(candles, 9, 26, 52);
        cache['ichimoku_tenkan'] = ichimoku.tenkan;
        cache['ichimoku_kijun'] = ichimoku.kijun;
        cache['ichimoku_senkou_a'] = ichimoku.senkouA;
        cache['ichimoku_senkou_b'] = ichimoku.senkouB;
        cache['ichimoku_chikou'] = ichimoku.chikou;
        cache[key] = cache[type.toLowerCase()];
        break;

      // Volatility Indicators
      case 'atr':
        cache[key] = indicators.calculateATR(candles, period);
        break;
      case 'bollinger_bands':
        const bb = indicators.calculateBollingerBands(closePrices, period, params.deviation || 2);
        cache[key] = { upper: bb.upper, middle: bb.middle, lower: bb.lower };
        break;
      case 'bb_width':
        const bbw = indicators.calculateBollingerBands(closePrices, period, params.deviation || 2);
        cache[key] = indicators.calculateBollingerWidth(bbw.upper, bbw.lower);
        break;
      case 'percent_b':
        const bbp = indicators.calculateBollingerBands(closePrices, period, params.deviation || 2);
        cache[key] = indicators.calculatePercentB(closePrices, bbp.upper, bbp.lower);
        break;
      case 'td_sequential':
        const td = indicators.calculateTDSequential(candles);
        cache[key] = { setup: td.setup, countdown: td.countdown };
        break;

      // Price/Volume (simple cases)
      case 'price':
        cache[key] = closePrices;
        break;
      case 'volume':
        cache[key] = candles.map(c => c.volume);
        break;

      default:
        console.warn(`Unsupported indicator type: ${type}`);
        cache[key] = new Array(closePrices.length).fill(NaN);
    }
  } catch (error) {
    console.error(`Error calculating ${key}:`, error);
    cache[key] = new Array(closePrices.length).fill(NaN);
  }
}

function getIndicatorValue(
  indicatorType: string,
  params: any,
  indicatorCache: IndicatorCache,
  currentIndex: number,
  candles: Candle[]
): number | null {
  const key = buildIndicatorKey(indicatorType, params);
  const cached = indicatorCache[key];

  if (!cached) {
    console.warn(`Indicator ${key} not found in cache`);
    return null;
  }

  // Handle complex indicators that return objects
  if (typeof cached === 'object' && !Array.isArray(cached)) {
    // For MACD, Stochastic, ADX, Bollinger Bands, KDJ, SuperTrend, TD Sequential
    if ('macd' in cached) return (cached.macd as number[])[currentIndex] ?? null;
    if ('k' in cached && indicatorType.includes('stoch')) return (cached.k as number[])[currentIndex] ?? null;
    if ('j' in cached && indicatorType.includes('kdj')) return (cached.j as number[])[currentIndex] ?? null;
    if ('adx' in cached) return (cached.adx as number[])[currentIndex] ?? null;
    if ('upper' in cached && indicatorType.includes('bollinger')) return (cached.upper as number[])[currentIndex] ?? null;
    if ('trend' in cached && indicatorType.includes('supertrend')) return (cached.trend as number[])[currentIndex] ?? null;
    if ('setup' in cached && indicatorType.includes('td')) return (cached.setup as number[])[currentIndex] ?? null;
    return null;
  }

  // Handle simple array indicators
  if (Array.isArray(cached)) {
    const value = cached[currentIndex];
    return (value !== undefined && !isNaN(value)) ? value : null;
  }

  return null;
}

function checkConditions(
  conditions: any[],
  conditionGroups: any[],
  candles: Candle[],
  indicatorCache: IndicatorCache,
  currentIndex: number,
  orderType: string
): boolean {
  if (!conditions || conditions.length === 0) return false;

  const relevantConditions = conditions.filter(c => c.order_type === orderType);
  if (relevantConditions.length === 0) return false;

  // Group conditions by group_id
  const groupedConditions: { [groupId: string]: any[] } = {};
  const ungroupedConditions: any[] = [];

  relevantConditions.forEach(condition => {
    if (condition.group_id) {
      if (!groupedConditions[condition.group_id]) {
        groupedConditions[condition.group_id] = [];
      }
      groupedConditions[condition.group_id].push(condition);
    } else {
      ungroupedConditions.push(condition);
    }
  });

  // Evaluate each group
  const groupResults: boolean[] = [];

  // Evaluate ungrouped conditions (AND logic by default)
  if (ungroupedConditions.length > 0) {
    const result = ungroupedConditions.every(condition => 
      evaluateCondition(condition, candles, indicatorCache, currentIndex)
    );
    groupResults.push(result);
  }

  // Evaluate grouped conditions
  Object.entries(groupedConditions).forEach(([groupId, groupConditions]) => {
    const group = conditionGroups.find(g => g.id === groupId);
    const groupOperator = group?.group_operator || 'AND';

    let result: boolean;
    if (groupOperator === 'OR') {
      result = groupConditions.some(condition => 
        evaluateCondition(condition, candles, indicatorCache, currentIndex)
      );
    } else {
      result = groupConditions.every(condition => 
        evaluateCondition(condition, candles, indicatorCache, currentIndex)
      );
    }

    groupResults.push(result);
  });

  // All groups must be satisfied (AND logic between groups)
  return groupResults.every(result => result);
}

function evaluateCondition(
  condition: any,
  candles: Candle[],
  indicatorCache: IndicatorCache,
  currentIndex: number
): boolean {
  const { indicator_type, operator, value, value2, period_1, period_2, indicator_type_2, 
          deviation, smoothing, multiplier, acceleration, lookback_bars } = condition;

  const params1 = { period_1, deviation, smoothing, multiplier, acceleration };
  const params2 = { period_1: period_2, deviation, smoothing, multiplier, acceleration };

  // Get current and previous indicator values
  const currentValue = getIndicatorValue(indicator_type, params1, indicatorCache, currentIndex, candles);
  const previousValue = currentIndex > 0 
    ? getIndicatorValue(indicator_type, params1, indicatorCache, currentIndex - 1, candles)
    : null;

  if (currentValue === null) {
    console.warn(`No value for ${indicator_type} at index ${currentIndex}`);
    return false;
  }

  // Handle indicator comparison
  if (operator === 'indicator_comparison' && indicator_type_2) {
    const compareValue = getIndicatorValue(indicator_type_2, params2, indicatorCache, currentIndex, candles);
    if (compareValue === null) return false;
    return currentValue > compareValue;
  }

  // Handle value-based operators
  switch (operator) {
    case 'greater_than':
      return currentValue > value;
    
    case 'less_than':
      return currentValue < value;
    
    case 'equals':
      return Math.abs(currentValue - value) < 0.01;
    
    case 'between':
      return value2 !== null && currentValue >= value && currentValue <= value2;
    
    case 'crosses_above':
      if (indicator_type_2) {
        const prevCompare = currentIndex > 0 
          ? getIndicatorValue(indicator_type_2, params2, indicatorCache, currentIndex - 1, candles)
          : null;
        const currCompare = getIndicatorValue(indicator_type_2, params2, indicatorCache, currentIndex, candles);
        return previousValue !== null && prevCompare !== null && currCompare !== null &&
               previousValue <= prevCompare && currentValue > currCompare;
      } else {
        return previousValue !== null && previousValue <= value && currentValue > value;
      }
    
    case 'crosses_below':
      if (indicator_type_2) {
        const prevCompare = currentIndex > 0 
          ? getIndicatorValue(indicator_type_2, params2, indicatorCache, currentIndex - 1, candles)
          : null;
        const currCompare = getIndicatorValue(indicator_type_2, params2, indicatorCache, currentIndex, candles);
        return previousValue !== null && prevCompare !== null && currCompare !== null &&
               previousValue >= prevCompare && currentValue < currCompare;
      } else {
        return previousValue !== null && previousValue >= value && currentValue < value;
      }
    
    case 'breakout_above':
      const lookback = lookback_bars || 10;
      if (currentIndex < lookback) return false;
      const recentHighs = candles.slice(currentIndex - lookback, currentIndex).map(c => c.high);
      const maxHigh = Math.max(...recentHighs);
      return currentValue > maxHigh;
    
    case 'breakout_below':
      const lookbackLow = lookback_bars || 10;
      if (currentIndex < lookbackLow) return false;
      const recentLows = candles.slice(currentIndex - lookbackLow, currentIndex).map(c => c.low);
      const minLow = Math.min(...recentLows);
      return currentValue < minLow;
    
    default:
      console.warn(`Unsupported operator: ${operator}`);
      return false;
  }
}

// ============= SMA CROSSOVER STRATEGY IMPLEMENTATION =============
async function runSMACrossoverBacktest(
  strategy: any,
  candles: Candle[],
  initialBalance: number,
  productType: string,
  leverage: number,
  makerFee: number,
  takerFee: number,
  slippage: number,
  executionTiming: string,
  supabaseClient: any,
  strategyId: string,
  startDate: string,
  endDate: string,
  corsHeaders: any
) {
  console.log('Initializing SMA Crossover backtest...');
  
  let balance = initialBalance || strategy.initial_capital || 10000;
  let availableBalance = balance;
  let lockedMargin = 0;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [{ time: candles[0].open_time, balance }];

  // Exchange constraints
  const stepSize = 0.00001;
  const minQty = 0.001;
  const minNotional = 10;

  // Strategy configuration
  const config = {
    sma_fast_period: strategy.sma_fast_period || 20,
    sma_slow_period: strategy.sma_slow_period || 200,
    rsi_period: strategy.rsi_period || 14,
    rsi_overbought: strategy.rsi_overbought || 70,
    rsi_oversold: strategy.rsi_oversold || 30,
    volume_multiplier: strategy.volume_multiplier || 1.2,
    atr_sl_multiplier: strategy.atr_sl_multiplier || 2.0,
    atr_tp_multiplier: strategy.atr_tp_multiplier || 3.0
  };

  console.log(`Processing ${candles.length} candles for SMA Crossover strategy...`);
  console.log(`Strategy config:`, config);

  for (let i = Math.max(config.sma_slow_period, config.rsi_period); i < candles.length; i++) {
    const currentCandle = candles[i];
    const currentPrice = currentCandle.close;
    const currentTime = currentCandle.open_time;
    
    // Convert candles to the format expected by the strategy
    const strategyCandles = candles.slice(0, i + 1).map(c => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      timestamp: c.open_time
    }));

    // Evaluate strategy
    const signal = evaluateSMACrossoverStrategy(strategyCandles, config, position !== null);
    
    if (signal.signal_type === 'BUY' && !position) {
      // Calculate position size
      const positionSize = Math.min(availableBalance * 0.95, balance * 0.1); // Max 10% of balance
      const quantity = Math.floor(positionSize / currentPrice / stepSize) * stepSize;
      
      if (quantity >= minQty && quantity * currentPrice >= minNotional) {
        const entryPrice = currentPrice * (1 + slippage);
        const marginRequired = (entryPrice * quantity) / leverage;
        
        if (marginRequired <= availableBalance) {
          position = {
            entry_price: entryPrice,
            entry_time: currentTime,
            type: 'buy',
            quantity: quantity
          };
          
          availableBalance -= marginRequired;
          lockedMargin += marginRequired;
          
          console.log(`[${i}] BUY at ${entryPrice.toFixed(2)} - Qty: ${quantity.toFixed(6)}, Margin: ${marginRequired.toFixed(2)}`);
        }
      }
    }
    
    if (signal.signal_type === 'SELL' && position) {
      const exitPrice = currentPrice * (1 - slippage);
      const profit = (exitPrice - position.entry_price) * position.quantity;
      const fees = (position.entry_price * position.quantity * makerFee) + (exitPrice * position.quantity * takerFee);
      const netProfit = profit - fees;
      
      balance += netProfit;
      availableBalance += lockedMargin + netProfit;
      lockedMargin = 0;
      
      position.exit_price = exitPrice;
      position.exit_time = currentTime;
      position.profit = netProfit;
      
      trades.push(position);
      position = null;
      
      console.log(`[${i}] SELL at ${exitPrice.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
    }
    
    // Update balance history
    const currentBalance = balance + (position ? (currentPrice - position.entry_price) * position.quantity : 0);
    balanceHistory.push({ time: currentTime, balance: currentBalance });
    
    // Update max balance and drawdown
    if (currentBalance > maxBalance) {
      maxBalance = currentBalance;
    }
    const currentDrawdown = ((maxBalance - currentBalance) / maxBalance) * 100;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
  }

  // Close any remaining position
  if (position) {
    const finalCandle = candles[candles.length - 1];
    const exitPrice = finalCandle.close * (1 - slippage);
    const profit = (exitPrice - position.entry_price) * position.quantity;
    const fees = (position.entry_price * position.quantity * makerFee) + (exitPrice * position.quantity * takerFee);
    const netProfit = profit - fees;
    
    balance += netProfit;
    availableBalance += lockedMargin + netProfit;
    
    position.exit_price = exitPrice;
    position.exit_time = finalCandle.close_time;
    position.profit = netProfit;
    
    trades.push(position);
    
    console.log(`Final SELL at ${exitPrice.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Final Balance: ${balance.toFixed(2)}`);
  }

  // Calculate performance metrics
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winTrades = trades.filter(t => (t.profit || 0) > 0).length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const avgWin = trades.filter(t => (t.profit || 0) > 0).reduce((sum, t) => sum + (t.profit || 0), 0) / Math.max(winTrades, 1);
  const avgLoss = trades.filter(t => (t.profit || 0) < 0).reduce((sum, t) => sum + (t.profit || 0), 0) / Math.max(totalTrades - winTrades, 1);
  const profitFactor = Math.abs(avgWin * winTrades) / Math.abs(avgLoss * (totalTrades - winTrades));

  console.log(`SMA Crossover Backtest Results:`);
  console.log(`- Total Return: ${totalReturn.toFixed(2)}%`);
  console.log(`- Total Trades: ${totalTrades}`);
  console.log(`- Win Rate: ${winRate.toFixed(2)}%`);
  console.log(`- Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`- Profit Factor: ${profitFactor.toFixed(2)}`);

  // Save results to database
  const { error } = await supabaseClient
    .from('strategy_backtest_results')
    .insert({
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_balance: initialBalance,
      final_balance: balance,
      total_return: totalReturn,
      total_trades: totalTrades,
      win_rate: winRate,
      max_drawdown: maxDrawdown,
      profit_factor: profitFactor,
      trades: trades,
      balance_history: balanceHistory
    });

  if (error) {
    console.error('Error saving backtest results:', error);
  }

  return new Response(
    JSON.stringify({
      success: true,
      results: {
        initialBalance,
        finalBalance: balance,
        totalReturn,
        totalTrades,
        winRate,
        maxDrawdown,
        profitFactor,
        trades,
        balanceHistory
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ============= MTF MOMENTUM STRATEGY IMPLEMENTATION =============
async function runMTFMomentumBacktest(
  strategy: any,
  candles: Candle[],
  initialBalance: number,
  productType: string,
  leverage: number,
  makerFee: number,
  takerFee: number,
  slippage: number,
  executionTiming: string,
  supabaseClient: any,
  strategyId: string,
  startDate: string,
  endDate: string,
  corsHeaders: any
) {
  console.log('Initializing MTF Momentum backtest...');
  
  let balance = initialBalance || strategy.initial_capital || 10000;
  let availableBalance = balance;
  let lockedMargin = 0;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [{ time: candles[0].open_time, balance }];

  // Exchange constraints
  const stepSize = 0.00001;
  const minQty = 0.001;
  const minNotional = 10;

  // Strategy configuration
  const config = {
    mtf_rsi_period: strategy.mtf_rsi_period || 14,
    mtf_rsi_entry_threshold: strategy.mtf_rsi_entry_threshold || 55,
    mtf_macd_fast: strategy.mtf_macd_fast || 12,
    mtf_macd_slow: strategy.mtf_macd_slow || 26,
    mtf_macd_signal: strategy.mtf_macd_signal || 9,
    mtf_volume_multiplier: strategy.mtf_volume_multiplier || 1.2
  };

  console.log(`Processing ${candles.length} candles for MTF Momentum strategy...`);
  console.log(`Strategy config:`, config);

  // Get multi-timeframe data (1m, 5m, 15m)
  const candles1m = candles; // Assuming input is 1m
  const candles5m = resampleCandles(candles, '5m');
  const candles15m = resampleCandles(candles, '15m');

  for (let i = Math.max(config.mtf_rsi_period, config.mtf_macd_slow); i < candles.length; i++) {
    const currentCandle = candles[i];
    const currentPrice = currentCandle.close;
    const currentTime = currentCandle.open_time;
    
    // Convert candles to the format expected by the strategy
    const strategyCandles1m = candles1m.slice(0, i + 1).map(c => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      timestamp: c.open_time
    }));

    const strategyCandles5m = candles5m.slice(0, Math.floor(i / 5) + 1).map(c => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      timestamp: c.open_time
    }));

    const strategyCandles15m = candles15m.slice(0, Math.floor(i / 15) + 1).map(c => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      timestamp: c.open_time
    }));

    // Evaluate MTF Momentum strategy
    const signal = evaluateMTFMomentum(
      strategyCandles1m,
      strategyCandles5m,
      strategyCandles15m,
      config,
      position !== null
    );
    
    if (signal.signal_type === 'BUY' && !position) {
      // Calculate position size
      const positionSize = Math.min(availableBalance * 0.95, balance * 0.1); // Max 10% of balance
      const quantity = Math.floor(positionSize / currentPrice / stepSize) * stepSize;
      
      if (quantity >= minQty && quantity * currentPrice >= minNotional) {
        const entryPrice = currentPrice * (1 + slippage);
        const marginRequired = (entryPrice * quantity) / leverage;
        
        if (marginRequired <= availableBalance) {
          position = {
            entry_price: entryPrice,
            entry_time: currentTime,
            type: 'buy',
            quantity: quantity
          };
          
          availableBalance -= marginRequired;
          lockedMargin += marginRequired;
          
          console.log(`[${i}] BUY at ${entryPrice.toFixed(2)} - Qty: ${quantity.toFixed(6)}, Margin: ${marginRequired.toFixed(2)}`);
        }
      }
    }
    
    if (signal.signal_type === 'SELL' && position) {
      const exitPrice = currentPrice * (1 - slippage);
      const pnl = position.quantity * (exitPrice - position.entry_price);
      const exitFee = (exitPrice * position.quantity * takerFee) / 100;
      const netProfit = pnl - exitFee;
      
      balance += netProfit;
      availableBalance += lockedMargin + netProfit;
      lockedMargin = 0;
      
      position.exit_price = exitPrice;
      position.exit_time = currentTime;
      position.profit = netProfit;
      
      trades.push(position);
      position = null;
      
      console.log(`[${i}] SELL at ${exitPrice.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
    }

    // Update balance tracking
    balance = availableBalance + lockedMargin;
    balanceHistory.push({ time: currentTime, balance });
    
    if (balance > maxBalance) maxBalance = balance;
    maxDrawdown = Math.max(maxDrawdown, ((maxBalance - balance) / maxBalance) * 100);
  }

  // Close any remaining position
  if (position) {
    const finalCandle = candles[candles.length - 1];
    const exitPrice = finalCandle.close * (1 - slippage);
    const pnl = position.quantity * (exitPrice - position.entry_price);
    const exitFee = (exitPrice * position.quantity * takerFee) / 100;
    const netProfit = pnl - exitFee;
    
    balance += netProfit;
    availableBalance += lockedMargin + netProfit;
    
    position.exit_price = exitPrice;
    position.exit_time = finalCandle.close_time;
    position.profit = netProfit;
    
    trades.push(position);
    
    console.log(`Final SELL at ${exitPrice.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Final Balance: ${balance.toFixed(2)}`);
  }

  // Calculate performance metrics
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winTrades = trades.filter(t => (t.profit || 0) > 0).length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const avgWin = trades.filter(t => (t.profit || 0) > 0).reduce((sum, t) => sum + (t.profit || 0), 0) / Math.max(winTrades, 1);
  const avgLoss = trades.filter(t => (t.profit || 0) < 0).reduce((sum, t) => sum + (t.profit || 0), 0) / Math.max(totalTrades - winTrades, 1);
  const profitFactor = Math.abs(avgWin * winTrades) / Math.abs(avgLoss * (totalTrades - winTrades));

  console.log(`MTF Momentum Backtest Results:`);
  console.log(`- Total Return: ${totalReturn.toFixed(2)}%`);
  console.log(`- Total Trades: ${totalTrades}`);
  console.log(`- Win Rate: ${winRate.toFixed(2)}%`);
  console.log(`- Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`- Profit Factor: ${profitFactor.toFixed(2)}`);

  // Save results to database
  const { error } = await supabaseClient
    .from('strategy_backtest_results')
    .insert({
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_balance: initialBalance,
      final_balance: balance,
      total_return: totalReturn,
      total_trades: totalTrades,
      winning_trades: winTrades,
      losing_trades: totalTrades - winTrades,
      win_rate: winRate,
      max_drawdown: maxDrawdown,
      profit_factor: profitFactor,
      balance_history: balanceHistory,
      trades: trades
    });

  if (error) {
    console.error('Error saving MTF Momentum backtest results:', error);
  }

  return new Response(
    JSON.stringify({
      success: true,
      results: {
        initial_balance: initialBalance,
        final_balance: balance,
        total_return: totalReturn,
        total_trades: totalTrades,
        winning_trades: winTrades,
        losing_trades: totalTrades - winTrades,
        win_rate: winRate,
        max_drawdown: maxDrawdown,
        profit_factor: profitFactor,
        balance_history: balanceHistory,
        trades: trades
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Helper function to resample candles to different timeframes
function resampleCandles(candles: Candle[], timeframe: string): Candle[] {
  const interval = timeframe === '5m' ? 5 : timeframe === '15m' ? 15 : 1;
  const resampled: Candle[] = [];
  
  for (let i = 0; i < candles.length; i += interval) {
    const chunk = candles.slice(i, i + interval);
    if (chunk.length === 0) break;
    
    const resampledCandle: Candle = {
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      open_time: chunk[0].open_time,
      close_time: chunk[chunk.length - 1].close_time
    };
    
    resampled.push(resampledCandle);
  }
  
  return resampled;
}

// MTF Momentum strategy evaluation
function evaluateMTFMomentum(
  candles1m: any[],
  candles5m: any[],
  candles15m: any[],
  config: any,
  hasPosition: boolean
): { signal_type: 'BUY' | 'SELL' | 'HOLD'; confidence: number } {
  if (candles1m.length < config.mtf_rsi_period || candles5m.length < config.mtf_rsi_period || candles15m.length < config.mtf_rsi_period) {
    return { signal_type: 'HOLD', confidence: 0 };
  }

  // Calculate RSI for all timeframes
  const rsi1m = calculateRSI(candles1m.map(c => c.close), config.mtf_rsi_period);
  const rsi5m = calculateRSI(candles5m.map(c => c.close), config.mtf_rsi_period);
  const rsi15m = calculateRSI(candles15m.map(c => c.close), config.mtf_rsi_period);

  // Calculate MACD for all timeframes
  const macd1m = calculateMACDCustom(candles1m.map(c => c.close), config.mtf_macd_fast, config.mtf_macd_slow, config.mtf_macd_signal);
  const macd5m = calculateMACDCustom(candles5m.map(c => c.close), config.mtf_macd_fast, config.mtf_macd_slow, config.mtf_macd_signal);
  const macd15m = calculateMACDCustom(candles15m.map(c => c.close), config.mtf_macd_fast, config.mtf_macd_slow, config.mtf_macd_signal);

  // Calculate volume confirmation
  const volume1m = candles1m.slice(-20).map(c => c.volume);
  const avgVolume = volume1m.reduce((sum, v) => sum + v, 0) / volume1m.length;
  const currentVolume = candles1m[candles1m.length - 1].volume;
  const volumeConfirmation = currentVolume > (avgVolume * config.mtf_volume_multiplier);

  // Get current values
  const currentRsi1m = rsi1m[rsi1m.length - 1];
  const currentRsi5m = rsi5m[rsi5m.length - 1];
  const currentRsi15m = rsi15m[rsi15m.length - 1];
  const currentMacd1m = macd1m.macd[macd1m.macd.length - 1];
  const currentMacd5m = macd5m.macd[macd5m.macd.length - 1];
  const currentMacd15m = macd15m.macd[macd15m.macd.length - 1];
  const currentSignal1m = macd1m.signal[macd1m.signal.length - 1];
  const currentSignal5m = macd5m.signal[macd5m.signal.length - 1];
  const currentSignal15m = macd15m.signal[macd15m.signal.length - 1];

  // Check for NaN values
  if (isNaN(currentRsi1m) || isNaN(currentRsi5m) || isNaN(currentRsi15m) ||
      isNaN(currentMacd1m) || isNaN(currentMacd5m) || isNaN(currentMacd15m) ||
      isNaN(currentSignal1m) || isNaN(currentSignal5m) || isNaN(currentSignal15m)) {
    return { signal_type: 'HOLD', confidence: 0 };
  }

  // Multi-timeframe momentum conditions
  const rsiThreshold = config.mtf_rsi_entry_threshold;
  const rsiShortThreshold = 100 - rsiThreshold;

  // Long conditions: All timeframes bullish
  const longRsi = currentRsi1m > rsiThreshold && currentRsi5m > rsiThreshold && currentRsi15m > rsiThreshold;
  const longMacd = currentMacd1m > currentSignal1m && currentMacd5m > currentSignal5m && currentMacd15m > currentSignal15m;
  const longMomentum = currentMacd1m > 0 && currentMacd5m > 0 && currentMacd15m > 0;

  // Short conditions: All timeframes bearish
  const shortRsi = currentRsi1m < rsiShortThreshold && currentRsi5m < rsiShortThreshold && currentRsi15m < rsiShortThreshold;
  const shortMacd = currentMacd1m < currentSignal1m && currentMacd5m < currentSignal5m && currentMacd15m < currentSignal15m;
  const shortMomentum = currentMacd1m < 0 && currentMacd5m < 0 && currentMacd15m < 0;

  // Exit conditions
  const exitLong = currentRsi1m < 50 || currentMacd1m < currentSignal1m;
  const exitShort = currentRsi1m > 50 || currentMacd1m > currentSignal1m;

  if (hasPosition) {
    if (exitLong || exitShort) {
      return { signal_type: 'SELL', confidence: 0.8 };
    }
    return { signal_type: 'HOLD', confidence: 0.5 };
  }

  // Entry signals
  if (longRsi && longMacd && longMomentum && volumeConfirmation) {
    return { signal_type: 'BUY', confidence: 0.9 };
  }

  if (shortRsi && shortMacd && shortMomentum && volumeConfirmation) {
    return { signal_type: 'BUY', confidence: 0.9 };
  }

  return { signal_type: 'HOLD', confidence: 0.3 };
}

// Helper functions for MTF Momentum (with custom parameters)
function calculateMACDCustom(prices: number[], fastPeriod: number, slowPeriod: number, signalPeriod: number): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = calculateEMACustom(prices, fastPeriod);
  const emaSlow = calculateEMACustom(prices, slowPeriod);
  
  const macd: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macd[i] = emaFast[i] - emaSlow[i];
  }
  
  const signal = calculateEMACustom(macd, signalPeriod);
  const histogram: number[] = [];
  
  for (let i = 0; i < macd.length; i++) {
    histogram[i] = macd[i] - signal[i];
  }
  
  return { macd, signal, histogram };
}

function calculateEMACustom(prices: number[], period: number): number[] {
  if (prices.length < period) return new Array(prices.length).fill(NaN);
  
  const ema: number[] = new Array(prices.length).fill(NaN);
  const multiplier = 2 / (period + 1);
  
  ema[period - 1] = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
  }
  
  return ema;
}

// ============= MSTG (Multi-Strategy Trading Grid) IMPLEMENTATION =============
async function runMSTGBacktest(
  strategy: any,
  candles: Candle[],
  initialBalance: number,
  productType: string,
  leverage: number,
  makerFee: number,
  takerFee: number,
  slippage: number,
  executionTiming: string,
  supabaseClient: any,
  strategyId: string,
  startDate: string,
  endDate: string,
  corsHeaders: any
) {
  const benchmarkSymbol = strategy.mstg_benchmark_symbol || 'BTCUSDT';
  console.log(`[MSTG] Starting MSTG backtest for ${strategy.symbol} vs ${benchmarkSymbol}`);
  
  // Fetch benchmark data (fetch ALL candles)
  let allBenchmarkData: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error: batchError } = await supabaseClient
      .from('market_data')
      .select('*')
      .eq('symbol', benchmarkSymbol)
      .eq('timeframe', strategy.timeframe)
      .gte('open_time', new Date(startDate).getTime())
      .lte('open_time', new Date(endDate).getTime())
      .order('open_time', { ascending: true })
      .range(from, from + batchSize - 1);

    if (batchError) {
      console.warn('Error fetching benchmark batch:', batchError);
      break;
    }

    if (!batch || batch.length === 0) {
      hasMore = false;
    } else {
      allBenchmarkData = allBenchmarkData.concat(batch);
      if (batch.length < batchSize) {
        hasMore = false;
      } else {
        from += batchSize;
      }
    }
  }

  const benchmarkData = allBenchmarkData;

  if (!benchmarkData || benchmarkData.length === 0) {
    console.warn('No benchmark data found, using asset itself as benchmark');
  } else {
    console.log(`Fetched ${benchmarkData.length} benchmark candles`);
  }

  const benchmarkCandles: Candle[] = benchmarkData ? benchmarkData.map((d: any) => ({
    open: parseFloat(d.open),
    high: parseFloat(d.high),
    low: parseFloat(d.low),
    close: parseFloat(d.close),
    volume: parseFloat(d.volume),
    open_time: d.open_time,
    close_time: d.close_time,
  })) : candles;

  // Calculate MSTG components
  const closes = candles.map(c => c.close);
  
  console.log(`[MSTG Debug] Starting indicator calculations for ${closes.length} candles`);
  console.log(`[MSTG Debug] Asset: ${strategy.symbol}, Benchmark: ${benchmarkSymbol}`);
  console.log(`[MSTG Debug] Price range: ${Math.min(...closes).toFixed(2)} to ${Math.max(...closes).toFixed(2)}`);
  
  // 1. Momentum Score (M) - Normalized RSI
  const rsi = indicators.calculateRSI(closes, 14);
  const momentum = indicators.normalizeRSI(rsi);
  const validMomentum = momentum.filter(v => !isNaN(v));
  console.log(`[MSTG Debug] Momentum: ${validMomentum.length} valid values, range: ${validMomentum.length > 0 ? `${Math.min(...validMomentum).toFixed(2)} to ${Math.max(...validMomentum).toFixed(2)}` : 'N/A'}`);
  
  // 2. Trend Direction Score (T) - EMA10 vs EMA21
  const trendScore = indicators.calculateTrendScore(closes);
  const validTrend = trendScore.filter(v => !isNaN(v));
  console.log(`[MSTG Debug] Trend Score: ${validTrend.length} valid values, range: ${validTrend.length > 0 ? `${Math.min(...validTrend).toFixed(2)} to ${Math.max(...validTrend).toFixed(2)}` : 'N/A'}`);
  
  // 3. Volatility Position Score (V) - Bollinger Band position
  const bbPosition = indicators.calculateBollingerPosition(candles, 20);
  const validBB = bbPosition.filter(v => !isNaN(v));
  console.log(`[MSTG Debug] BB Position: ${validBB.length} valid values, range: ${validBB.length > 0 ? `${Math.min(...validBB).toFixed(2)} to ${Math.max(...validBB).toFixed(2)}` : 'N/A'}`);
  
  // 4. Relative Strength Score (R) - Asset vs Benchmark
  const relativeStrength = indicators.calculateBenchmarkRelativeStrength(
    candles,
    benchmarkCandles,
    14
  );
  const validRS = relativeStrength.filter(v => !isNaN(v));
  console.log(`[MSTG Debug] Relative Strength: ${validRS.length} valid values, range: ${validRS.length > 0 ? `${Math.min(...validRS).toFixed(2)} to ${Math.max(...validRS).toFixed(2)}` : 'N/A'}`);
  
  // 5. Calculate Composite TS Score
  const weights = {
    wM: strategy.mstg_weight_momentum || 0.25,
    wT: strategy.mstg_weight_trend || 0.35,
    wV: strategy.mstg_weight_volatility || 0.20,
    wR: strategy.mstg_weight_relative || 0.20,
  };
  
  console.log(`[MSTG Debug] Weights: M=${weights.wM}, T=${weights.wT}, V=${weights.wV}, R=${weights.wR}`);
  
  const tsScore = indicators.calculateCompositeScore(
    momentum,
    trendScore,
    bbPosition,
    relativeStrength,
    weights
  );
  
  const validTS = tsScore.filter(v => !isNaN(v));
  console.log(`[MSTG Debug] Final TS Score: ${validTS.length} valid values out of ${tsScore.length}`);
  if (validTS.length > 0) {
    console.log(`[MSTG Debug] TS Score range: ${Math.min(...validTS).toFixed(2)} to ${Math.max(...validTS).toFixed(2)}`);
    console.log(`[MSTG Debug] Sample TS values [50-60]: ${tsScore.slice(50, 60).map(v => isNaN(v) ? 'NaN' : v.toFixed(2)).join(', ')}`);
  } else {
    console.error(`[MSTG Debug] ERROR: All TS scores are NaN! Cannot generate any trades.`);
  }
  
  // Trading parameters
  const longThreshold = strategy.mstg_long_threshold || 30;
  const shortThreshold = strategy.mstg_short_threshold || -30;
  const exitThreshold = strategy.mstg_exit_threshold || 0;
  const extremeThreshold = strategy.mstg_extreme_threshold || 60;
  
  console.log(`MSTG Parameters: Long=${longThreshold}, Short=${shortThreshold}, Exit=${exitThreshold}`);
  
  // Backtest simulation
  let balance = initialBalance || strategy.initial_capital || 10000;
  let availableBalance = balance;
  let lockedMargin = 0;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [{ time: candles[0].open_time, balance }];

  const stepSize = 0.00001;
  const minQty = 0.001;
  const minNotional = 10;

  // Find first valid TS score index dynamically
  let firstValidIndex = -1;
  for (let i = 0; i < tsScore.length; i++) {
    if (!isNaN(tsScore[i])) {
      firstValidIndex = i;
      break;
    }
  }
  
  if (firstValidIndex === -1) {
    console.error(`[MSTG Debug] ERROR: No valid TS scores found in entire dataset!`);
    throw new Error('No valid TS scores generated - check indicator calculations');
  }
  
  console.log(`[MSTG Debug] First valid TS score at index ${firstValidIndex} (out of ${candles.length} candles)`);
  console.log(`[MSTG Debug] Trading window: ${candles.length - firstValidIndex - 1} candles`);
  console.log(`[MSTG Debug] Date range: ${new Date(candles[0].open_time).toISOString()} to ${new Date(candles[candles.length - 1].open_time).toISOString()}`);
  
  let skippedNaN = 0;
  let entryChecks = 0;
  let signalsDetected = 0;
  
  // Start from first valid TS score + 1 (to allow for i-1 lookback)
  const startIndex = Math.max(firstValidIndex + 1, 1);
  console.log(`[MSTG Debug] Starting backtest from index ${startIndex}`);
  
  for (let i = startIndex; i < candles.length; i++) {
    const currentCandle = candles[i];
    const ts = tsScore[i - 1]; // Use previous candle to avoid look-ahead bias
    const prevTs = i > 1 ? tsScore[i - 2] : NaN;
    
    if (isNaN(ts)) {
      skippedNaN++;
      continue;
    }

    const executionPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
    const priceWithSlippage = executionPrice * (1 + slippage / 100);

    // Check exit conditions first
    if (position) {
      let shouldExit = false;
      let exitReason = '';

      if (position.type === 'buy' && ts < exitThreshold) {
        shouldExit = true;
        exitReason = 'TS crossed below exit threshold';
      } else if (position.type === 'sell' && ts > exitThreshold) {
        shouldExit = true;
        exitReason = 'TS crossed above exit threshold';
      }

      // Extreme zone - partial profit or tighten stops
      if ((position.type === 'buy' && ts > extremeThreshold) || 
          (position.type === 'sell' && ts < -extremeThreshold)) {
        console.log(`Extreme zone detected at candle ${i}, TS=${ts.toFixed(2)}`);
      }

      if (shouldExit) {
        const exitPriceWithSlippage = position.type === 'buy' 
          ? priceWithSlippage * (1 - slippage / 100)
          : priceWithSlippage * (1 + slippage / 100);

        let pnl = 0;
        if (productType === 'futures') {
          pnl = position.type === 'buy'
            ? (exitPriceWithSlippage - position.entry_price) * position.quantity
            : (position.entry_price - exitPriceWithSlippage) * position.quantity;
          
          const exitFee = Math.abs(exitPriceWithSlippage * position.quantity * takerFee);
          pnl -= exitFee;
          
          availableBalance += lockedMargin + pnl;
          lockedMargin = 0;
        } else {
          const saleProceeds = exitPriceWithSlippage * position.quantity;
          const exitFee = saleProceeds * takerFee;
          pnl = saleProceeds - exitFee - (position.entry_price * position.quantity);
          availableBalance += saleProceeds - exitFee;
        }

        balance += pnl;
        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentCandle.open_time;
        position.profit = pnl;
        trades.push({ ...position });
        position = null;

        console.log(`Exit: ${exitReason}, PnL=${pnl.toFixed(2)}, Balance=${balance.toFixed(2)}`);
      }
    }

    // Check entry conditions
    if (!position) {
      entryChecks++;
      let shouldEnter = false;
      let entryType: 'buy' | 'sell' | null = null;

      if (ts > longThreshold) {
        shouldEnter = true;
        entryType = 'buy';
        signalsDetected++;
        if (signalsDetected <= 5) {
          console.log(`[MSTG Debug] [${i}] Long signal #${signalsDetected} detected: TS=${ts.toFixed(2)} > ${longThreshold}, Date=${new Date(currentCandle.open_time).toISOString()}`);
        }
      } else if (ts < shortThreshold) {
        shouldEnter = true;
        entryType = 'sell';
        signalsDetected++;
        if (signalsDetected <= 5) {
          console.log(`[MSTG Debug] [${i}] Short signal #${signalsDetected} detected: TS=${ts.toFixed(2)} < ${shortThreshold}, Date=${new Date(currentCandle.open_time).toISOString()}`);
        }
      }

      if (shouldEnter && entryType) {
        const positionSizeUSD = (availableBalance * (strategy.position_size_percent || 100)) / 100;
        
        let quantity: number;
        let margin: number;
        let notional: number;
        
        if (productType === 'futures') {
          notional = positionSizeUSD * leverage;
          quantity = notional / priceWithSlippage;
          margin = notional / leverage;
        } else {
          notional = positionSizeUSD;
          quantity = notional / priceWithSlippage;
          margin = notional;
        }

        quantity = Math.floor(quantity / stepSize) * stepSize;
        notional = quantity * priceWithSlippage;
        
        if (quantity < minQty || notional < minNotional) {
          continue;
        }

        const entryFee = notional * makerFee;
        const totalCost = productType === 'futures' ? margin + entryFee : notional + entryFee;
        
        if (totalCost > availableBalance) {
          continue;
        }

        availableBalance -= totalCost;
        if (productType === 'futures') {
          lockedMargin = margin;
        }

        position = {
          entry_price: priceWithSlippage,
          entry_time: currentCandle.open_time,
          type: entryType,
          quantity: quantity,
        };

        console.log(`Entry ${entryType}: TS=${ts.toFixed(2)}, Price=${priceWithSlippage.toFixed(2)}, Qty=${quantity.toFixed(5)}`);
      }
    }

    // Update balance history and drawdown
    balanceHistory.push({ time: currentCandle.open_time, balance });
    if (balance > maxBalance) {
      maxBalance = balance;
    }
    const drawdown = ((maxBalance - balance) / maxBalance) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Close any open position at end
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    
    let pnl = 0;
    if (productType === 'futures') {
      pnl = position.type === 'buy'
        ? (exitPrice - position.entry_price) * position.quantity
        : (position.entry_price - exitPrice) * position.quantity;
      availableBalance += lockedMargin + pnl;
      lockedMargin = 0;
    } else {
      const saleProceeds = exitPrice * position.quantity;
      pnl = saleProceeds - (position.entry_price * position.quantity);
      availableBalance += saleProceeds;
    }

    balance += pnl;
    position.exit_price = exitPrice;
    position.exit_time = lastCandle.open_time;
    position.profit = pnl;
    trades.push({ ...position });
  }

  // Calculate metrics
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winningTrades = trades.filter(t => (t.profit || 0) > 0).length;
  const losingTrades = trades.filter(t => (t.profit || 0) < 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  console.log(`[MSTG Debug] Backtest Summary:`);
  console.log(`[MSTG Debug] - Total candles: ${candles.length}`);
  console.log(`[MSTG Debug] - Trading window: ${candles.length - startIndex} candles`);
  console.log(`[MSTG Debug] - Skipped NaN values: ${skippedNaN}`);
  console.log(`[MSTG Debug] - Entry checks: ${entryChecks}`);
  console.log(`[MSTG Debug] - Signals detected: ${signalsDetected}`);
  console.log(`[MSTG Debug] - Trades executed: ${trades.length}`);
  console.log(`[MSTG Debug] - Final balance: ${balance.toFixed(2)}, Win rate: ${winRate.toFixed(2)}%`);

  await supabaseClient
    .from('strategy_backtest_results')
    .insert({
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_balance: initialBalance,
      final_balance: balance,
      total_return: totalReturn,
      total_trades: trades.length,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: winRate,
      max_drawdown: maxDrawdown,
    });

  return new Response(
    JSON.stringify({
      success: true,
      results: {
        initial_balance: initialBalance,
        final_balance: balance,
        total_return: totalReturn,
        total_trades: trades.length,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate,
        max_drawdown: maxDrawdown,
        sharpe_ratio: null,
        profit_factor: null,
        trades: trades,
        balance_history: balanceHistory,
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ============= 4H REENTRY STRATEGY IMPLEMENTATION =============
async function run4hReentryBacktest(
  strategy: any,
  candles: Candle[],
  initialBalance: number,
  productType: string,
  leverage: number,
  makerFee: number,
  takerFee: number,
  slippage: number,
  executionTiming: string,
  supabaseClient: any,
  strategyId: string,
  startDate: string,
  endDate: string,
  corsHeaders: any
) {
  console.log('Initializing 4h Reentry backtest...');
  
  let balance = initialBalance || strategy.initial_capital || 10000;
  let availableBalance = balance;
  let lockedMargin = 0;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [{ time: candles[0].open_time, balance }];

  // Exchange constraints
  const stepSize = 0.00001;
  const minQty = 0.001;
  const minNotional = 10;

  // Session parameters (NY time 00:00-03:59)
  const sessionStart = "00:00";
  const sessionEnd = "03:59";
  const riskRewardRatio = 2;

  // State tracking for 4h range
  let currentDayRange: { date: string; H_4h: number; L_4h: number } | null = null;
  let previousCandleBreakout: { type: 'above' | 'below' | null; candle: Candle } | null = null;

  console.log(`Processing ${candles.length} candles for 4h reentry logic...`);
  
  let sessionCandlesCount = 0;
  let potentialLongSetups = 0;
  let potentialShortSetups = 0;
  let rejectedEntries = 0;

  for (let i = 1; i < candles.length; i++) {
    const currentCandle = candles[i];
    const previousCandle = candles[i - 1];
    
    const nyTime = convertToNYTime(currentCandle.open_time);
    const currentDate = nyTime.toISOString().split('T')[0];
    const nyTimeStr = `${nyTime.getUTCHours().toString().padStart(2, '0')}:${nyTime.getUTCMinutes().toString().padStart(2, '0')}`;

    // Step 1: Build/update the 4h range for current day
    if (isInNYSession(currentCandle.open_time, sessionStart, sessionEnd)) {
      sessionCandlesCount++;
      if (!currentDayRange || currentDayRange.date !== currentDate) {
        // Start new day range
        currentDayRange = {
          date: currentDate,
          H_4h: currentCandle.high,
          L_4h: currentCandle.low
        };
        console.log(`[${i}] New day range started for ${currentDate} at ${nyTimeStr} NY - Initial H_4h: ${currentCandle.high.toFixed(2)}, L_4h: ${currentCandle.low.toFixed(2)}`);
      } else {
        // Update current day range
        const prevH = currentDayRange.H_4h;
        const prevL = currentDayRange.L_4h;
        currentDayRange.H_4h = Math.max(currentDayRange.H_4h, currentCandle.high);
        currentDayRange.L_4h = Math.min(currentDayRange.L_4h, currentCandle.low);
        
        if (i % 12 === 0) { // Log every hour (12 x 5min candles)
          console.log(`[${i}] Range update ${currentDate} ${nyTimeStr}: H_4h: ${prevH.toFixed(2)}->${currentDayRange.H_4h.toFixed(2)}, L_4h: ${prevL.toFixed(2)}->${currentDayRange.L_4h.toFixed(2)}`);
        }
      }
    }

    // Need established range to trade
    if (!currentDayRange) continue;

    // Step 2: Track if previous candle broke out
    const C_prev = previousCandle.close;
    const C_curr = currentCandle.close;
    const H_prev = previousCandle.high;
    const L_prev = previousCandle.low;

    // Step 3: Check for re-entry setup (no open position)
    if (!position) {
      let shouldEnterLong = false;
      let shouldEnterShort = false;
      let stopLossPrice = 0;
      let takeProfitPrice = 0;

      // LONG setup: C_{t-1} < L_4h AND C_t >= L_4h
      if (C_prev < currentDayRange.L_4h && C_curr >= currentDayRange.L_4h) {
        potentialLongSetups++;
        shouldEnterLong = true;
        const entryPrice = C_curr;
        stopLossPrice = L_prev;
        const distance = Math.abs(entryPrice - stopLossPrice);
        takeProfitPrice = entryPrice + (riskRewardRatio * distance);
        
        console.log(`[${i}] ${nyTimeStr} LONG re-entry: C_prev=${C_prev.toFixed(2)} < L_4h=${currentDayRange.L_4h.toFixed(2)}, C_curr=${C_curr.toFixed(2)} >= L_4h | Entry=${entryPrice.toFixed(2)}, SL=${stopLossPrice.toFixed(2)}, TP=${takeProfitPrice.toFixed(2)}`);
      }
      // SHORT setup: C_{t-1} > H_4h AND C_t <= H_4h
      else if (C_prev > currentDayRange.H_4h && C_curr <= currentDayRange.H_4h) {
        potentialShortSetups++;
        shouldEnterShort = true;
        const entryPrice = C_curr;
        stopLossPrice = H_prev;
        const distance = Math.abs(entryPrice - stopLossPrice);
        takeProfitPrice = entryPrice - (riskRewardRatio * distance);
        
        console.log(`[${i}] ${nyTimeStr} SHORT re-entry: C_prev=${C_prev.toFixed(2)} > H_4h=${currentDayRange.H_4h.toFixed(2)}, C_curr=${C_curr.toFixed(2)} <= H_4h | Entry=${entryPrice.toFixed(2)}, SL=${stopLossPrice.toFixed(2)}, TP=${takeProfitPrice.toFixed(2)}`);
      }

      if (shouldEnterLong || shouldEnterShort) {
        // Determine execution price
        const executionPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
        const priceWithSlippage = shouldEnterLong 
          ? executionPrice * (1 + slippage / 100)
          : executionPrice * (1 - slippage / 100);

        // Calculate position size
        const positionSizeUSD = (availableBalance * (strategy.position_size_percent || 100)) / 100;
        
        let quantity: number;
        let margin: number;
        let notional: number;
        
        if (productType === 'futures') {
          notional = positionSizeUSD * leverage;
          quantity = notional / priceWithSlippage;
          margin = notional / leverage;
        } else {
          notional = positionSizeUSD;
          quantity = notional / priceWithSlippage;
          margin = notional;
        }
        
        // Apply exchange constraints
        quantity = Math.floor(quantity / stepSize) * stepSize;
        const actualNotional = quantity * priceWithSlippage;
        
        // Validate constraints with verbose logging
        const canEnter = quantity >= minQty && actualNotional >= minNotional && margin <= availableBalance;
        
        if (!canEnter) {
          rejectedEntries++;
          console.log(`[${i}] ${nyTimeStr} ❌ ENTRY REJECTED (${shouldEnterLong ? 'LONG' : 'SHORT'}):`);
          console.log(`  - positionSizeUSD: ${positionSizeUSD.toFixed(2)}`);
          console.log(`  - executionPrice: ${priceWithSlippage.toFixed(2)}`);
          console.log(`  - quantity: ${quantity.toFixed(5)} (minQty: ${minQty})`);
          console.log(`  - actualNotional: ${actualNotional.toFixed(2)} (minNotional: ${minNotional})`);
          console.log(`  - margin: ${margin.toFixed(2)}`);
          console.log(`  - availableBalance: ${availableBalance.toFixed(2)}`);
          console.log(`  - leverage: ${leverage}x`);
          console.log(`  - Reason: ${quantity < minQty ? 'quantity < minQty' : actualNotional < minNotional ? 'actualNotional < minNotional' : 'margin > availableBalance'}`);
        }
        
        if (canEnter) {
          const entryFee = actualNotional * (takerFee / 100);
          
          position = {
            type: shouldEnterLong ? 'buy' : 'sell',
            entry_price: priceWithSlippage,
            entry_time: currentCandle.open_time,
            quantity,
          };
          
          // Store dynamic SL/TP in position metadata
          (position as any).stopLossPrice = stopLossPrice;
          (position as any).takeProfitPrice = takeProfitPrice;
          
          // Deduct margin and fee
          if (productType === 'futures') {
            lockedMargin = margin;
            availableBalance -= (margin + entryFee);
          } else {
            availableBalance -= (actualNotional + entryFee);
          }
          
          console.log(`[${i}] ${nyTimeStr} ✅ Opened ${shouldEnterLong ? 'LONG' : 'SHORT'} at ${priceWithSlippage.toFixed(2)} (qty: ${quantity.toFixed(5)}, notional: ${actualNotional.toFixed(2)}, fee: ${entryFee.toFixed(2)}, SL: ${stopLossPrice.toFixed(2)}, TP: ${takeProfitPrice.toFixed(2)})`);
        }
      }
    } else {
      // Check for exit: SL/TP using intrabar logic
      const stopLossPrice = (position as any).stopLossPrice;
      const takeProfitPrice = (position as any).takeProfitPrice;
      
      let exitPrice: number | null = null;
      let exitReason = '';
      
      if (position.type === 'buy') {
        // LONG position
        const slHit = currentCandle.low <= stopLossPrice;
        const tpHit = currentCandle.high >= takeProfitPrice;
        
        if (slHit && tpHit) {
          exitPrice = stopLossPrice;
          exitReason = 'STOP_LOSS';
        } else if (slHit) {
          exitPrice = stopLossPrice;
          exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice;
          exitReason = 'TAKE_PROFIT';
        }
      } else {
        // SHORT position
        const slHit = currentCandle.high >= stopLossPrice;
        const tpHit = currentCandle.low <= takeProfitPrice;
        
        if (slHit && tpHit) {
          exitPrice = stopLossPrice;
          exitReason = 'STOP_LOSS';
        } else if (slHit) {
          exitPrice = stopLossPrice;
          exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice;
          exitReason = 'TAKE_PROFIT';
        }
      }

      if (exitPrice) {
        // Apply slippage on exit
        const exitPriceWithSlippage = position.type === 'buy'
          ? exitPrice * (1 - slippage / 100)
          : exitPrice * (1 + slippage / 100);
        
        // Directional P&L
        const pnl = position.type === 'buy'
          ? position.quantity * (exitPriceWithSlippage - position.entry_price)
          : position.quantity * (position.entry_price - exitPriceWithSlippage);
        
        const exitNotional = position.quantity * exitPriceWithSlippage;
        const exitFee = exitNotional * (takerFee / 100);
        const netProfit = pnl - exitFee;
        
        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentCandle.open_time;
        position.profit = netProfit;
        
        // Return funds
        if (productType === 'futures') {
          availableBalance += (lockedMargin + netProfit);
          lockedMargin = 0;
        } else {
          availableBalance += (exitNotional - exitFee);
        }
        
        balance = availableBalance + lockedMargin;
        trades.push(position);
        
        console.log(`[${i}] Closed ${exitReason} at ${exitPriceWithSlippage.toFixed(2)}, profit: ${netProfit.toFixed(2)}`);
        
        position = null;
      }
    }

    // Track balance and drawdown
    balance = availableBalance + lockedMargin;
    balanceHistory.push({ time: currentCandle.open_time, balance });
    
    if (balance > maxBalance) {
      maxBalance = balance;
    }
    const currentDrawdown = ((maxBalance - balance) / maxBalance) * 100;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
  }

  // Close any open position at the end
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    
    const pnl = position.type === 'buy'
      ? position.quantity * (exitPrice - position.entry_price)
      : position.quantity * (position.entry_price - exitPrice);
    
    const exitNotional = position.quantity * exitPrice;
    const exitFee = exitNotional * (takerFee / 100);
    const netProfit = pnl - exitFee;
    
    position.exit_price = exitPrice;
    position.exit_time = lastCandle.open_time;
    position.profit = netProfit;
    
    if (productType === 'futures') {
      availableBalance += (lockedMargin + netProfit);
    } else {
      availableBalance += (exitNotional - exitFee);
    }
    
    balance = availableBalance;
    trades.push(position);
    console.log(`[END] Closed position at ${exitPrice.toFixed(2)}, profit: ${netProfit.toFixed(2)}`);
  }

  // Log summary statistics
  console.log(`\n=== 4H REENTRY BACKTEST SUMMARY ===`);
  console.log(`Total candles processed: ${candles.length}`);
  console.log(`Candles in NY session (00:00-03:59): ${sessionCandlesCount}`);
  console.log(`Potential LONG setups: ${potentialLongSetups}`);
  console.log(`Potential SHORT setups: ${potentialShortSetups}`);
  console.log(`Rejected entries (insufficient funds): ${rejectedEntries}`);
  console.log(`Executed trades: ${trades.length}`);
  console.log(`===================================\n`);

  // Calculate metrics
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winningTrades = trades.filter(t => (t.profit || 0) > 0).length;
  const losingTrades = trades.filter(t => (t.profit || 0) <= 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  const avgWin = winningTrades > 0 
    ? trades.filter(t => (t.profit || 0) > 0).reduce((sum, t) => sum + (t.profit || 0), 0) / winningTrades 
    : 0;
  const avgLoss = losingTrades > 0
    ? Math.abs(trades.filter(t => (t.profit || 0) <= 0).reduce((sum, t) => sum + (t.profit || 0), 0) / losingTrades)
    : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades) / (avgLoss * losingTrades) : 0;

  console.log(`4h Reentry backtest complete: ${trades.length} trades, ${winRate.toFixed(1)}% win rate, PF: ${profitFactor.toFixed(2)}`);

  // Save backtest results
  await supabaseClient
    .from('strategy_backtest_results')
    .insert({
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_balance: initialBalance,
      final_balance: balance,
      total_return: totalReturn,
      total_trades: trades.length,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: winRate,
      max_drawdown: maxDrawdown,
    });

  return new Response(
    JSON.stringify({
      success: true,
      results: {
        initial_balance: initialBalance,
        final_balance: balance,
        total_return: totalReturn,
        total_trades: trades.length,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate,
        max_drawdown: maxDrawdown,
        profit_factor: profitFactor,
        avg_win: avgWin,
        avg_loss: avgLoss,
        balance_history: balanceHistory,
        trades,
        config: {
          strategy_type: '4h_reentry',
          product_type: productType,
          leverage,
          maker_fee: makerFee,
          taker_fee: takerFee,
          slippage,
          execution_timing: executionTiming,
          session_start: sessionStart,
          session_end: sessionEnd,
          risk_reward_ratio: riskRewardRatio
        }
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}