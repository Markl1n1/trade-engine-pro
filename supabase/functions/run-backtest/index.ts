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
  const hours = nyTime.getHours();
  const minutes = nyTime.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  
  const [startHours, startMins] = sessionStart.split(':').map(Number);
  const [endHours, endMins] = sessionEnd.split(':').map(Number);
  const startMinutes = startHours * 60 + startMins;
  const endMinutes = endHours * 60 + endMins;
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      strategyId, 
      startDate, 
      endDate, 
      initialBalance, 
      stopLossPercent, 
      takeProfitPercent,
      productType = 'spot', // 'spot' or 'futures'
      leverage = 1,
      makerFee = 0.02,
      takerFee = 0.04,
      slippage = 0.01,
      executionTiming = 'close' // 'open' or 'close'
    } = await req.json();

    console.log(`Running backtest for strategy ${strategyId} (${productType.toUpperCase()}, ${leverage}x leverage)`);

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

    // Run standard backtest simulation
    let balance = initialBalance || strategy.initial_capital || 1000;
    let availableBalance = balance;
    let lockedMargin = 0;
    let position: Trade | null = null;
    const trades: Trade[] = [];
    let maxBalance = balance;
    let maxDrawdown = 0;
    const balanceHistory: { time: number; balance: number }[] = [{ time: candles[0].open_time, balance }];

    // Exchange constraints (Binance-like)
    const stepSize = 0.00001;
    const minQty = 0.001;
    const minNotional = 10;

    for (let i = 1; i < candles.length; i++) {
      const currentCandle = candles[i];
      
      // CRITICAL FIX: Use indicators from previous candle (i-1) to prevent look-ahead bias
      const indicatorIndex = i - 1;

      // Check entry conditions
      if (!position) {
        const shouldEnter = checkConditions(
          normalizedConditions, 
          groups || [],
          candles, 
          indicatorCache, 
          indicatorIndex,  // Use i-1 for decision
          'buy'
        );
        
        if (shouldEnter) {
          // Determine execution price based on timing
          const executionPrice = executionTiming === 'open' 
            ? currentCandle.open 
            : currentCandle.close;
          
          // Apply slippage
          const priceWithSlippage = executionPrice * (1 + slippage / 100);
          
          // Calculate position size
          const positionSizeUSD = (availableBalance * (strategy.position_size_percent || 100)) / 100;
          
          let quantity: number;
          let margin: number;
          let notional: number;
          
          if (productType === 'futures') {
            // Futures: use leverage
            notional = positionSizeUSD * leverage;
            quantity = notional / priceWithSlippage;
            margin = notional / leverage;
          } else {
            // Spot: full cost
            notional = positionSizeUSD;
            quantity = notional / priceWithSlippage;
            margin = notional;
          }
          
          // Apply exchange constraints
          quantity = Math.floor(quantity / stepSize) * stepSize;
          const actualNotional = quantity * priceWithSlippage;
          
          // Validate constraints
          if (quantity >= minQty && actualNotional >= minNotional && margin <= availableBalance) {
            // Calculate entry fee
            const entryFee = actualNotional * (takerFee / 100);
            
            position = {
              type: 'buy',
              entry_price: priceWithSlippage,
              entry_time: currentCandle.open_time,
              quantity,
            };
            
            // Deduct margin and fee
            if (productType === 'futures') {
              lockedMargin = margin;
              availableBalance -= (margin + entryFee);
            } else {
              availableBalance -= (actualNotional + entryFee);
            }
            
            console.log(`[${i}] Opened BUY at ${priceWithSlippage.toFixed(2)} (qty: ${quantity.toFixed(5)}, fee: ${entryFee.toFixed(2)})`);
          }
        }
      } else {
        // PHASE 1.2: Intrabar execution logic - check SL/TP using high/low FIRST
        const stopLoss = stopLossPercent ?? strategy.stop_loss_percent;
        const takeProfit = takeProfitPercent ?? strategy.take_profit_percent;
        
        let exitPrice: number | null = null;
        let exitReason = '';
        
        if (stopLoss || takeProfit) {
          // Calculate SL/TP prices for LONG position
          const stopLossPrice = position.entry_price * (1 - (stopLoss || 0) / 100);
          const takeProfitPrice = position.entry_price * (1 + (takeProfit || 0) / 100);
          
          // Check intrabar hits using high/low
          const slHit = stopLoss && currentCandle.low <= stopLossPrice;
          const tpHit = takeProfit && currentCandle.high >= takeProfitPrice;
          
          if (slHit && tpHit) {
            // Both hit in same candle - conservative: assume SL hit first
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
        
        // If no SL/TP hit, check strategy SELL signal
        if (!exitPrice) {
          const shouldExit = checkConditions(
            normalizedConditions, 
            groups || [],
            candles, 
            indicatorCache, 
            indicatorIndex,  // Use i-1 for decision
            'sell'
          );
          
          if (shouldExit) {
            exitPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
            exitReason = 'SELL_SIGNAL';
          }
        }

        if (exitPrice) {
          // Apply slippage on exit
          const exitPriceWithSlippage = exitPrice * (1 - slippage / 100);
          
          // PHASE 1.3: Directional P&L calculation (correct for LONG)
          const pnl = position.quantity * (exitPriceWithSlippage - position.entry_price);
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
      const pnl = position.quantity * (exitPrice - position.entry_price);
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

    // Calculate metrics
    const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
    const winningTrades = trades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = trades.filter(t => (t.profit || 0) <= 0).length;
    const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

    // Calculate additional metrics
    const avgWin = winningTrades > 0 
      ? trades.filter(t => (t.profit || 0) > 0).reduce((sum, t) => sum + (t.profit || 0), 0) / winningTrades 
      : 0;
    const avgLoss = losingTrades > 0
      ? Math.abs(trades.filter(t => (t.profit || 0) <= 0).reduce((sum, t) => sum + (t.profit || 0), 0) / losingTrades)
      : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades) / (avgLoss * losingTrades) : 0;

    console.log(`Backtest complete: ${trades.length} trades, ${winRate.toFixed(1)}% win rate, PF: ${profitFactor.toFixed(2)}`);

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
          profit_factor: profitFactor,
          avg_win: avgWin,
          avg_loss: avgLoss,
          balance_history: balanceHistory,
          trades,
          config: {
            product_type: productType,
            leverage,
            maker_fee: makerFee,
            taker_fee: takerFee,
            slippage,
            execution_timing: executionTiming
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

  for (let i = 1; i < candles.length; i++) {
    const currentCandle = candles[i];
    const previousCandle = candles[i - 1];
    
    const nyTime = convertToNYTime(currentCandle.open_time);
    const currentDate = nyTime.toISOString().split('T')[0];
    const nyTimeStr = `${nyTime.getUTCHours().toString().padStart(2, '0')}:${nyTime.getUTCMinutes().toString().padStart(2, '0')}`;

    // Step 1: Build/update the 4h range for current day
    if (isInNYSession(currentCandle.open_time, sessionStart, sessionEnd)) {
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
        shouldEnterLong = true;
        const entryPrice = C_curr;
        stopLossPrice = L_prev;
        const distance = Math.abs(entryPrice - stopLossPrice);
        takeProfitPrice = entryPrice + (riskRewardRatio * distance);
        
        console.log(`[${i}] ${nyTimeStr} LONG re-entry: C_prev=${C_prev.toFixed(2)} < L_4h=${currentDayRange.L_4h.toFixed(2)}, C_curr=${C_curr.toFixed(2)} >= L_4h | Entry=${entryPrice.toFixed(2)}, SL=${stopLossPrice.toFixed(2)}, TP=${takeProfitPrice.toFixed(2)}`);
      }
      // SHORT setup: C_{t-1} > H_4h AND C_t <= H_4h
      else if (C_prev > currentDayRange.H_4h && C_curr <= currentDayRange.H_4h) {
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
        
        // Validate constraints
        if (quantity >= minQty && actualNotional >= minNotional && margin <= availableBalance) {
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
          
          console.log(`[${i}] Opened ${position.type.toUpperCase()} at ${priceWithSlippage.toFixed(2)}, SL=${stopLossPrice.toFixed(2)}, TP=${takeProfitPrice.toFixed(2)}`);
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