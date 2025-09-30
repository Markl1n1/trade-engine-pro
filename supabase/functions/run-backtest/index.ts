import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { strategyId, startDate, endDate, initialBalance, stopLossPercent, takeProfitPercent } = await req.json();

    console.log(`Running backtest for strategy ${strategyId}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch strategy details with all conditions
    const { data: strategy, error: strategyError } = await supabaseClient
      .from('strategies')
      .select('*, strategy_conditions(*), condition_groups(*)')
      .eq('id', strategyId)
      .single();

    if (strategyError || !strategy) {
      throw new Error('Strategy not found');
    }

    console.log(`Strategy: ${strategy.name}, Symbol: ${strategy.symbol}, Timeframe: ${strategy.timeframe}`);
    console.log(`Conditions count: ${strategy.strategy_conditions?.length || 0}`);

    // Validate strategy has conditions
    if (!strategy.strategy_conditions || strategy.strategy_conditions.length === 0) {
      throw new Error('Strategy has no conditions defined. Please add entry/exit conditions before running backtest.');
    }

    // Fetch market data
    const { data: marketData, error: marketError } = await supabaseClient
      .from('market_data')
      .select('*')
      .eq('symbol', strategy.symbol)
      .eq('timeframe', strategy.timeframe)
      .gte('open_time', new Date(startDate).getTime())
      .lte('open_time', new Date(endDate).getTime())
      .order('open_time', { ascending: true });

    if (marketError || !marketData || marketData.length === 0) {
      throw new Error('No market data found for the specified period');
    }

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
    strategy.strategy_conditions.forEach((condition: any) => {
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

    // Run backtest simulation
    let balance = initialBalance || strategy.initial_capital || 1000;
    let position: Trade | null = null;
    const trades: Trade[] = [];
    let maxBalance = balance;
    let maxDrawdown = 0;

    for (let i = 1; i < candles.length; i++) {
      const currentCandle = candles[i];
      const previousCandles = candles.slice(0, i + 1);

      // Check entry conditions
      if (!position) {
        const shouldEnter = checkConditions(
          strategy.strategy_conditions, 
          strategy.condition_groups || [],
          previousCandles, 
          indicatorCache, 
          i, 
          'buy'
        );
        
        if (shouldEnter) {
          const positionSize = (balance * (strategy.position_size_percent || 100)) / 100;
          const quantity = positionSize / currentCandle.close;
          
          position = {
            type: 'buy',
            entry_price: currentCandle.close,
            entry_time: currentCandle.open_time,
            quantity,
          };
          
          balance -= positionSize;
          console.log(`[${i}] Opened BUY at ${currentCandle.close}`);
        }
      } else {
        // Check exit conditions
        const shouldExit = checkConditions(
          strategy.strategy_conditions, 
          strategy.condition_groups || [],
          previousCandles, 
          indicatorCache, 
          i, 
          'sell'
        );
        
        // Use provided SL/TP or fall back to strategy settings
        const stopLoss = stopLossPercent ?? strategy.stop_loss_percent;
        const takeProfit = takeProfitPercent ?? strategy.take_profit_percent;
        
        const stopLossHit = stopLoss && 
          ((position.entry_price - currentCandle.close) / position.entry_price * 100) >= stopLoss;
        const takeProfitHit = takeProfit && 
          ((currentCandle.close - position.entry_price) / position.entry_price * 100) >= takeProfit;

        if (shouldExit || stopLossHit || takeProfitHit) {
          const exitValue = position.quantity * currentCandle.close;
          const profit = exitValue - (position.quantity * position.entry_price);
          
          position.exit_price = currentCandle.close;
          position.exit_time = currentCandle.open_time;
          position.profit = profit;
          
          balance += exitValue;
          trades.push(position);
          
          const exitReason = shouldExit ? 'SELL_SIGNAL' : (stopLossHit ? 'STOP_LOSS' : 'TAKE_PROFIT');
          console.log(`[${i}] Closed ${exitReason} at ${currentCandle.close}, profit: ${profit.toFixed(2)}`);
          
          position = null;
        }
      }

      // Track max drawdown
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
      const exitValue = position.quantity * lastCandle.close;
      const profit = exitValue - (position.quantity * position.entry_price);
      
      position.exit_price = lastCandle.close;
      position.exit_time = lastCandle.open_time;
      position.profit = profit;
      
      balance += exitValue;
      trades.push(position);
    }

    // Calculate metrics
    const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
    const winningTrades = trades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = trades.filter(t => (t.profit || 0) <= 0).length;
    const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

    console.log(`Backtest complete: ${trades.length} trades, ${winRate.toFixed(1)}% win rate`);

    // Save backtest results
    const { error: insertError } = await supabaseClient
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

    if (insertError) {
      console.error('Error saving backtest results:', insertError);
    }

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
          trades,
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
        cache[key] = indicators.calculateStochRSI(closePrices, period, 14);
        break;
      case 'momentum':
        cache[key] = indicators.calculateMomentum(closePrices, period);
        break;
      case 'roc':
        cache[key] = indicators.calculateROC(closePrices, period);
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

      // Trend Indicators
      case 'macd':
        const macd = indicators.calculateMACD(closePrices, 12, 26, 9);
        cache[key] = { macd: macd.macd, signal: macd.signal, histogram: macd.histogram };
        break;
      case 'adx':
        const adx = indicators.calculateADX(candles, period);
        cache[key] = { adx: adx.adx, plusDI: adx.plusDI, minusDI: adx.minusDI };
        break;

      // Volatility Indicators
      case 'atr':
        cache[key] = indicators.calculateATR(candles, period);
        break;
      case 'bollinger_bands':
        const bb = indicators.calculateBollingerBands(closePrices, period, params.deviation || 2);
        cache[key] = { upper: bb.upper, middle: bb.middle, lower: bb.lower };
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
    // For MACD, Stochastic, ADX, Bollinger Bands
    if ('macd' in cached) return (cached.macd as number[])[currentIndex] ?? null;
    if ('k' in cached) return (cached.k as number[])[currentIndex] ?? null;
    if ('adx' in cached) return (cached.adx as number[])[currentIndex] ?? null;
    if ('upper' in cached) return (cached.middle as number[])[currentIndex] ?? null;
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