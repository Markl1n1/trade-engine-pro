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

    // Pre-calculate RSI for all candles
    const rsiValues = calculateRSI(candles.map(c => c.close), 14);

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
        const shouldEnter = checkConditions(strategy.strategy_conditions, previousCandles, rsiValues, i, 'buy');
        
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
          console.log(`[${i}] Opened BUY at ${currentCandle.close}, RSI: ${rsiValues[i]?.toFixed(2)}`);
        }
      } else {
        // Check exit conditions
        const shouldExit = checkConditions(strategy.strategy_conditions, previousCandles, rsiValues, i, 'sell');
        
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
          console.log(`[${i}] Closed ${exitReason} at ${currentCandle.close}, profit: ${profit.toFixed(2)}, RSI: ${rsiValues[i]?.toFixed(2)}`);
          
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

function checkConditions(
  conditions: any[], 
  candles: Candle[], 
  rsiValues: number[], 
  currentIndex: number,
  orderType: string
): boolean {
  if (!conditions || conditions.length === 0) return false;

  const relevantConditions = conditions.filter(c => c.order_type === orderType);
  if (relevantConditions.length === 0) return false;

  const currentCandle = candles[candles.length - 1];
  const previousCandle = candles.length > 1 ? candles[candles.length - 2] : null;

  for (const condition of relevantConditions) {
    const { indicator_type, operator, value } = condition;
    let indicatorValue: number | null = null;
    let previousIndicatorValue: number | null = null;

    // Get indicator value
    switch (indicator_type) {
      case 'price':
        indicatorValue = currentCandle.close;
        previousIndicatorValue = previousCandle?.close ?? null;
        break;
      case 'volume':
        indicatorValue = currentCandle.volume;
        previousIndicatorValue = previousCandle?.volume ?? null;
        break;
      case 'rsi':
        indicatorValue = rsiValues[currentIndex] ?? null;
        previousIndicatorValue = currentIndex > 0 ? rsiValues[currentIndex - 1] ?? null : null;
        break;
      case 'sma':
      case 'ema':
      case 'macd':
        // TODO: Implement these indicators
        indicatorValue = currentCandle.close;
        previousIndicatorValue = previousCandle?.close ?? null;
        break;
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
