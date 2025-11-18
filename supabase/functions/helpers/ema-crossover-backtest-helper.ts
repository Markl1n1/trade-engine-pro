// EMA Crossover Scalping Backtest Helper
import { evaluateEMACrossoverScalping, getDefaultEMACrossoverConfig, EMACrossoverConfig } from './ema-crossover-scalping-strategy.ts';
import { BaseSignal } from './strategy-interfaces.ts';

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
  exit_reason?: string;
}

export async function runEMACrossoverBacktest(
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
  corsHeaders: any,
  trailingStopPercent?: number,
  stopLossPercent?: number,
  takeProfitPercent?: number
) {
  console.log(`[EMA-CROSSOVER] Starting backtest with ${candles.length} candles`);

  let balance = initialBalance;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [];

  // Build configuration
  const config: EMACrossoverConfig = {
    ...getDefaultEMACrossoverConfig(),
    // Override with strategy-specific settings
    fast_ema_period: 9,
    slow_ema_period: 21,
    atr_period: 14,
    atr_sl_multiplier: stopLossPercent || 1.0,
    atr_tp_multiplier: (takeProfitPercent && stopLossPercent) ? takeProfitPercent / stopLossPercent : 1.5,
    use_rsi_filter: false,
    max_position_time: strategy.max_position_time || 900, // 15 minutes default
    trailing_stop_percent: trailingStopPercent || 0.75,
  };

  console.log('[EMA-CROSSOVER] Config:', config);

  // Minimum candles needed
  const minCandles = Math.max(config.slow_ema_period, config.atr_period) + 5;

  // Main backtest loop
  for (let i = minCandles; i < candles.length; i++) {
    const currentCandle = candles[i];
    const executionPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;

    // Check position exit conditions
    if (position) {
      const signal = evaluateEMACrossoverScalping(
        candles,
        i,
        config,
        true,
        position.entry_price,
        position.entry_time
      );

      if (signal.signal_type === 'SELL') {
        // Close position
        const exitPriceWithSlippage = position.type === 'buy'
          ? executionPrice * (1 - slippage / 100)
          : executionPrice * (1 + slippage / 100);

        const pnl = position.type === 'buy'
          ? position.quantity * (exitPriceWithSlippage - position.entry_price)
          : position.quantity * (position.entry_price - exitPriceWithSlippage);

        const exitNotional = position.quantity * exitPriceWithSlippage;
        const exitFee = exitNotional * (takerFee / 100);
        const entryNotional = position.quantity * position.entry_price;
        const entryFee = entryNotional * (makerFee / 100);
        const netProfit = pnl - entryFee - exitFee;

        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentCandle.open_time;
        position.profit = netProfit;
        position.exit_reason = signal.reason;

        balance += netProfit;
        trades.push(position);
        position = null;

        console.log(`[${i}] Closed position: ${signal.reason}, P&L: ${netProfit.toFixed(2)}`);
      }
    }

    // Check for entry signals
    if (!position) {
      const signal = evaluateEMACrossoverScalping(
        candles,
        i,
        config,
        false
      );

      if (signal.signal_type === 'BUY') {
        // Open new position
        const entryPriceWithSlippage = executionPrice * (1 + slippage / 100);
        
        // Position sizing: use percentage of balance
        const positionSizePercent = strategy.position_size_percent || 5;
        const positionValue = (balance * positionSizePercent / 100) * leverage;
        const quantity = positionValue / entryPriceWithSlippage;

        position = {
          entry_price: entryPriceWithSlippage,
          entry_time: currentCandle.open_time,
          type: 'buy',
          quantity: quantity
        };

        console.log(`[${i}] Opened BUY: ${signal.reason}, Entry: ${entryPriceWithSlippage.toFixed(2)}, Qty: ${quantity.toFixed(4)}`);
      } else if (signal.signal_type === 'SELL') {
        // For scalping, we typically only trade long positions
        // But the strategy supports shorts as well
        const entryPriceWithSlippage = executionPrice * (1 - slippage / 100);
        
        const positionSizePercent = strategy.position_size_percent || 5;
        const positionValue = (balance * positionSizePercent / 100) * leverage;
        const quantity = positionValue / entryPriceWithSlippage;

        position = {
          entry_price: entryPriceWithSlippage,
          entry_time: currentCandle.open_time,
          type: 'sell',
          quantity: quantity
        };

        console.log(`[${i}] Opened SELL: ${signal.reason}, Entry: ${entryPriceWithSlippage.toFixed(2)}, Qty: ${quantity.toFixed(4)}`);
      }
    }

    // Update balance and drawdown
    const currentBalance = balance;
    if (currentBalance > maxBalance) {
      maxBalance = currentBalance;
    }

    const drawdown = maxBalance > 0 ? ((maxBalance - currentBalance) / maxBalance) * 100 : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    balanceHistory.push({
      time: currentCandle.open_time,
      balance: currentBalance
    });
  }

  // Close any remaining position
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;

    const pnl = position.type === 'buy'
      ? position.quantity * (exitPrice - position.entry_price)
      : position.quantity * (position.entry_price - exitPrice);

    const exitNotional = position.quantity * exitPrice;
    const exitFee = exitNotional * (takerFee / 100);
    const entryNotional = position.quantity * position.entry_price;
    const entryFee = entryNotional * (makerFee / 100);
    const netProfit = pnl - entryFee - exitFee;

    position.exit_price = exitPrice;
    position.exit_time = lastCandle.open_time;
    position.profit = netProfit;
    position.exit_reason = 'END_OF_BACKTEST';

    balance += netProfit;
    trades.push(position);

    console.log(`[END] Closed final position, P&L: ${netProfit.toFixed(2)}`);
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

  console.log(`[EMA-CROSSOVER] Backtest complete: ${trades.length} trades, ${winRate.toFixed(1)}% win rate, PF: ${profitFactor.toFixed(2)}`);

  // Exit reason summary
  const exitSummary = trades.reduce((acc: Record<string, number>, t: Trade) => {
    const reason = t.exit_reason || 'UNKNOWN';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  console.log('[EMA-CROSSOVER] Exit reasons:', exitSummary);

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
      profit_factor: profitFactor,
      avg_win: avgWin,
      avg_loss: avgLoss,
      trades: trades,
      balance_history: balanceHistory
    });

  // Normalize trades before returning
  const { normalizeTrades } = await import('./normalize-trades.ts');
  const normalizedTrades = normalizeTrades(trades);
  
  return new Response(
    JSON.stringify({
      success: true,
      results: {
        initial_balance: initialBalance,
        final_balance: balance,
        total_return: totalReturn,
        total_trades: normalizedTrades.length,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate,
        max_drawdown: maxDrawdown,
        profit_factor: profitFactor,
        avg_win: avgWin,
        avg_loss: avgLoss,
        exit_summary: exitSummary
      },
      trades: normalizedTrades
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
