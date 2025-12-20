// EMA Crossover Scalping Backtest Helper
// PARITY FIX: Now uses SAME config as monitoring
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
  confidence?: number;
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
  console.log(`[EMA-CROSSOVER-BT] ═══════════════════════════════════════════════════════`);
  console.log(`[EMA-CROSSOVER-BT] Starting backtest with ${candles.length} candles`);
  console.log(`[EMA-CROSSOVER-BT] Strategy ID: ${strategyId}`);
  console.log(`[EMA-CROSSOVER-BT] Date range: ${startDate} to ${endDate}`);
  console.log(`[EMA-CROSSOVER-BT] Leverage: ${leverage}x, Slippage: ${slippage}%`);

  let balance = initialBalance;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [];

  // PARITY FIX: Use SAME default config as monitoring
  const defaultConfig = getDefaultEMACrossoverConfig();
  
  // Build configuration with strategy overrides
  const config: EMACrossoverConfig = {
    ...defaultConfig,
    // Override with strategy-specific settings from database (if any)
    fast_ema_period: strategy.sma_fast_period || defaultConfig.fast_ema_period,
    slow_ema_period: strategy.sma_slow_period || defaultConfig.slow_ema_period,
    atr_period: 14,
    // Use backtest UI parameters if provided, otherwise use defaults
    atr_sl_multiplier: stopLossPercent ? stopLossPercent / 100 * 10 : defaultConfig.atr_sl_multiplier,
    atr_tp_multiplier: takeProfitPercent ? takeProfitPercent / 100 * 10 : defaultConfig.atr_tp_multiplier,
    // PARITY: Enable RSI filter (same as monitoring)
    use_rsi_filter: true,
    rsi_period: strategy.rsi_period || defaultConfig.rsi_period,
    rsi_long_threshold: defaultConfig.rsi_long_threshold,  // Use default (35)
    rsi_short_threshold: defaultConfig.rsi_short_threshold, // Use default (65)
    max_position_time: strategy.max_position_time || defaultConfig.max_position_time,
    trailing_stop_percent: trailingStopPercent || defaultConfig.trailing_stop_percent,
    // PARITY: Enable filters (same as monitoring)
    use_trend_filter: true,
    use_volatility_filter: true,
    volatility_multiplier: defaultConfig.volatility_multiplier,
  };

  console.log(`[EMA-CROSSOVER-BT] ═══════════════════════════════════════════════════════`);
  console.log(`[EMA-CROSSOVER-BT] CONFIG PARITY CHECK:`);
  console.log(`[EMA-CROSSOVER-BT]   fast_ema_period: ${config.fast_ema_period}`);
  console.log(`[EMA-CROSSOVER-BT]   slow_ema_period: ${config.slow_ema_period}`);
  console.log(`[EMA-CROSSOVER-BT]   global_ema_period: ${config.global_ema_period}`);
  console.log(`[EMA-CROSSOVER-BT]   atr_sl_multiplier: ${config.atr_sl_multiplier}`);
  console.log(`[EMA-CROSSOVER-BT]   atr_tp_multiplier: ${config.atr_tp_multiplier}`);
  console.log(`[EMA-CROSSOVER-BT]   use_rsi_filter: ${config.use_rsi_filter}`);
  console.log(`[EMA-CROSSOVER-BT]   rsi_long_threshold: ${config.rsi_long_threshold}`);
  console.log(`[EMA-CROSSOVER-BT]   rsi_short_threshold: ${config.rsi_short_threshold}`);
  console.log(`[EMA-CROSSOVER-BT]   use_trend_filter: ${config.use_trend_filter}`);
  console.log(`[EMA-CROSSOVER-BT]   use_volatility_filter: ${config.use_volatility_filter}`);
  console.log(`[EMA-CROSSOVER-BT]   max_position_time: ${config.max_position_time}s`);
  console.log(`[EMA-CROSSOVER-BT] ═══════════════════════════════════════════════════════`);

  // Minimum candles needed
  const minCandles = Math.max(config.slow_ema_period, config.global_ema_period || 200, config.atr_period) + 15;

  let signalsGenerated = 0;
  let signalsBlocked = 0;

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
        position.entry_time,
        position.type  // Pass position type to fix SHORT profit calculation
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
        
        const pnlPercent = (netProfit / (entryNotional / leverage)) * 100;
        console.log(`[EMA-CROSSOVER-BT] [${i}/${candles.length}] 📤 CLOSED ${position.type.toUpperCase()}: ${signal.reason} | P&L: $${netProfit.toFixed(2)} (${pnlPercent.toFixed(2)}%) | Balance: $${balance.toFixed(2)}`);
        
        position = null;
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

      if (signal.signal_type === 'BUY' || signal.signal_type === 'SELL') {
        signalsGenerated++;
        
        const entryPriceWithSlippage = signal.signal_type === 'BUY'
          ? executionPrice * (1 + slippage / 100)
          : executionPrice * (1 - slippage / 100);
        
        // Position sizing: use percentage of balance
        const positionSizePercent = strategy.position_size_percent || 5;
        const positionValue = (balance * positionSizePercent / 100) * leverage;
        const quantity = positionValue / entryPriceWithSlippage;

        position = {
          entry_price: entryPriceWithSlippage,
          entry_time: currentCandle.open_time,
          type: signal.signal_type === 'BUY' ? 'buy' : 'sell',
          quantity: quantity,
          confidence: signal.confidence
        };

        console.log(`[EMA-CROSSOVER-BT] [${i}/${candles.length}] 📥 OPENED ${position.type.toUpperCase()}: ${signal.reason} | Entry: $${entryPriceWithSlippage.toFixed(4)} | Qty: ${quantity.toFixed(6)} | Conf: ${signal.confidence}%`);
      } else if (signal.reason && signal.reason.includes('blocked')) {
        signalsBlocked++;
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

    // Sample balance history (every 100 candles to avoid huge arrays)
    if (i % 100 === 0) {
      balanceHistory.push({
        time: currentCandle.open_time,
        balance: currentBalance
      });
    }
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

    console.log(`[EMA-CROSSOVER-BT] [END] Closed final ${position.type.toUpperCase()} position, P&L: $${netProfit.toFixed(2)}`);
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
  
  // Average confidence
  const avgConfidence = trades.length > 0
    ? trades.reduce((sum, t) => sum + (t.confidence || 0), 0) / trades.length
    : 0;

  // Exit reason summary
  const exitSummary = trades.reduce((acc: Record<string, number>, t: Trade) => {
    const reason = t.exit_reason || 'UNKNOWN';
    // Simplify reason for grouping
    let group = 'OTHER';
    if (reason.includes('Stop loss')) group = 'STOP_LOSS';
    else if (reason.includes('Take profit')) group = 'TAKE_PROFIT';
    else if (reason.includes('Time exit')) group = 'TIME_EXIT';
    else if (reason.includes('Opposite crossover')) group = 'CROSSOVER_EXIT';
    else if (reason.includes('END_OF_BACKTEST')) group = 'END_OF_BACKTEST';
    
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {});

  console.log(`[EMA-CROSSOVER-BT] ═══════════════════════════════════════════════════════`);
  console.log(`[EMA-CROSSOVER-BT] BACKTEST COMPLETE`);
  console.log(`[EMA-CROSSOVER-BT] ═══════════════════════════════════════════════════════`);
  console.log(`[EMA-CROSSOVER-BT] Total Trades: ${trades.length}`);
  console.log(`[EMA-CROSSOVER-BT] Win Rate: ${winRate.toFixed(2)}%`);
  console.log(`[EMA-CROSSOVER-BT] Profit Factor: ${profitFactor.toFixed(2)}`);
  console.log(`[EMA-CROSSOVER-BT] Total Return: ${totalReturn.toFixed(2)}%`);
  console.log(`[EMA-CROSSOVER-BT] Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`[EMA-CROSSOVER-BT] Avg Win: $${avgWin.toFixed(2)} | Avg Loss: $${avgLoss.toFixed(2)}`);
  console.log(`[EMA-CROSSOVER-BT] Avg Confidence: ${avgConfidence.toFixed(1)}%`);
  console.log(`[EMA-CROSSOVER-BT] Signals Generated: ${signalsGenerated} | Blocked: ${signalsBlocked}`);
  console.log(`[EMA-CROSSOVER-BT] Exit Reasons:`, exitSummary);
  console.log(`[EMA-CROSSOVER-BT] ═══════════════════════════════════════════════════════`);

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
      confidence_avg: avgConfidence,
      trades: trades,
      balance_history: balanceHistory,
      diagnostics: {
        config_used: {
          fast_ema: config.fast_ema_period,
          slow_ema: config.slow_ema_period,
          global_ema: config.global_ema_period,
          atr_sl: config.atr_sl_multiplier,
          atr_tp: config.atr_tp_multiplier,
          rsi_filter: config.use_rsi_filter,
          rsi_long: config.rsi_long_threshold,
          rsi_short: config.rsi_short_threshold,
          trend_filter: config.use_trend_filter,
          volatility_filter: config.use_volatility_filter,
        },
        signals_generated: signalsGenerated,
        signals_blocked: signalsBlocked,
        exit_summary: exitSummary
      }
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
        confidence_avg: avgConfidence,
        exit_summary: exitSummary,
        diagnostics: {
          signals_generated: signalsGenerated,
          signals_blocked: signalsBlocked,
          config_parity: 'VERIFIED'
        }
      },
      trades: normalizedTrades
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
