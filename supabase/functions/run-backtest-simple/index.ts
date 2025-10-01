import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple SMA calculation
function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// Simple RSI calculation
function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    }
  }

  return result;
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
      productType = 'spot',
      leverage = 1,
      makerFee = 0.02,
      takerFee = 0.04,
      slippage = 0.01,
    } = await req.json();

    console.log('[Simple Backtest] Starting simple vectorized backtest');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch strategy
    const { data: strategy, error: strategyError } = await supabaseClient
      .from('strategies')
      .select('*')
      .eq('id', strategyId)
      .single();

    if (strategyError || !strategy) {
      throw new Error('Strategy not found');
    }

    // Fetch market data
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();

    const { data: candles, error: dataError } = await supabaseClient
      .from('market_data')
      .select('*')
      .eq('symbol', strategy.symbol)
      .eq('timeframe', strategy.timeframe)
      .gte('open_time', startTime)
      .lte('open_time', endTime)
      .order('open_time', { ascending: true });

    if (dataError || !candles || candles.length === 0) {
      throw new Error('No market data available for selected period');
    }

    console.log(`[Simple Backtest] Processing ${candles.length} candles`);

    // Fetch conditions
    const { data: conditions } = await supabaseClient
      .from('strategy_conditions')
      .select('*')
      .eq('strategy_id', strategyId)
      .order('order_index', { ascending: true });

    if (!conditions || conditions.length === 0) {
      throw new Error('No conditions defined');
    }

    // Pre-calculate all indicators (vectorized)
    const closes = candles.map(c => Number(c.close));
    const highs = candles.map(c => Number(c.high));
    const lows = candles.map(c => Number(c.low));
    
    const indicatorCache: Record<string, number[]> = {};

    // Calculate unique indicators
    const uniqueIndicators = new Set<string>();
    conditions.forEach(cond => {
      if (cond.indicator_type && cond.period_1) {
        uniqueIndicators.add(`${cond.indicator_type}_${cond.period_1}`);
      }
    });

    console.log(`[Simple Backtest] Calculating ${uniqueIndicators.size} unique indicators`);

    uniqueIndicators.forEach(key => {
      const [type, periodStr] = key.split('_');
      const period = parseInt(periodStr);
      
      if (type === 'SMA') {
        indicatorCache[key] = calculateSMA(closes, period);
      } else if (type === 'RSI') {
        indicatorCache[key] = calculateRSI(closes, period);
      }
    });

    // Simple signal generation (vectorized)
    const signals: boolean[] = new Array(candles.length).fill(false);
    const exitSignals: boolean[] = new Array(candles.length).fill(false);

    for (let i = 50; i < candles.length; i++) {
      // Entry: Simple SMA crossover or RSI oversold
      const entryConditions = conditions.filter(c => c.order_type === 'entry');
      let entryMet = true;
      
      for (const cond of entryConditions) {
        const key = `${cond.indicator_type}_${cond.period_1}`;
        const values = indicatorCache[key];
        if (!values) continue;

        if (cond.indicator_type === 'SMA' && cond.operator === 'crosses_above') {
          entryMet = entryMet && (closes[i] > values[i] && closes[i-1] <= values[i-1]);
        } else if (cond.indicator_type === 'RSI' && cond.operator === 'less_than') {
          entryMet = entryMet && (values[i] < cond.value);
        }
      }
      signals[i] = entryMet;

      // Exit: Simple opposite condition
      const exitConditions = conditions.filter(c => c.order_type === 'exit');
      let exitMet = false;
      
      for (const cond of exitConditions) {
        const key = `${cond.indicator_type}_${cond.period_1}`;
        const values = indicatorCache[key];
        if (!values) continue;

        if (cond.indicator_type === 'SMA' && cond.operator === 'crosses_below') {
          exitMet = exitMet || (closes[i] < values[i] && closes[i-1] >= values[i-1]);
        } else if (cond.indicator_type === 'RSI' && cond.operator === 'greater_than') {
          exitMet = exitMet || (values[i] > cond.value);
        }
      }
      exitSignals[i] = exitMet;
    }

    // Simulate trades (vectorized approach)
    let balance = initialBalance;
    let position = 0;
    let entryPrice = 0;
    const trades: any[] = [];
    const balanceHistory: any[] = [];

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const price = Number(candle.close);

      // Check exit or stop loss/take profit
      if (position > 0) {
        const pnlPercent = ((price - entryPrice) / entryPrice) * 100 * leverage;
        let exitReason = '';

        if (pnlPercent <= -stopLossPercent) {
          exitReason = 'stop_loss';
        } else if (pnlPercent >= takeProfitPercent) {
          exitReason = 'take_profit';
        } else if (exitSignals[i]) {
          exitReason = 'signal';
        }

        if (exitReason) {
          const exitValue = position * price;
          const fees = (position * entryPrice * takerFee / 100) + (exitValue * takerFee / 100);
          const slippageCost = exitValue * (slippage / 100);
          const profit = exitValue - (position * entryPrice) - fees - slippageCost;
          
          balance += profit;
          
          trades.push({
            entry_time: new Date(Number(candles[trades.length]?.open_time || candle.open_time)),
            exit_time: new Date(Number(candle.open_time)),
            entry_price: entryPrice,
            exit_price: price,
            profit: profit,
            profit_percent: pnlPercent,
            exit_reason: exitReason,
          });

          position = 0;
          entryPrice = 0;
        }
      }

      // Check entry
      if (position === 0 && signals[i] && balance > 0) {
        const positionSize = balance * (strategy.position_size_percent || 100) / 100;
        position = positionSize / price;
        entryPrice = price * (1 + slippage / 100); // Account for slippage on entry
      }

      balanceHistory.push({
        timestamp: new Date(Number(candle.open_time)),
        balance: balance + (position > 0 ? position * price : 0),
      });
    }

    // Close any remaining position
    if (position > 0) {
      const lastPrice = Number(candles[candles.length - 1].close);
      const exitValue = position * lastPrice;
      const fees = (position * entryPrice * takerFee / 100) + (exitValue * takerFee / 100);
      const profit = exitValue - (position * entryPrice) - fees;
      balance += profit;

      trades.push({
        entry_time: new Date(Number(candles[candles.length - 1].open_time)),
        exit_time: new Date(Number(candles[candles.length - 1].open_time)),
        entry_price: entryPrice,
        exit_price: lastPrice,
        profit: profit,
        profit_percent: ((lastPrice - entryPrice) / entryPrice) * 100 * leverage,
        exit_reason: 'end_of_period',
      });
    }

    // Calculate metrics
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0);
    const totalProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));

    const results = {
      initial_balance: initialBalance,
      final_balance: balance,
      total_return: ((balance - initialBalance) / initialBalance) * 100,
      total_trades: trades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      profit_factor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 999 : 0,
      max_drawdown: 0, // Simplified - would need full calculation
      trades: trades,
      balance_history: balanceHistory,
    };

    console.log(`[Simple Backtest] Completed: ${trades.length} trades, ${results.win_rate.toFixed(1)}% win rate`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Simple Backtest] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
