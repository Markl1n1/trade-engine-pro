// FVG Scalping Strategy Backtest Helper
import { evaluateFVGStrategy, FVGConfig, isWithinTradingWindow } from './fvg-scalping-strategy.ts';
import { getStrategyBacktestConfig } from './strategy-config-loader.ts';

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

export async function runFVGScalpingBacktest(
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
  console.log('[FVG-BACKTEST] Initializing FVG Scalping backtest...');

  let balance = initialBalance || strategy.initial_capital || 10000;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [
    { time: candles[0].open_time, balance }
  ];

  // Track multiple active FVGs (up to 3 untested FVGs)
  const activeFVGs: (any & { candleIndex: number })[] = [];
  const maxActiveFVGs = 3;

  // Get unified strategy configuration from database
  const config = getStrategyBacktestConfig(strategy, 'fvg_scalping');

  const symbol = strategy.symbol || 'BTCUSDT';

  console.log('[FVG-BACKTEST] Config:', config);
  console.log(`[FVG-BACKTEST] Analyzing ${candles.length} candles`);

  // Debugging counters
  let fvgsDetectedCount = 0;
  let retestAttempts = 0;
  let engulfmentFailures = 0;
  let engulfmentSuccess = 0;

  // Main backtest loop
  for (let i = 10; i < candles.length; i++) {
    const currentCandle = candles[i];
    
    // For crypto, trade 24/7. Only check time window for futures (not crypto)
    const isFutures = symbol.includes('ES') || symbol.includes('NQ');
    const isCrypto = symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('USDT');
    
    if (isFutures && !isCrypto) {
      const candleTime = new Date(currentCandle.open_time);
      const isInWindow = isWithinTradingWindow(candleTime, config);
      
      if (!isInWindow) {
        // Update balance history even for skipped candles
        balanceHistory.push({
          time: currentCandle.open_time,
          balance: balance
        });
        continue; // Skip candles outside 9:30-9:35 AM EST for futures only
      }
    }
    
    const currentPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;

    // Check stop loss and take profit if in position
    if (position) {
      const stopLossPrice = (position as any).stopLossPrice;
      const takeProfitPrice = (position as any).takeProfitPrice;
      let exitPrice: number | null = null;
      let exitReason = '';

      if (position.type === 'buy') {
        const slHit = currentCandle.low <= stopLossPrice;
        const tpHit = currentCandle.high >= takeProfitPrice;

        if (slHit && tpHit) {
          const distToSL = Math.abs(currentPrice - stopLossPrice);
          const distToTP = Math.abs(currentPrice - takeProfitPrice);
          if (distToSL <= distToTP) {
            exitPrice = stopLossPrice;
            exitReason = 'STOP_LOSS';
          } else {
            exitPrice = takeProfitPrice;
            exitReason = 'TAKE_PROFIT';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice;
          exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice;
          exitReason = 'TAKE_PROFIT';
        }
      } else {
        const slHit = currentCandle.high >= stopLossPrice;
        const tpHit = currentCandle.low <= takeProfitPrice;

        if (slHit && tpHit) {
          const distToSL = Math.abs(currentPrice - stopLossPrice);
          const distToTP = Math.abs(currentPrice - takeProfitPrice);
          if (distToSL <= distToTP) {
            exitPrice = stopLossPrice;
            exitReason = 'STOP_LOSS';
          } else {
            exitPrice = takeProfitPrice;
            exitReason = 'TAKE_PROFIT';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice;
          exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice;
          exitReason = 'TAKE_PROFIT';
        }
      }

      // Close position if SL/TP hit
      if (exitPrice) {
        const grossProfit =
          position.type === 'buy'
            ? (exitPrice - position.entry_price) * position.quantity
            : (position.entry_price - exitPrice) * position.quantity;

        const entryFee = (position.entry_price * position.quantity * makerFee) / 100;
        const exitFee = (exitPrice * position.quantity * takerFee) / 100;
        const netProfit = grossProfit - entryFee - exitFee;

        balance += netProfit;

        const completedTrade: Trade = {
          ...position,
          exit_price: exitPrice,
          exit_time: currentCandle.open_time,
          profit: netProfit,
          exit_reason: exitReason
        };

        trades.push(completedTrade);
        console.log(
          `[FVG-BACKTEST] ${exitReason}: ${position.type.toUpperCase()} @ ${exitPrice.toFixed(2)}, Profit: ${netProfit.toFixed(2)}`
        );

        // Reset all FVG zones after position close to prevent duplicate entries
        activeFVGs.length = 0;
        console.log(`[FVG-BACKTEST] 🔄 Reset all FVG zones after position close`);
        position = null;
      }
    }

    // Check ALL active FVGs for retest
    if (!position) {
      // Remove stale FVGs and check for retests
      for (let j = activeFVGs.length - 1; j >= 0; j--) {
        const fvg = activeFVGs[j];
        
        // Remove stale FVGs (older than 50 candles)
        if (i - fvg.candleIndex > 50) {
          console.log(`[FVG-BACKTEST] 🗑️ Removing stale ${fvg.type} FVG from candle ${fvg.candleIndex} (age: ${i - fvg.candleIndex} candles)`);
          activeFVGs.splice(j, 1);
          continue;
        }
        
        // Check if current candle retests this FVG
        const { detectRetestCandle, checkEngulfment, calculateEntry, calculateConfidence } = await import('./fvg-scalping-strategy.ts');
        
        if (detectRetestCandle(fvg, currentCandle)) {
          retestAttempts++;
          console.log(`[FVG-BACKTEST] 🎯 Retest attempt #${retestAttempts} at candle ${i} for ${fvg.type} FVG (${fvg.bottom.toFixed(2)}-${fvg.top.toFixed(2)})`);
          
          const hasEngulfment = checkEngulfment(currentCandle, fvg);
          
          if (!hasEngulfment) {
            engulfmentFailures++;
            console.log(`[FVG-BACKTEST] ❌ Engulfment FAILED (total failures: ${engulfmentFailures}). Close: ${currentCandle.close.toFixed(2)}, Need: ${fvg.type === 'bullish' ? '>' : '<'} ${fvg.type === 'bullish' ? fvg.top.toFixed(2) : fvg.bottom.toFixed(2)}`);
          }
          
          if (hasEngulfment) {
            engulfmentSuccess++;
            console.log(`[FVG-BACKTEST] ✅ Engulfment SUCCESS #${engulfmentSuccess}`);

            console.log(`[FVG-BACKTEST] Retest confirmed at candle ${i} for ${fvg.type} FVG from candle ${fvg.candleIndex}`);
            
            const { entry, stopLoss, takeProfit } = calculateEntry(currentCandle, fvg, config);
            const confidence = calculateConfidence(fvg, currentCandle);
            
            const entryPrice = entry * (1 + (fvg.type === 'bullish' ? slippage : -slippage) / 100);
            const positionSizePercent = strategy.position_size_percent || 100;
            const positionValue = (balance * positionSizePercent) / 100;
            const quantity = productType === 'futures'
              ? (positionValue * leverage) / entryPrice
              : positionValue / entryPrice;

            if (quantity > 0) {
              position = {
                entry_price: entryPrice,
                entry_time: currentCandle.open_time,
                type: fvg.type === 'bullish' ? 'buy' : 'sell',
                quantity: quantity,
              };

              // Set SL and TP
              (position as any).stopLossPrice = stopLoss;
              (position as any).takeProfitPrice = takeProfit;

              console.log(
                `[FVG-BACKTEST] ENTRY: ${position.type.toUpperCase()} @ ${entryPrice.toFixed(2)}, SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)}, Confidence: ${confidence.toFixed(1)}%`
              );
              
              // Remove tested FVG
              activeFVGs.splice(j, 1);
              break; // Only one entry per candle
            }
          }
        }
      }
      
      // Detect NEW FVGs if no position and room for more
      if (!position && activeFVGs.length < maxActiveFVGs) {
        const { detectFairValueGap } = await import('./fvg-scalping-strategy.ts');
        const recentCandles = candles.slice(Math.max(0, i - 10), i + 1).map(c => ({
          ...c,
          timestamp: c.open_time  // Add timestamp field
        }));
        
        console.log(`[FVG-BACKTEST] 🔍 Checking candle ${i}/${candles.length} for FVG (${activeFVGs.length}/${maxActiveFVGs} active)`);
        const newFVG = detectFairValueGap(recentCandles);
        
        if (newFVG) {
          fvgsDetectedCount++;
          const fvgWithIndex = { ...newFVG, candleIndex: i };
          activeFVGs.push(fvgWithIndex);
          console.log(`[FVG-BACKTEST] 🆕 FVG #${fvgsDetectedCount} DETECTED at candle ${i}/${candles.length}: ${newFVG.type.toUpperCase()} ${newFVG.bottom.toFixed(2)}-${newFVG.top.toFixed(2)} (gap: ${(newFVG.top - newFVG.bottom).toFixed(4)}, ${((newFVG.top - newFVG.bottom) / currentCandle.close * 100).toFixed(3)}%)`);
        }
      }
    }

    // Update balance history
    balanceHistory.push({
      time: currentCandle.open_time,
      balance: balance
    });

    // Update max drawdown
    if (balance > maxBalance) {
      maxBalance = balance;
    }
    const drawdown = (maxBalance - balance) / maxBalance;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Close any open position at the end
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = executionTiming === 'open' ? lastCandle.open : lastCandle.close;
    const grossProfit =
      position.type === 'buy'
        ? (exitPrice - position.entry_price) * position.quantity
        : (position.entry_price - exitPrice) * position.quantity;

    const entryFee = (position.entry_price * position.quantity * makerFee) / 100;
    const exitFee = (exitPrice * position.quantity * takerFee) / 100;
    const netProfit = grossProfit - entryFee - exitFee;

    balance += netProfit;

    trades.push({
      ...position,
      exit_price: exitPrice,
      exit_time: lastCandle.open_time,
      profit: netProfit,
      exit_reason: 'END_OF_DATA'
    });
  }

  // Calculate statistics
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winningTrades = trades.filter(t => (t.profit || 0) > 0).length;
  const losingTrades = trades.filter(t => (t.profit || 0) <= 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  const profits = trades.map(t => t.profit || 0);
  const wins = profits.filter(p => p > 0);
  const losses = profits.filter(p => p < 0);

  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

  const totalWins = wins.reduce((a, b) => a + b, 0);
  const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

  // Print backtest summary
  console.log(`[FVG-BACKTEST] 📊 BACKTEST SUMMARY:
  ==========================================
  🔍 FVGs Detected: ${fvgsDetectedCount}
  🎯 Retest Attempts: ${retestAttempts}
  ✅ Engulfment Success: ${engulfmentSuccess}
  ❌ Engulfment Failures: ${engulfmentFailures}
  📈 Trades Executed: ${trades.length}
  💰 Win Rate: ${winRate.toFixed(1)}%
  💵 Profit Factor: ${profitFactor.toFixed(2)}
  📉 Max Drawdown: ${(maxDrawdown * 100).toFixed(2)}%
  🎲 Total Return: ${totalReturn.toFixed(2)}%
  ==========================================`);

  const results = {
    initial_balance: initialBalance,
    final_balance: balance,
    total_return: totalReturn,
    total_trades: trades.length,
    winning_trades: winningTrades,
    losing_trades: losingTrades,
    win_rate: winRate,
    avg_win: avgWin,
    avg_loss: avgLoss,
    max_drawdown: maxDrawdown * 100,
    profit_factor: profitFactor,
    sharpe_ratio: 0, // Simplified for now
    trades: trades,
    balance_history: balanceHistory
  };

  console.log(`[FVG-BACKTEST] Complete: ${trades.length} trades, Win Rate: ${winRate.toFixed(1)}%, PF: ${profitFactor.toFixed(2)}`);

  // Save results to database
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
      trades: results.trades,
      balance_history: results.balance_history
    });

  if (insertError) {
    console.error('[FVG-BACKTEST] Error saving results:', insertError);
  }

  return new Response(
    JSON.stringify({
      success: true,
      results: {
        ...results,
        strategy_name: strategy.name,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        start_date: startDate,
        end_date: endDate
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
