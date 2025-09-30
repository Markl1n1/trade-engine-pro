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
    const { strategyId, startDate, endDate, initialBalance } = await req.json();

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
        const shouldEnter = checkConditions(strategy.strategy_conditions, previousCandles, 'buy');
        
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
          console.log(`Opened position at ${currentCandle.close}`);
        }
      } else {
        // Check exit conditions
        const shouldExit = checkConditions(strategy.strategy_conditions, previousCandles, 'sell');
        const stopLossHit = strategy.stop_loss_percent && 
          ((position.entry_price - currentCandle.close) / position.entry_price * 100) >= strategy.stop_loss_percent;
        const takeProfitHit = strategy.take_profit_percent && 
          ((currentCandle.close - position.entry_price) / position.entry_price * 100) >= strategy.take_profit_percent;

        if (shouldExit || stopLossHit || takeProfitHit) {
          const exitValue = position.quantity * currentCandle.close;
          const profit = exitValue - (position.quantity * position.entry_price);
          
          position.exit_price = currentCandle.close;
          position.exit_time = currentCandle.open_time;
          position.profit = profit;
          
          balance += exitValue;
          trades.push(position);
          position = null;
          
          console.log(`Closed position at ${currentCandle.close}, profit: ${profit}`);
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

function checkConditions(conditions: any[], candles: Candle[], orderType: string): boolean {
  if (!conditions || conditions.length === 0) return false;

  const relevantConditions = conditions.filter(c => c.order_type === orderType);
  if (relevantConditions.length === 0) return false;

  // Simple condition checking - can be enhanced
  const currentCandle = candles[candles.length - 1];
  const previousCandle = candles.length > 1 ? candles[candles.length - 2] : null;

  for (const condition of relevantConditions) {
    const { indicator_type, operator, value } = condition;
    let indicatorValue: number | null = null;

    // Get indicator value
    switch (indicator_type) {
      case 'price':
        indicatorValue = currentCandle.close;
        break;
      case 'volume':
        indicatorValue = currentCandle.volume;
        break;
      case 'sma':
      case 'ema':
      case 'rsi':
      case 'macd':
        // For now, use simple price-based logic
        // In production, calculate actual indicators
        indicatorValue = currentCandle.close;
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
        if (previousCandle) {
          conditionMet = previousCandle.close < value && currentCandle.close > value;
        }
        break;
      case 'crosses_below':
        if (previousCandle) {
          conditionMet = previousCandle.close > value && currentCandle.close < value;
        }
        break;
    }

    if (!conditionMet) return false;
  }

  return true;
}
