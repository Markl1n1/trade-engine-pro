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

// Simple EMA calculation
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prevEMA = data[0];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(data[i]);
    } else {
      const currentEMA = data[i] * k + prevEMA * (1 - k);
      ema.push(currentEMA);
      prevEMA = currentEMA;
    }
  }

  return ema;
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

    // Check if MSTG strategy - do this BEFORE trying to fetch conditions
    const isMSTG = strategy.strategy_type === 'market_sentiment_trend_gauge';

    // Fetch conditions (only required for non-MSTG strategies)
    const { data: conditions } = await supabaseClient
      .from('strategy_conditions')
      .select('*')
      .eq('strategy_id', strategyId)
      .order('order_index', { ascending: true });

    // Only validate conditions for non-MSTG strategies
    if (!isMSTG && (!conditions || conditions.length === 0)) {
      throw new Error('No conditions defined');
    }

    // Pre-calculate all indicators (vectorized)
    const closes = candles.map(c => Number(c.close));
    const highs = candles.map(c => Number(c.high));
    const lows = candles.map(c => Number(c.low));
    
    const indicatorCache: Record<string, number[]> = {};

    // Calculate unique indicators (only for non-MSTG strategies)
    if (!isMSTG && conditions) {
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
        } else if (type === 'EMA') {
          indicatorCache[key] = calculateEMA(closes, period);
        }
      });
    }

    // Initialize signal arrays
    const signals: boolean[] = new Array(candles.length).fill(false);
    const exitSignals: boolean[] = new Array(candles.length).fill(false);

    if (isMSTG) {
      console.log('[Simple Backtest] Running MSTG strategy');
      
      // Calculate MSTG components
      const rsi = calculateRSI(closes, 14);
      console.log(`[MSTG Debug] RSI calculated, first valid values: ${rsi.slice(20, 25).map(v => v.toFixed(2)).join(', ')}`);
      
      const momentum = rsi.map(v => isNaN(v) ? NaN : (v - 50) * 2); // Normalize to [-100, 100]
      console.log(`[MSTG Debug] Momentum calculated, first valid values: ${momentum.slice(20, 25).map(v => isNaN(v) ? 'NaN' : v.toFixed(2)).join(', ')}`);
      
      // Trend: EMA10 vs EMA21
      const ema10 = calculateEMA(closes, 10);
      const ema21 = calculateEMA(closes, 21);
      const trendRaw = ema10.map((v, i) => v - ema21[i]);
      
      // Simple normalization for trend - filter out NaN values
      const validTrendValues = trendRaw.filter(v => !isNaN(v) && isFinite(v));
      const trendMin = validTrendValues.length > 0 ? Math.min(...validTrendValues) : 0;
      const trendMax = validTrendValues.length > 0 ? Math.max(...validTrendValues) : 100;
      const trendRange = trendMax - trendMin || 1; // Avoid division by zero
      const trend = trendRaw.map(v => isNaN(v) ? NaN : ((v - trendMin) / trendRange) * 200 - 100);
      console.log(`[MSTG Debug] Trend calculated, first valid values: ${trend.slice(20, 25).map(v => isNaN(v) ? 'NaN' : v.toFixed(2)).join(', ')}`);
      
      // Volatility: Simple BB position (0 to 1)
      const sma20 = calculateSMA(closes, 20);
      const volatility = closes.map((c, i) => {
        if (i < 19) return NaN;
        const slice = closes.slice(i - 19, i + 1);
        const mean = sma20[i];
        if (isNaN(mean)) return NaN;
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / 20;
        const stdDev = Math.sqrt(variance);
        const upper = mean + 2 * stdDev;
        const lower = mean - 2 * stdDev;
        const range = upper - lower;
        return range === 0 ? 0.5 : Math.max(0, Math.min(1, (c - lower) / range));
      });
      console.log(`[MSTG Debug] Volatility calculated, first valid values: ${volatility.slice(20, 25).map(v => isNaN(v) ? 'NaN' : v.toFixed(2)).join(', ')}`);
      
      // Relative strength: Asset vs benchmark (simplified - use asset momentum)
      const relativeStrength = momentum; // Simplified for now
      
      // Calculate TS score
      const weights = {
        wM: 0.25,
        wT: 0.35,
        wV: 0.20,
        wR: 0.20,
      };
      
      const tsRaw = momentum.map((m, i) => {
        if (isNaN(m) || isNaN(trend[i]) || isNaN(volatility[i]) || isNaN(relativeStrength[i])) {
          return NaN;
        }
        return weights.wM * m + 
               weights.wT * trend[i] + 
               weights.wV * (volatility[i] * 200 - 100) + 
               weights.wR * relativeStrength[i];
      });
      
      // Count valid TS values before smoothing
      const validTsRaw = tsRaw.filter(v => !isNaN(v));
      console.log(`[MSTG Debug] TS Raw calculated, ${validTsRaw.length} valid values out of ${tsRaw.length}`);
      if (validTsRaw.length > 0) {
        console.log(`[MSTG Debug] TS Raw range: ${Math.min(...validTsRaw).toFixed(2)} to ${Math.max(...validTsRaw).toFixed(2)}`);
        console.log(`[MSTG Debug] First valid TS Raw values: ${tsRaw.slice(20, 30).filter(v => !isNaN(v)).map(v => v.toFixed(2)).join(', ')}`);
      }
      
      // Apply EMA_5 smoothing
      const tsScore = calculateEMA(tsRaw, 5);
      const validTs = tsScore.filter(v => !isNaN(v));
      console.log(`[MSTG Debug] TS Score (smoothed) calculated, ${validTs.length} valid values`);
      if (validTs.length > 0) {
        console.log(`[MSTG Debug] TS Score range: ${Math.min(...validTs).toFixed(2)} to ${Math.max(...validTs).toFixed(2)}`);
        console.log(`[MSTG Debug] First valid TS Scores: ${tsScore.slice(50, 60).filter(v => !isNaN(v)).map(v => v.toFixed(2)).join(', ')}`);
      }
      
      // Generate signals based on TS thresholds
      const longThreshold = 30;
      const shortThreshold = -30;
      const exitThreshold = 0;
      
      console.log(`[MSTG Debug] Using thresholds: Long=${longThreshold}, Short=${shortThreshold}, Exit=${exitThreshold}`);
      
      let signalCount = 0;
      let exitSignalCount = 0;
      
      for (let i = 50; i < candles.length; i++) {
        const ts = tsScore[i - 1];
        if (isNaN(ts)) continue;
        
        if (ts > longThreshold) {
          signals[i] = true;
          signalCount++;
        }
        if (ts < exitThreshold) {
          exitSignals[i] = true;
          exitSignalCount++;
        }
      }
      
      console.log(`[MSTG Debug] Generated ${signalCount} entry signals and ${exitSignalCount} exit signals`);
    } else {
      // Original simple signal logic for non-MSTG strategies
      if (!conditions) {
        throw new Error('No conditions available for non-MSTG strategy');
      }
      
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
