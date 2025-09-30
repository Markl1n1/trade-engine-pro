import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  rsi: { [period: number]: number[] };
  ema: { [period: number]: number[] };
  sma: { [period: number]: number[] };
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

    // Fetch strategy details
    const { data: strategy, error: strategyError } = await supabaseClient
      .from('strategies')
      .select('*, strategy_conditions(*)')
      .eq('id', strategyId)
      .single();

    if (strategyError || !strategy) {
      throw new Error('Strategy not found');
    }

    console.log(`Strategy: ${strategy.name}, Symbol: ${strategy.symbol}, Timeframe: ${strategy.timeframe}`);

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

    // Calculate indicators if needed
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
    const indicatorCache: IndicatorCache = {
      rsi: {},
      ema: {},
      sma: {},
    };

    // Determine which indicators and periods are needed
    const neededIndicators = new Set<string>();
    strategy.strategy_conditions.forEach((condition: any) => {
      if (condition.period_1) {
        neededIndicators.add(`${condition.indicator_type}_${condition.period_1}`);
      }
      if (condition.indicator_type_2 && condition.period_2) {
        neededIndicators.add(`${condition.indicator_type_2}_${condition.period_2}`);
      }
    });

    // Pre-calculate needed indicators
    neededIndicators.forEach((key) => {
      const [type, periodStr] = key.split('_');
      const period = parseInt(periodStr);
      
      if (type === 'rsi') {
        indicatorCache.rsi[period] = calculateRSI(closePrices, period);
      } else if (type === 'ema') {
        indicatorCache.ema[period] = calculateEMA(closePrices, period);
      } else if (type === 'sma') {
        indicatorCache.sma[period] = calculateSMA(closePrices, period);
      }
    });

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

function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  
  if (prices.length < period + 1) {
    return new Array(prices.length).fill(0);
  }

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain and loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Fill initial values with 0
  for (let i = 0; i < period; i++) {
    rsi.push(0);
  }

  // Calculate RSI for remaining values
  for (let i = period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsiValue = 100 - (100 / (1 + rs));
    
    rsi.push(rsiValue);
  }

  return rsi;
}

function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  
  if (prices.length < period) {
    return new Array(prices.length).fill(0);
  }

  // Calculate initial SMA as first EMA value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    ema.push(0);
    sum += prices[i];
  }
  
  const initialEMA = sum / period;
  ema[period - 1] = initialEMA;
  
  // Calculate multiplier
  const multiplier = 2 / (period + 1);
  
  // Calculate EMA for remaining values
  for (let i = period; i < prices.length; i++) {
    const currentEMA = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
    ema.push(currentEMA);
  }
  
  return ema;
}

function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  
  if (prices.length < period) {
    return new Array(prices.length).fill(0);
  }

  // Fill initial values with 0
  for (let i = 0; i < period - 1; i++) {
    sma.push(0);
  }

  // Calculate SMA for each window
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma.push(sum / period);
  }

  return sma;
}

function getIndicatorValue(
  indicatorType: string,
  period: number,
  indicatorCache: IndicatorCache,
  currentIndex: number,
  candles: Candle[]
): number | null {
  const currentCandle = candles[candles.length - 1];
  
  switch (indicatorType) {
    case 'price':
      return currentCandle.close;
    case 'volume':
      return currentCandle.volume;
    case 'rsi':
      return indicatorCache.rsi[period]?.[currentIndex] ?? null;
    case 'ema':
      return indicatorCache.ema[period]?.[currentIndex] ?? null;
    case 'sma':
      return indicatorCache.sma[period]?.[currentIndex] ?? null;
    default:
      return null;
  }
}

function checkConditions(
  conditions: any[], 
  candles: Candle[], 
  indicatorCache: IndicatorCache,
  currentIndex: number,
  orderType: string
): boolean {
  if (!conditions || conditions.length === 0) return false;

  const relevantConditions = conditions.filter(c => c.order_type === orderType);
  if (relevantConditions.length === 0) return false;

  const currentCandle = candles[candles.length - 1];
  const previousCandle = candles.length > 1 ? candles[candles.length - 2] : null;

  for (const condition of relevantConditions) {
    const { indicator_type, operator, value, period_1, indicator_type_2, period_2 } = condition;
    
    // Handle indicator comparison (e.g., EMA 9 > EMA 21)
    if (operator === 'indicator_comparison' && indicator_type_2 && period_1 && period_2) {
      const indicator1Value = getIndicatorValue(indicator_type, period_1, indicatorCache, currentIndex, candles);
      const indicator2Value = getIndicatorValue(indicator_type_2, period_2, indicatorCache, currentIndex, candles);
      
      if (indicator1Value === null || indicator2Value === null) continue;
      
      // For indicator comparison, we check if indicator1 > indicator2
      if (indicator1Value <= indicator2Value) return false;
      continue;
    }
    
    // Handle regular value-based conditions
    const period = period_1 || 14; // Default to 14 if not specified
    let indicatorValue = getIndicatorValue(indicator_type, period, indicatorCache, currentIndex, candles);
    let previousIndicatorValue: number | null = null;
    
    if (currentIndex > 0) {
      previousIndicatorValue = getIndicatorValue(indicator_type, period, indicatorCache, currentIndex - 1, candles.slice(0, -1));
    }

    if (indicatorValue === null) continue;

    // Check operator
    let conditionMet = false;
    switch (operator) {
      case 'greater_than':
        conditionMet = indicatorValue > value;
        break;
      case 'less_than':
        conditionMet = indicatorValue < value;
        break;
      case 'equals':
        conditionMet = Math.abs(indicatorValue - value) < 0.01;
        break;
      case 'crosses_above':
        if (previousIndicatorValue !== null) {
          conditionMet = previousIndicatorValue <= value && indicatorValue > value;
        }
        break;
      case 'crosses_below':
        if (previousIndicatorValue !== null) {
          conditionMet = previousIndicatorValue >= value && indicatorValue < value;
        }
        break;
    }

    if (!conditionMet) return false;
  }

  return true;
}
