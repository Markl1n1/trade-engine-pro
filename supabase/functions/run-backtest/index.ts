import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { backtestSchema, validateInput } from '../helpers/input-validation.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as indicators from "../indicators/all-indicators.ts";
import { evaluateATHGuardStrategy } from '../helpers/ath-guard-strategy.ts';
import { evaluateSMACrossoverStrategy, defaultSMACrossoverConfig } from '../helpers/sma-crossover-strategy.ts';
import { evaluateMTFMomentum } from '../helpers/mtf-momentum-strategy.ts';
import { EnhancedBacktestEngine } from '../helpers/backtest-engine.ts';
import { getBybitConstraints, getBinanceConstraints } from '../helpers/exchange-constraints.ts';
import { detectMarketRegime, isStrategySuitableForRegime, getRegimePositionAdjustment } from '../helpers/market-regime-detector.ts';
import { calculateOptimalPositionSize, getDefaultPositionSizingConfig } from '../helpers/position-sizer.ts';
import { getAdaptiveParameters, getDefaultAdaptiveConfig } from '../helpers/adaptive-parameters.ts';
// Enhanced imports
import { UnifiedBacktestEngine } from '../helpers/unified-backtest-engine.ts';
import { AdaptiveStrategyManager, defaultAdaptiveParameters } from '../helpers/adaptive-strategy-manager.ts';
import { EnhancedReporting } from '../helpers/enhanced-reporting.ts';
import { BaseConfig, BacktestConfig, MarketRegime } from '../helpers/strategy-interfaces.ts';
import { runFVGScalpingBacktest } from '../helpers/fvg-backtest-helper.ts';
import { getStrategyBacktestConfig } from '../helpers/strategy-config-loader.ts';
import { runEMACrossoverBacktest } from '../helpers/ema-crossover-backtest-helper.ts';
import { normalizeTrades } from '../helpers/normalize-trades.ts';

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

// Helper function for MTF Momentum volume calculation
function calculateVolumeSMA(candles: any[], period: number): number {
  if (candles.length < period) return 0;
  const sum = candles.slice(-period).reduce((acc, c) => acc + c.volume, 0);
  return sum / period;
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
  const hours = nyTime.getUTCHours();
  const minutes = nyTime.getUTCMinutes();
  const currentMinutes = hours * 60 + minutes;
  
  const [startHours, startMins] = sessionStart.split(':').map(Number);
  const [endHours, endMins] = sessionEnd.split(':').map(Number);
  const startMinutes = startHours * 60 + startMins;
  const endMinutes = endHours * 60 + endMins;
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

function getIntervalMs(timeframe: string): number {
  const unit = timeframe.slice(-1);
  const value = parseInt(timeframe.slice(0, -1));
  
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 60 * 1000; // Default to 1 minute
  }
}

async function runATHGuardBacktest(strategy: any, candles: Candle[], initialBalance: number, productType: string, leverage: number, makerFee: number, takerFee: number, slippage: number, executionTiming: string, supabaseClient: any, strategyId: string, startDate: string, endDate: string, corsHeaders: any, trailingStopPercent?: number, stopLossPercent?: number, takeProfitPercent?: number) {
  console.log(`[ATH-GUARD] Starting optimized backtest for ${candles.length} candles`);
  
  let balance = initialBalance;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;

  // Exchange constraints
  const { stepSize, minQty, minNotional } = getBybitConstraints(strategy.symbol);

  // Get unified strategy configuration from database
  const athGuardConfig = getStrategyBacktestConfig(strategy, 'ath_guard_scalping');

  // Pre-calculate all indicators once (CPU optimization)
  console.log(`[ATH-GUARD] Pre-calculating indicators...`);
  const closes = candles.map(c => c.close);
  
  const ema50Array = calculateEMA(closes, 50);
  const ema100Array = calculateEMA(closes, 100);
  const ema150Array = calculateEMA(closes, 150);
  const vwapArray = calculateVWAP(candles);
  const macdData = calculateMACD(closes);
  const stochData = calculateStochastic(candles, 14);
  const rsiArray = calculateRSI(closes, 14);
  const atrArray = calculateATR(candles, 14);
  
  console.log(`[ATH-GUARD] Indicators ready, processing ${candles.length} candles`);

  // Initialize Trailing Stop Manager if configured
  let trailingStopManager: any = null;
  if (trailingStopPercent && trailingStopPercent > 0) {
    trailingStopManager = {
      maxProfitPercent: 0,
      trailingPercent: trailingStopPercent,
      isActive: false,
      entryPrice: 0,
      positionType: 'buy' as 'buy' | 'sell',
      
      initialize(entryPrice: number, positionType: 'buy' | 'sell'): void {
        this.entryPrice = entryPrice;
        this.positionType = positionType;
        this.maxProfitPercent = 0;
        this.isActive = false;
        // Reduced logging for CPU optimization
      },
      
      checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string } {
        if (!this.isActive) {
          const currentProfitPercent = this.calculateProfitPercent(currentPrice);
          if (currentProfitPercent > 0) {
            this.isActive = true;
            this.maxProfitPercent = currentProfitPercent;
            return { shouldClose: false, reason: 'TRAILING_ACTIVATED' };
          }
          return { shouldClose: false, reason: 'NO_PROFIT_YET' };
        }
        
        const currentProfitPercent = this.calculateProfitPercent(currentPrice);
        if (currentProfitPercent > this.maxProfitPercent) {
          this.maxProfitPercent = currentProfitPercent;
          // Reduced logging for CPU optimization
        }
        
        const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
        
        if (currentProfitPercent < trailingThreshold) {
          return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED' };
        }
        
        return { shouldClose: false, reason: 'TRAILING_ACTIVE' };
      },
      
      calculateProfitPercent(currentPrice: number): number {
        if (this.positionType === 'buy') {
          return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
        } else {
          return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
        }
      },
      
      reset(): void {
        this.maxProfitPercent = 0;
        this.isActive = false;
        this.entryPrice = 0;
      }
    };
  }

  // Main backtest loop - now just evaluates conditions
  for (let i = 150; i < candles.length; i++) {
    // ✅ Direct indicator access (O(1) instead of O(n))
    const currentCandle = candles[i];
    const executionPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
    
    const currentEMA50 = ema50Array[i];
    const currentEMA100 = ema100Array[i];
    const currentEMA150 = ema150Array[i];
    const currentVWAP = vwapArray[i];
    const currentMACD = macdData.histogram[i];
    const currentStoch = stochData.k[i];
    const currentRSI = rsiArray[i];
    const currentATR = atrArray[i];
    
    // Simplified bias filter
    const bias = executionPrice > currentEMA150 ? 'LONG' : 
                  executionPrice < currentEMA150 ? 'SHORT' : 'NEUTRAL';
    
    // Volume confirmation
    const volumeAvg = candles.slice(Math.max(0, i - 20), i).reduce((sum, c) => sum + c.volume, 0) / Math.min(20, i);
    const volumeConfirmed = currentCandle.volume >= volumeAvg * athGuardConfig.volume_multiplier;
    
    // ADX confirmation (simple approximation)
    const adxConfirmed = Math.abs(currentEMA50 - currentEMA100) / currentEMA100 * 100 > 1;
    
    // Momentum confirmation
    const momentumConfirmed = currentMACD !== 0 && ((bias === 'LONG' && currentMACD > 0) || (bias === 'SHORT' && currentMACD < 0));
    
    // Check SL/TP first (priority over trailing stop)
    if (position) {
      // Check max position time (from strategy config) - synchronized with real-time monitoring
      const maxPositionTimeMs = (athGuardConfig.max_position_time || 480) * 60 * 1000; // Convert minutes to ms
      const positionDuration = currentCandle.open_time - position.entry_time;
      
      if (positionDuration >= maxPositionTimeMs) {
        // Time-based exit
        const exitPriceWithSlippage = position.type === 'buy'
          ? executionPrice * (1 - slippage)
          : executionPrice * (1 + slippage);
        
        const pnl = position.type === 'buy'
          ? position.quantity * (exitPriceWithSlippage - position.entry_price)
          : position.quantity * (position.entry_price - exitPriceWithSlippage);
        
        const exitNotional = position.quantity * exitPriceWithSlippage;
        const exitFee = (exitNotional * takerFee) / 100;
        const entryFee = (position as any).entryFee || 0;
        const netProfit = pnl - entryFee - exitFee;
        
        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentCandle.open_time;
        position.profit = netProfit;
        (position as any).exit_reason = `MAX_TIME_EXIT (${athGuardConfig.max_position_time} min)`;
        
        if (productType === 'futures') {
          const marginLocked = (position as any).marginLocked || 0;
          balance += marginLocked + netProfit;
        } else {
          balance += netProfit;
        }
        
        trades.push(position);
        position = null;
        
        if (trailingStopManager) {
          trailingStopManager.reset();
        }
        
        continue;
      }
      
      const stopLossPrice = (position as any).stopLossPrice;
      const takeProfitPrice = (position as any).takeProfitPrice;
      
      let exitPrice: number | null = null;
      let exitReason = '';
      
      if (position.type === 'buy') {
        const slHit = currentCandle.low <= stopLossPrice;
        const tpHit = currentCandle.high >= takeProfitPrice;
        
        if (slHit && tpHit) {
          const distToSL = Math.abs(executionPrice - stopLossPrice);
          const distToTP = Math.abs(executionPrice - takeProfitPrice);
          if (distToSL <= distToTP) {
            exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
          } else {
            exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
        }
      } else {
        const slHit = currentCandle.high >= stopLossPrice;
        const tpHit = currentCandle.low <= takeProfitPrice;
        
        if (slHit && tpHit) {
          const distToSL = Math.abs(executionPrice - stopLossPrice);
          const distToTP = Math.abs(executionPrice - takeProfitPrice);
          if (distToSL <= distToTP) {
            exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
          } else {
            exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
        }
      }
      
      if (exitPrice) {
        const exitPriceWithSlippage = position.type === 'buy'
          ? exitPrice * (1 - slippage)
          : exitPrice * (1 + slippage);
        
        const pnl = position.type === 'buy'
          ? position.quantity * (exitPriceWithSlippage - position.entry_price)
          : position.quantity * (position.entry_price - exitPriceWithSlippage);
        
        const exitNotional = position.quantity * exitPriceWithSlippage;
        const exitFee = (exitNotional * takerFee) / 100;
        const entryFee = (position as any).entryFee || 0;
        const netProfit = pnl - entryFee - exitFee;
        
        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentCandle.open_time;
        position.profit = netProfit;
        
        if (productType === 'futures') {
          const marginLocked = (position as any).marginLocked || 0;
          balance += marginLocked + netProfit;
        } else {
          balance += netProfit;
        }
        
        trades.push(position);
        position = null;
        
        if (trailingStopManager) {
          trailingStopManager.reset();
        }
        
        continue;
      }
      
      // Check trailing stop (secondary)
      if (trailingStopManager) {
        const trailingResult = trailingStopManager.checkTrailingStop(executionPrice);
        if (trailingResult.shouldClose) {
          const exitPriceWithSlippage = position.type === 'buy'
            ? executionPrice * (1 - slippage)
            : executionPrice * (1 + slippage);
          
          const pnl = position.type === 'buy'
            ? position.quantity * (exitPriceWithSlippage - position.entry_price)
            : position.quantity * (position.entry_price - exitPriceWithSlippage);
          
          const exitNotional = position.quantity * exitPriceWithSlippage;
          const exitFee = (exitNotional * takerFee) / 100;
          const entryFee = (position as any).entryFee || 0;
          const netProfit = pnl - entryFee - exitFee;
          
          position.exit_price = exitPriceWithSlippage;
          position.exit_time = currentCandle.open_time;
          position.profit = netProfit;
          
          if (productType === 'futures') {
            const marginLocked = (position as any).marginLocked || 0;
            balance += marginLocked + netProfit;
          } else {
            balance += netProfit;
          }
          
          trades.push(position);
          position = null;
          trailingStopManager.reset();
          
          continue;
        }
      }
    }

    // BUY signal: LONG bias + confirmations
    const buySignal = bias === 'LONG' && volumeConfirmed && adxConfirmed && momentumConfirmed && 
                      currentRSI < athGuardConfig.rsi_threshold;
    
    if (buySignal && !position) {
      // Position sizing (corrected to match Bybit logic)
      const positionSizePercent = strategy.position_size_percent || 100;
      const positionSizeUSD = balance * (positionSizePercent / 100);
      
      // Calculate entry price with slippage
      const entryPriceWithSlippage = executionPrice * (1 + slippage);
      
      // Correct calculation: notional = positionSize * leverage, then quantity = notional / price
      let notional: number;
      let quantity: number;
      let marginRequired: number;
      
      if (productType === 'futures') {
        notional = positionSizeUSD * leverage;
        quantity = notional / entryPriceWithSlippage;
        marginRequired = notional / leverage;
      } else {
        notional = positionSizeUSD;
        quantity = notional / entryPriceWithSlippage;
        marginRequired = notional;
      }
      
      quantity = Math.floor(quantity / stepSize) * stepSize;
      
      // Recalculate notional after rounding quantity
      const entryNotional = quantity * entryPriceWithSlippage;
      
      if (productType === 'futures') {
        marginRequired = entryNotional / leverage;
      }
      
      if (quantity >= minQty && entryNotional >= minNotional) {
        
        if (marginRequired <= balance) {
          // Calculate SL/TP based on user parameters
          const slPercent = stopLossPercent || strategy.stop_loss_percent || 2.0;
          const tpPercent = takeProfitPercent || strategy.take_profit_percent || 4.0;
          
          const stopLossPrice = entryPriceWithSlippage * (1 - slPercent / 100);
          const takeProfitPrice = entryPriceWithSlippage * (1 + tpPercent / 100);
          
          const entryFee = (entryNotional * makerFee) / 100;
          
          position = { 
            entry_price: entryPriceWithSlippage, 
            entry_time: currentCandle.open_time, 
            type: 'buy', 
            quantity 
          };
          
          // Store SL/TP and fees in position metadata
          (position as any).stopLossPrice = stopLossPrice;
          (position as any).takeProfitPrice = takeProfitPrice;
          (position as any).entryFee = entryFee;
          (position as any).entryNotional = entryNotional;
          (position as any).marginLocked = marginRequired;
          
          balance -= marginRequired; // Lock margin (don't deduct fee)
          
          // Initialize trailing stop for LONG position
          if (trailingStopManager) {
            trailingStopManager.initialize(entryPriceWithSlippage, 'buy');
          }
        }
      }
    }
    
    // SELL signal: SHORT bias + confirmations
    const sellSignal = bias === 'SHORT' && volumeConfirmed && adxConfirmed && momentumConfirmed &&
                       currentRSI > (100 - athGuardConfig.rsi_threshold);
    
    if (sellSignal && !position) {
      // SHORT entry (new SELL position) - corrected to match Bybit logic
      const positionSizePercent = strategy.position_size_percent || 100;
      const positionSizeUSD = balance * (positionSizePercent / 100);
      
      // Calculate entry price with slippage (better price for SHORT)
      const entryPriceWithSlippage = executionPrice * (1 - slippage);
      
      // Correct calculation: notional = positionSize * leverage, then quantity = notional / price
      let notional: number;
      let quantity: number;
      let marginRequired: number;
      
      if (productType === 'futures') {
        notional = positionSizeUSD * leverage;
        quantity = notional / entryPriceWithSlippage;
        marginRequired = notional / leverage;
      } else {
        notional = positionSizeUSD;
        quantity = notional / entryPriceWithSlippage;
        marginRequired = notional;
      }
      
      quantity = Math.floor(quantity / stepSize) * stepSize;
      
      // Recalculate notional after rounding quantity
      const entryNotional = quantity * entryPriceWithSlippage;
      
      if (productType === 'futures') {
        marginRequired = entryNotional / leverage;
      }
      
      if (quantity >= minQty && entryNotional >= minNotional) {
        
        if (marginRequired <= balance) {
          // Calculate SL/TP based on user parameters
          const slPercent = stopLossPercent || strategy.stop_loss_percent || 2.0;
          const tpPercent = takeProfitPercent || strategy.take_profit_percent || 4.0;
          
          const stopLossPrice = entryPriceWithSlippage * (1 + slPercent / 100);
          const takeProfitPrice = entryPriceWithSlippage * (1 - tpPercent / 100);
          
          const entryFee = (entryNotional * makerFee) / 100;
          
          position = { 
            entry_price: entryPriceWithSlippage, 
            entry_time: currentCandle.open_time, 
            type: 'sell', // SHORT position
            quantity 
          };
          
          // Store SL/TP and fees in position metadata
          (position as any).stopLossPrice = stopLossPrice;
          (position as any).takeProfitPrice = takeProfitPrice;
          (position as any).entryFee = entryFee;
          (position as any).entryNotional = entryNotional;
          (position as any).marginLocked = marginRequired;
          
          balance -= marginRequired; // Lock margin (don't deduct fee)
          
          // Initialize trailing stop for SHORT position
          if (trailingStopManager) {
            trailingStopManager.initialize(entryPriceWithSlippage, 'sell');
          }
        }
      }
    }
    
    // Close SHORT on BUY signal (removed - now only exits via SL/TP/Trailing)
    if (balance > maxBalance) maxBalance = balance;
    maxDrawdown = Math.max(maxDrawdown, ((maxBalance - balance) / maxBalance) * 100);
  }

  // Close any remaining position at end of backtest
  if (position) {
    const finalCandle = candles[candles.length - 1];
    const exitPriceWithSlippage = position.type === 'buy'
      ? finalCandle.close * (1 - slippage)
      : finalCandle.close * (1 + slippage);
    
    const pnl = position.type === 'buy'
      ? position.quantity * (exitPriceWithSlippage - position.entry_price)
      : position.quantity * (position.entry_price - exitPriceWithSlippage);
    
    const exitNotional = position.quantity * exitPriceWithSlippage;
    const exitFee = (exitNotional * takerFee) / 100;
    const entryFee = (position as any).entryFee || 0;
    const netProfit = pnl - entryFee - exitFee;
    
    position.exit_price = exitPriceWithSlippage;
    position.exit_time = finalCandle.open_time;
    position.profit = netProfit;
    (position as any).exit_reason = 'END_OF_BACKTEST';
    
    if (productType === 'futures') {
      const marginLocked = (position as any).marginLocked || 0;
      balance += marginLocked + netProfit;
    } else {
      balance += netProfit;
    }
    
    trades.push(position);
    
    console.log(`[ATH-GUARD] Final position closed at ${exitPriceWithSlippage.toFixed(2)} - P&L: ${netProfit.toFixed(2)}`);
  }

  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winningTrades = trades.filter(t => t.profit && t.profit > 0).length;
  const losingTrades = trades.length - winningTrades;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  
  const avgWin = winningTrades > 0 
    ? trades.filter(t => t.profit && t.profit > 0).reduce((sum, t) => sum + (t.profit || 0), 0) / winningTrades 
    : 0;
  const avgLoss = losingTrades > 0
    ? Math.abs(trades.filter(t => (t.profit || 0) <= 0).reduce((sum, t) => sum + (t.profit || 0), 0) / losingTrades)
    : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades) / (avgLoss * losingTrades) : 0;

  const balanceHistory: { time: number; balance: number }[] = [];
  let runningBalance = initialBalance;
  for (const trade of trades) {
    if (trade.exit_time) {
      runningBalance += (trade.profit || 0);
      balanceHistory.push({ time: trade.exit_time, balance: runningBalance });
    }
  }

  console.log(`[ATH-GUARD] Backtest complete: ${trades.length} trades, ${balance.toFixed(2)} final balance`);
  console.log(`[ATH-GUARD] Trades breakdown: ${winningTrades} wins, ${losingTrades} losses`);
  console.log(`[ATH-GUARD] Balance history: ${balanceHistory.length} entries`);

  await supabaseClient.from('strategy_backtest_results').insert({ 
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
    sharpe_ratio: 0,
    trades: trades,
    balance_history: balanceHistory
  });

  // Normalize trades before returning
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
        balance_history: balanceHistory,
        trades: normalizedTrades,
        config: {
          strategy_type: 'ath_guard_scalping',
          product_type: productType,
          leverage,
          maker_fee: makerFee,
          taker_fee: takerFee,
          slippage,
          execution_timing: executionTiming
        }
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Helper functions for ATH Guard (imported from helper but duplicated here for performance)
function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(sma);
  for (let i = period; i < data.length; i++) {
    const ema = (data[i] - result[result.length - 1]) * multiplier + result[result.length - 1];
    result.push(ema);
  }
  return result;
}

function calculateVWAP(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    result.push(cumulativeVolume === 0 ? 0 : cumulativePV / cumulativeVolume);
  }
  return result;
}

function calculateMACD(data: number[]): { macd: number[], signal: number[], histogram: number[] } {
  const fastEMA = calculateEMA(data, 12);
  const slowEMA = calculateEMA(data, 26);
  const macd = fastEMA.map((v, i) => v - slowEMA[i]);
  const signal = calculateEMA(macd.slice(26), 9);
  const paddedSignal = new Array(26).fill(0).concat(signal);
  const histogram = macd.map((v, i) => v - paddedSignal[i]);
  return { macd, signal: paddedSignal, histogram };
}

function calculateStochastic(candles: Candle[], period: number = 14): { k: number[], d: number[] } {
  const k: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      k.push(0);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const low = Math.min(...slice.map(c => c.low));
      const high = Math.max(...slice.map(c => c.high));
      const close = candles[i].close;
      if (high === low) {
        k.push(50);
      } else {
        k.push(((close - low) / (high - low)) * 100);
      }
    }
  }
  const smoothedK = calculateSMA(k, 3);
  const d = calculateSMA(smoothedK, 3);
  return { k: smoothedK, d };
}

function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(50);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }
    }
  }
  return [50, ...result];
}

function calculateATR(candles: Candle[], period: number = 14): number[] {
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return [0, ...calculateEMA(tr, period)];
}

// Module-level warnings array for tracking issues across backtest execution
let warnings: string[] = [];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const debug: boolean = !!body.debug;
    const debugLogs: any[] = [];
    warnings = []; // Reset warnings for each request
    const log = (message: string, meta?: Record<string, unknown>) => {
      const entry = { ts: new Date().toISOString(), message, ...(meta ? { meta } : {}) };
      if (debug) debugLogs.push(entry);
      console.log(message, meta || '');
    };
    
    // Validate input parameters
    const validated = validateInput(backtestSchema, {
      strategyId: body.strategyId,
      startDate: body.startDate,
      endDate: body.endDate,
      initialBalance: body.initialBalance || 10000,
      leverage: body.leverage || 1,
      makerFee: body.makerFee || 0.018,  // Updated to match Bybit VIP1 rates
      takerFee: body.takerFee || 0.04,   // Updated to match Bybit VIP1 rates
      slippage: body.slippage || 0.01,
      stopLossPercent: body.stopLossPercent ?? undefined,
      takeProfitPercent: body.takeProfitPercent ?? undefined,
      trailingStopPercent: body.trailingStopPercent ?? undefined,
      productType: body.productType || 'spot',
      executionTiming: body.executionTiming || 'close',
      exitOnOppositeSignal: body.exitOnOppositeSignal,
      useFirstTouch: body.useFirstTouch,
      executeCloseOnNextOpen: body.executeCloseOnNextOpen
    });
    
    const { 
      strategyId, 
      startDate, 
      endDate, 
      initialBalance, 
      stopLossPercent, 
      takeProfitPercent,
      trailingStopPercent,
      leverage,
      makerFee,
      takerFee,
      slippage
    } = validated;
    
    // These have defaults in schema but TypeScript doesn't know that
    const productType = validated.productType ?? 'spot';
    const executionTiming = validated.executionTiming ?? 'close';
    const exitOnOppositeSignal = validated.exitOnOppositeSignal ?? true;
    const useFirstTouch = validated.useFirstTouch ?? true;
    const executeCloseOnNextOpen = validated.executeCloseOnNextOpen ?? true;

    log(`Running backtest for strategy ${strategyId} (${productType.toUpperCase()}, ${leverage}x leverage)`);
    log(`[BACKTEST] Parameters received:`, {
      stopLossPercent,
      takeProfitPercent,
      trailingStopPercent,
      initialBalance,
      productType,
      leverage,
      executionTiming,
      exitOnOppositeSignal,
      useFirstTouch,
      executeCloseOnNextOpen
    });

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

    log(`Strategy loaded`, { name: strategy.name, symbol: strategy.symbol, timeframe: strategy.timeframe, type: strategy.strategy_type || 'standard' });

    // Fetch user settings to get exchange_type and debug_mode
    const { data: userSettings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('exchange_type, debug_mode')
      .eq('user_id', strategy.user_id)
      .single();

    if (settingsError) {
      console.warn('[BACKTEST] Could not fetch user settings, defaulting to bybit:', settingsError);
    }

    // ✅ ПРАВИЛЬНО: Determine exchange-specific fees
    const exchangeType = userSettings?.exchange_type || 'bybit';
    let exchangeMakerFee = makerFee;
    let exchangeTakerFee = takerFee;
    
    if (exchangeType === 'bybit') {
      // Bybit fees: 0.02% maker, 0.055% taker (correct values)
      exchangeMakerFee = 0.02;
      exchangeTakerFee = 0.055;
    } else {
      // Bybit fees: 0.018% maker, 0.04% taker (default)
      exchangeMakerFee = makerFee;
      exchangeTakerFee = takerFee;
    }
    
    // Adjust slippage based on exchange and symbol liquidity
    const symbol = strategy.symbol || 'BTCUSDT';
    const highLiquidityPairs = ['BTCUSDT', 'ETHUSDT'];
    let adjustedSlippage = slippage;
    
    if (exchangeType === 'bybit') {
      adjustedSlippage = highLiquidityPairs.includes(symbol) ? 0.01 : 0.03;
    } else {
      adjustedSlippage = highLiquidityPairs.includes(symbol) ? 0.015 : 0.035;
    }
    
    log(`[BACKTEST] Exchange/Fees`, { exchangeType, symbol, makerFee: exchangeMakerFee, takerFee: exchangeTakerFee, slippage: adjustedSlippage });

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

    log(`Loaded conditions`, { count: conditions?.length || 0 });

    // Fetch condition groups
    const { data: groups, error: groupsError } = await supabaseClient
      .from('condition_groups')
      .select('*')
      .eq('strategy_id', strategyId)
      .order('order_index', { ascending: true });

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
    }

    log(`Loaded condition groups`, { count: groups?.length || 0 });

    // Validate strategy has conditions (skip for custom strategy types like 4h_reentry)
    const isCustomStrategy = strategy.strategy_type && strategy.strategy_type !== 'standard';
    if (!isCustomStrategy && (!conditions || conditions.length === 0)) {
      throw new Error('Strategy has no conditions defined. Please add entry/exit conditions before running backtest.');
    }
    
    log(`Strategy type`, { type: strategy.strategy_type || 'standard', isCustomStrategy });

    // Normalize indicator types and operators to lowercase for compatibility
    const normalizedConditions = conditions.map(c => ({
      ...c,
      indicator_type: c.indicator_type?.toLowerCase(),
      indicator_type_2: c.indicator_type_2?.toLowerCase(),
      operator: c.operator?.toLowerCase()
    }));

    // Fetch market data (fetch ALL candles - Supabase default limit is 1000)
    let allMarketData: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    // For FVG strategy, use analysis timeframe instead of strategy timeframe
    const isFVGScalping = strategy.strategy_type === 'fvg_scalping';
    const timeframe = isFVGScalping 
      ? (strategy.fvg_analysis_timeframe || '1m')
      : strategy.timeframe;

    log(`Fetching market data`, { startDate, endDate, symbol: strategy.symbol, timeframe });

    // First, check what data exists for this symbol/timeframe
    const { data: dataCheck, error: checkError } = await supabaseClient
      .from('market_data')
      .select('*')
      .eq('symbol', strategy.symbol)
      .eq('timeframe', timeframe)
      .limit(1);
    
    log(`Data availability check`, { 
      symbol: strategy.symbol, 
      timeframe, 
      hasData: dataCheck && dataCheck.length > 0,
      checkError: checkError?.message 
    });

    // Pre-load benchmark data for MSTG strategy to avoid DB queries in backtest loop
    let benchmarkCandles: Candle[] | null = null;
    const isMSTG = strategy.strategy_type === 'mstg';
    if (isMSTG) {
      const benchmarkSymbol = strategy.mstg_benchmark_symbol || 'BTCUSDT';
      log(`[MSTG-OPTIMIZE] Pre-loading benchmark data for ${benchmarkSymbol}`);
      
      let allBenchmarkData: any[] = [];
      let benchmarkFrom = 0;
      let hasBenchmarkMore = true;
      
      while (hasBenchmarkMore) {
        const { data: batch, error: batchError } = await supabaseClient
          .from('market_data')
          .select('*')
          .eq('symbol', benchmarkSymbol)
          .eq('timeframe', strategy.timeframe)
          .eq('exchange_type', 'bybit')
          .gte('open_time', new Date(startDate).getTime())
          .lte('open_time', new Date(endDate).getTime())
          .order('open_time', { ascending: true })
          .range(benchmarkFrom, benchmarkFrom + batchSize - 1);

        if (batchError || !batch || batch.length === 0) {
          hasBenchmarkMore = false;
        } else {
          allBenchmarkData = allBenchmarkData.concat(batch);
          if (batch.length < batchSize) {
            hasBenchmarkMore = false;
          } else {
            benchmarkFrom += batchSize;
          }
        }
      }
      
      benchmarkCandles = allBenchmarkData.map((d: any) => ({
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume),
        open_time: d.open_time,
        close_time: d.close_time,
      }));
      
      log(`[MSTG-OPTIMIZE] Benchmark data loaded: ${benchmarkCandles.length} candles`);
    }

    while (hasMore) {
      const { data: batch, error: batchError } = await supabaseClient
        .from('market_data')
        .select('*')
        .eq('symbol', strategy.symbol)
        .eq('timeframe', timeframe)
        .gte('open_time', new Date(startDate).getTime())
        .lte('open_time', new Date(endDate).getTime())
        .order('open_time', { ascending: true })
        .range(from, from + batchSize - 1);

      if (batchError) {
        log(`Database error on batch ${Math.floor(from / batchSize) + 1}`, { error: batchError.message, from, batchSize });
        throw new Error(`Error fetching market data: ${batchError.message}`);
      }

      if (!batch || batch.length === 0) {
        hasMore = false;
      } else {
        allMarketData = allMarketData.concat(batch);
        log(`Fetched batch`, { batchNo: Math.floor(from / batchSize) + 1, batchLength: batch.length, total: allMarketData.length });
        
        if (batch.length < batchSize) {
          hasMore = false;
        } else {
          from += batchSize;
        }
      }
    }

    let marketData = allMarketData;

    // If nothing found, try again with Bybit mainnet only
    if (!marketData || marketData.length === 0) {
      log(`[BACKTEST] No candles found. Retrying with Bybit mainnet only`, { exchangeType: 'bybit' });
      allMarketData = [];
      from = 0;
      hasMore = true;
      while (hasMore) {
        const { data: batch, error: batchError } = await supabaseClient
          .from('market_data')
          .select('*')
          .eq('symbol', strategy.symbol)
          .eq('timeframe', timeframe)
          .eq('exchange_type', 'bybit')
          .gte('open_time', new Date(startDate).getTime())
          .lte('open_time', new Date(endDate).getTime())
          .order('open_time', { ascending: true })
          .range(from, from + batchSize - 1);

        if (batchError) { log('Bybit filter batch error', { error: batchError.message }); break; }
        if (!batch || batch.length === 0) { hasMore = false; } else {
          allMarketData = allMarketData.concat(batch);
          if (batch.length < batchSize) { hasMore = false; } else { from += batchSize; }
        }
      }
      marketData = allMarketData;
    }

    // No Binance fallback - Bybit only

    if (!marketData || marketData.length === 0) {
      throw new Error(`No Bybit market data available for ${strategy.symbol} ${timeframe}. Please ensure Bybit data is loaded for the specified date range.`);
    }

    // Validate data integrity
    if (marketData.length > 0) {
      // Check for data gaps
      let gaps = 0;
      for (let i = 1; i < marketData.length; i++) {
        const prevTime = marketData[i-1].open_time;
        const currTime = marketData[i].open_time;
        const expectedInterval = getIntervalMs(timeframe);
        const actualInterval = currTime - prevTime;
        
        if (actualInterval > expectedInterval * 1.5) {
          gaps++;
          if (gaps <= 5) { // Log first 5 gaps only
            log(`Data gap detected`, { 
              from: new Date(prevTime).toISOString(), 
              to: new Date(currTime).toISOString(),
              expected: expectedInterval,
              actual: actualInterval
            });
          }
        }
      }
      
      if (gaps > 0) {
        log(`Data validation`, { totalGaps: gaps, candles: marketData.length });
      }
    }

    log(`Final market data selected`, {
      candles: marketData.length,
      first: new Date(marketData[0].open_time).toISOString(),
      last: new Date(marketData[marketData.length - 1].open_time).toISOString(),
      sample: marketData[0]
    });
    
    // ⚡ Performance optimization: Warn about large datasets
    if (marketData.length > 10000) {
      log(`⚠️ Large dataset detected: ${marketData.length} candles`, {
        warning: 'This backtest may timeout due to CPU limits',
        suggestion: 'Consider reducing date range or using a longer timeframe'
      });
    }
    
    // Calculate required candles based on strategy type and indicators
    let requiredCandles = 200; // Default minimum
    
    // Check if strategy uses SMA-200 or other long-period indicators
    const strategyType = strategy.strategy_type || 'standard'; // Declare early for use in logging
    if (strategyType === 'sma_crossover' || strategyType === 'sma_20_200_rsi') {
      requiredCandles = Math.max(requiredCandles, 200); // SMA-200 needs 200 candles
    }
    
    // Check conditions for large period indicators
    if (normalizedConditions && normalizedConditions.length > 0) {
      normalizedConditions.forEach((cond: any) => {
        const period1 = cond.period_1 || 0;
        const period2 = cond.period_2 || 0;
        const maxPeriod = Math.max(period1, period2);
        if (maxPeriod > requiredCandles) {
          requiredCandles = maxPeriod;
        }
      });
    }
    
    // Add 20% buffer for warmup
    requiredCandles = Math.ceil(requiredCandles * 1.2);
    
    // Calculate minimum days needed based on timeframe
    const timeframeToHours: Record<string, number> = {
      '1m': 1/60, '5m': 5/60, '15m': 15/60, '30m': 0.5, '1h': 1, '2h': 2, '4h': 4, '1d': 24
    };
    const hoursPerCandle = timeframeToHours[timeframe] || 1;
    const minimumDays = Math.ceil((requiredCandles * hoursPerCandle) / 24);
    
    log(`Required minimum for strategy`, { 
      strategyType, 
      timeframe, 
      requiredCandles, 
      minimumDays 
    });
    
    // CRITICAL VALIDATION: Return error if insufficient data
    if (marketData.length < requiredCandles) {
      const errorMessage = `Insufficient data: Have ${marketData.length} candles, need ${requiredCandles} minimum. Please extend date range to at least ${minimumDays} days.`;
      log(`BACKTEST BLOCKED: ${errorMessage}`, { 
        available: marketData.length, 
        required: requiredCandles,
        currentDays: Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)),
        recommendedDays: minimumDays
      });
      
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          debug: {
            available_candles: marketData.length,
            required_candles: requiredCandles,
            timeframe: timeframe,
            strategy_type: strategyType,
            current_date_range_days: Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)),
            recommended_minimum_days: minimumDays,
            debugLogs: debug ? debugLogs : undefined
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    log(`Preparing candles`, { count: marketData.length });

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

    // 🎯 PHASE 2: Market Regime Detection
    log(`[MARKET-REGIME] Analyzing market conditions...`);
    const marketRegime = detectMarketRegime(candles);
    log(`[MARKET-REGIME] Detected regime: ${marketRegime.regime} (${marketRegime.strength}% strength, ${marketRegime.direction} direction, ${marketRegime.confidence}% confidence)`);
    
    // Check if strategy is suitable for current market regime (warning only, not blocking)
    const isSuitable = isStrategySuitableForRegime(strategyType, marketRegime);
    
    if (!isSuitable) {
      log(`[MARKET-REGIME] ⚠️ WARNING: Strategy ${strategyType} performs best in other market conditions. Current: ${marketRegime.regime} (${marketRegime.strength}% strength). Proceeding with backtest...`, {
        regime: marketRegime.regime,
        strength: marketRegime.strength,
        direction: marketRegime.direction,
        confidence: marketRegime.confidence
      });
    } else {
      log(`[MARKET-REGIME] ✅ Strategy ${strategyType} is suitable for ${marketRegime.regime} market (${marketRegime.strength}% strength)`);
    }
    
    // Continue with backtest regardless of market regime
    log(`[BACKTEST] Proceeding with backtest for ${strategyType} in ${marketRegime.regime} market...`);
    
    // Get regime-specific position size adjustment
    const regimePositionAdjustment = getRegimePositionAdjustment(marketRegime);
    log(`[MARKET-REGIME] Position size adjustment: ${regimePositionAdjustment}x`);

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
        corsHeaders,
        trailingStopPercent,
        stopLossPercent,
        takeProfitPercent,
        useFirstTouch,
        executeCloseOnNextOpen
      );
    }


    // Check if this is SMA Crossover strategy
    const isSMACrossover = strategy.strategy_type === 'sma_crossover';
    
    if (isSMACrossover) {
      console.log('Running SMA 20/200 Crossover strategy backtest...');
      return await runSMACrossoverBacktest(
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
        corsHeaders,
        trailingStopPercent,
        stopLossPercent,
        takeProfitPercent
      );
    }

    // Check if this is ATH Guard Scalping strategy
    const isATHGuard = strategy.strategy_type === 'ath_guard_scalping';
    
    if (isATHGuard) {
      console.log('Running ATH Guard Mode (1-min Scalping) backtest...');
      return await runATHGuardBacktest(
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
        corsHeaders,
        trailingStopPercent,
        stopLossPercent,
        takeProfitPercent
      );
    }

    // Check if this is SMA 20/200 RSI strategy
    const isSMA20_200RSI = strategy.strategy_type === 'sma_20_200_rsi';
    
    if (isSMA20_200RSI) {
      console.log('Running SMA 20/200 RSI strategy backtest...');
      return await runSMACrossoverBacktest(
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
        corsHeaders,
        trailingStopPercent,
        stopLossPercent,
        takeProfitPercent
      );
    }

    // Check if this is MTF Momentum strategy
    const isMTFMomentum = strategy.strategy_type === 'mtf_momentum';
    
    if (isMTFMomentum) {
      console.log('Running MTF Momentum strategy backtest...');
      return await runMTFMomentumBacktest(
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
        corsHeaders,
        trailingStopPercent,
        stopLossPercent,
        takeProfitPercent
      );
    }

    // Check if this is FVG Scalping strategy
    if (isFVGScalping) {
      console.log('Running FVG Scalping strategy backtest...');
      return await runFVGScalpingBacktest(
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
        corsHeaders,
        trailingStopPercent,
        stopLossPercent,
        takeProfitPercent,
        userSettings?.debug_mode || false
      );
    }

    // Check if this is EMA Crossover Scalping strategy
    const isEMACrossover = strategy.strategy_type === 'ema_crossover_scalping';
    
    if (isEMACrossover) {
      console.log('Running EMA Crossover Scalping strategy backtest...');
      return await runEMACrossoverBacktest(
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
        corsHeaders,
        trailingStopPercent,
        stopLossPercent,
        takeProfitPercent
      );
    }

    // Check if this is MSTG strategy
    if (isMSTG) {
      console.log('Running MSTG strategy backtest...');
      return await runMSTGBacktest(
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
        corsHeaders,
        trailingStopPercent,
        benchmarkCandles
      );
    }

    // ✅ ПРАВИЛЬНО: Use enhanced backtest engine with exchange type support
    const backtestConfig = {
      initialBalance: initialBalance || strategy.initial_capital || 1000,
      stopLossPercent: stopLossPercent ?? strategy.stop_loss_percent,
      takeProfitPercent: takeProfitPercent ?? strategy.take_profit_percent,
      trailingStopPercent: trailingStopPercent, // New trailing stop feature
      productType,
      leverage,
      makerFee: exchangeMakerFee,
      takerFee: exchangeTakerFee,
      slippage: adjustedSlippage, // Use adjusted slippage based on exchange/symbol
      symbol: strategy.symbol || 'BTCUSDT', // Add symbol for exchange constraints
      executionTiming,
      positionSizePercent: strategy.position_size_percent || 100,
      exchangeType: exchangeType // ✅ ПРАВИЛЬНО: Используем определенный тип биржи
    };

    console.log(`[ENHANCED] Using enhanced backtest engine with config:`, backtestConfig);

    // Initialize enhanced backtest engine
    const backtestEngine = new EnhancedBacktestEngine(candles, backtestConfig);

    // Run enhanced backtest with trailing stop support
    const results = backtestEngine.runBacktest(normalizedConditions, groups || []);

    console.log(`[ENHANCED] Backtest complete: ${results.total_trades} trades, ${results.win_rate.toFixed(1)}% win rate, PF: ${results.profit_factor.toFixed(2)}`);

    // Save backtest results
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
        profit_factor: results.profit_factor,
        avg_win: results.avg_win,
        avg_loss: results.avg_loss,
      });

    if (insertError) {
      console.error('Error saving backtest results:', insertError);
    }

    // Normalize trades before returning
    const normalizedTrades = normalizeTrades(results.trades || []);
    
    return new Response(
      JSON.stringify({
        success: true,
        results: {
          initial_balance: results.initial_balance,
          final_balance: results.final_balance,
          total_return: results.total_return,
          total_trades: normalizedTrades.length, // Use normalized count
          winning_trades: results.winning_trades,
          losing_trades: results.losing_trades,
          win_rate: results.win_rate,
          max_drawdown: results.max_drawdown,
          profit_factor: results.profit_factor,
          avg_win: results.avg_win,
          avg_loss: results.avg_loss,
          balance_history: results.balance_history,
          trades: normalizedTrades, // Use normalized trades
          warnings: warnings.length > 0 ? warnings : undefined,
          config: {
            product_type: productType,
            leverage,
            maker_fee: makerFee,
            taker_fee: takerFee,
            slippage,
            execution_timing: executionTiming,
            trailing_stop_percent: trailingStopPercent // New trailing stop info
          }
        },
        debug: debug ? debugLogs : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error running backtest:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        warnings: warnings.length > 0 ? warnings : undefined 
      }),
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
      case 'kdj_j':
        const kdj = indicators.calculateKDJ(candles, period, params.smoothing || 3, 3);
        cache[key] = { k: kdj.k, d: kdj.d, j: kdj.j };
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
      case 'anchored_vwap':
        cache[key] = indicators.calculateAnchoredVWAP(candles, params.anchor || 0);
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
      case 'psar':
        cache[key] = indicators.calculateParabolicSAR(candles, params.acceleration || 0.02, 0.2);
        break;
      case 'supertrend':
        const st = indicators.calculateSuperTrend(candles, period, params.multiplier || 3);
        cache[key] = { trend: st.trend, direction: st.direction };
        break;
      case 'ema_crossover':
        const shortEMA = indicators.calculateEMA(closePrices, period);
        const longEMA = indicators.calculateEMA(closePrices, params.period2 || 21);
        cache[key] = indicators.detectEMACrossover(shortEMA, longEMA);
        break;
      case 'ichimoku_tenkan':
      case 'ichimoku_kijun':
      case 'ichimoku_senkou_a':
      case 'ichimoku_senkou_b':
      case 'ichimoku_chikou':
        const ichimoku = indicators.calculateIchimoku(candles, 9, 26, 52);
        cache['ichimoku_tenkan'] = ichimoku.tenkan;
        cache['ichimoku_kijun'] = ichimoku.kijun;
        cache['ichimoku_senkou_a'] = ichimoku.senkouA;
        cache['ichimoku_senkou_b'] = ichimoku.senkouB;
        cache['ichimoku_chikou'] = ichimoku.chikou;
        cache[key] = cache[type.toLowerCase()];
        break;

      // Volatility Indicators
      case 'atr':
        cache[key] = indicators.calculateATR(candles, period);
        break;
      case 'bollinger_bands':
        const bb = indicators.calculateBollingerBands(closePrices, period, params.deviation || 2);
        cache[key] = { upper: bb.upper, middle: bb.middle, lower: bb.lower };
        break;
      case 'bb_width':
        const bbw = indicators.calculateBollingerBands(closePrices, period, params.deviation || 2);
        cache[key] = indicators.calculateBollingerWidth(bbw.upper, bbw.lower);
        break;
      case 'percent_b':
        const bbp = indicators.calculateBollingerBands(closePrices, period, params.deviation || 2);
        cache[key] = indicators.calculatePercentB(closePrices, bbp.upper, bbp.lower);
        break;
      case 'td_sequential':
        const td = indicators.calculateTDSequential(candles);
        cache[key] = { setup: td.setup, countdown: td.countdown };
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
    // For MACD, Stochastic, ADX, Bollinger Bands, KDJ, SuperTrend, TD Sequential
    if ('macd' in cached) return (cached.macd as number[])[currentIndex] ?? null;
    if ('k' in cached && indicatorType.includes('stoch')) return (cached.k as number[])[currentIndex] ?? null;
    if ('j' in cached && indicatorType.includes('kdj')) return (cached.j as number[])[currentIndex] ?? null;
    if ('adx' in cached) return (cached.adx as number[])[currentIndex] ?? null;
    if ('upper' in cached && indicatorType.includes('bollinger')) return (cached.upper as number[])[currentIndex] ?? null;
    if ('trend' in cached && indicatorType.includes('supertrend')) return (cached.trend as number[])[currentIndex] ?? null;
    if ('setup' in cached && indicatorType.includes('td')) return (cached.setup as number[])[currentIndex] ?? null;
    return null;
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

// ============= SMA CROSSOVER STRATEGY IMPLEMENTATION =============
async function runSMACrossoverBacktest(
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
  const startTime = Date.now();
  console.log('[SMA-BACKTEST] Starting optimization...');
  
  // Extract SL/TP parameters for use throughout the function
  const slPercent = stopLossPercent || strategy.stop_loss_percent || 2.0;
  const tpPercent = takeProfitPercent || strategy.take_profit_percent || 4.0;
  
  let balance = initialBalance || strategy.initial_capital || 10000;
  let availableBalance = balance;
  let lockedMargin = 0;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [{ time: candles[0].open_time, balance }];

  // Get dynamic exchange constraints based on symbol
  const exchangeType = strategy.exchange_type || 'bybit';
  const symbol = strategy.symbol || 'BTCUSDT';
  const constraints = exchangeType === 'bybit' 
    ? getBybitConstraints(symbol)
    : getBybitConstraints(symbol);
  
  const { stepSize, minQty, minNotional } = constraints;
  console.log(`[SMA-BACKTEST] Using ${exchangeType} constraints:`, { stepSize, minQty, minNotional });

  // Get unified strategy configuration from database
  const config = getStrategyBacktestConfig(strategy, strategy.strategy_type);

  console.log(`[SMA-BACKTEST] Processing ${candles.length} candles`);
  console.log(`[SMA-BACKTEST] Strategy config:`, config);

  // Initialize Trailing Stop Manager if configured
  let trailingStopManager: any = null;
  if (trailingStopPercent && trailingStopPercent > 0) {
    trailingStopManager = {
      maxProfitPercent: 0,
      trailingPercent: trailingStopPercent,
      isActive: false,
      entryPrice: 0,
      positionType: 'buy' as 'buy' | 'sell',
      
      initialize(entryPrice: number, positionType: 'buy' | 'sell'): void {
        this.entryPrice = entryPrice;
        this.positionType = positionType;
        this.maxProfitPercent = 0;
        this.isActive = false;
        console.log(`[SMA TRAILING] Initialized for ${positionType} at ${entryPrice.toFixed(2)}`);
      },
      
      checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string } {
        if (!this.isActive) {
          const currentProfitPercent = this.calculateProfitPercent(currentPrice);
          if (currentProfitPercent > 0) {
            this.isActive = true;
            this.maxProfitPercent = currentProfitPercent;
            console.log(`[SMA TRAILING] Activated at ${currentProfitPercent.toFixed(2)}% profit`);
            return { shouldClose: false, reason: 'TRAILING_ACTIVATED' };
          }
          return { shouldClose: false, reason: 'NO_PROFIT_YET' };
        }
        
        const currentProfitPercent = this.calculateProfitPercent(currentPrice);
        if (currentProfitPercent > this.maxProfitPercent) {
          this.maxProfitPercent = currentProfitPercent;
          console.log(`[SMA TRAILING] New max profit: ${currentProfitPercent.toFixed(2)}%`);
        }
        
        const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
        
        if (currentProfitPercent < trailingThreshold) {
          console.log(`[SMA TRAILING] Triggered: ${currentProfitPercent.toFixed(2)}% < ${trailingThreshold.toFixed(2)}% (max: ${this.maxProfitPercent.toFixed(2)}%)`);
          return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED' };
        }
        
        return { shouldClose: false, reason: 'TRAILING_ACTIVE' };
      },
      
      calculateProfitPercent(currentPrice: number): number {
        if (this.positionType === 'buy') {
          return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
        } else {
          return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
        }
      },
      
      reset(): void {
        this.maxProfitPercent = 0;
        this.isActive = false;
        this.entryPrice = 0;
      }
    };
  }

  // ✅ PRE-CALCULATE ALL INDICATORS ONCE (O(n) instead of O(n²))
  console.log('[SMA-BACKTEST] Pre-calculating indicators...');
  const closes = candles.map(c => c.close);
  const smaFast = calculateSMA(closes, config.sma_fast_period);
  const smaSlow = calculateSMA(closes, config.sma_slow_period);
  const rsi = calculateRSI(closes, config.rsi_period);
  const atr = calculateATR(candles, 14);
  console.log('[SMA-BACKTEST] ✅ Indicators ready, starting backtest loop...');

  // Calculate market regime for adaptive parameters
  const marketRegime = detectMarketRegime(candles);
  console.log(`[SMA-BACKTEST] Market regime: ${marketRegime.regime} (${marketRegime.strength}% strength)`);

  // Debug tracking
  let goldenCrossCount = 0;
  let deathCrossCount = 0;
  let rsiRejections = 0;
  let volumeRejections = 0;
  let constraintRejections = 0;
  let consecutiveInsufficientBalance = 0;
  const MAX_INSUFFICIENT_BALANCE_CANDLES = 500; // Terminate if can't trade for 500 candles

  const startIdx = Math.max(config.sma_slow_period, config.rsi_period);
  for (let i = startIdx; i < candles.length; i++) {
    const currentCandle = candles[i];
    const currentPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
    const currentTime = currentCandle.open_time;
    
    // Early termination if balance too low for too long
    if (!position && consecutiveInsufficientBalance >= MAX_INSUFFICIENT_BALANCE_CANDLES) {
      console.log(`[SMA-BACKTEST] ⚠️ Terminating early: Insufficient balance for ${MAX_INSUFFICIENT_BALANCE_CANDLES} consecutive candles`);
      break;
    }
    
    // Check SL/TP first (priority over trailing stop)
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
            exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
          } else {
            exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
        }
      } else {
        const slHit = currentCandle.high >= stopLossPrice;
        const tpHit = currentCandle.low <= takeProfitPrice;
        
        if (slHit && tpHit) {
          const distToSL = Math.abs(currentPrice - stopLossPrice);
          const distToTP = Math.abs(currentPrice - takeProfitPrice);
          if (distToSL <= distToTP) {
            exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
          } else {
            exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
        }
      }
      
      if (exitPrice) {
        const exitPriceWithSlippage = position.type === 'buy'
          ? exitPrice * (1 - slippage)
          : exitPrice * (1 + slippage);
        
        const pnl = position.type === 'buy'
          ? position.quantity * (exitPriceWithSlippage - position.entry_price)
          : position.quantity * (position.entry_price - exitPriceWithSlippage);
        
        const exitNotional = position.quantity * exitPriceWithSlippage;
        const exitFee = (exitNotional * takerFee) / 100;
        const entryFee = (position as any).entryFee || 0;
        const netProfit = pnl - entryFee - exitFee;
        
        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentTime;
        position.profit = netProfit;
        (position as any).exit_reason = exitReason;
        
        balance += netProfit;
        availableBalance += lockedMargin + netProfit;
        lockedMargin = 0;
        
        trades.push(position);
        position = null;
        
        if (trailingStopManager) {
          trailingStopManager.reset();
        }
        
        console.log(`[${i}] SMA ${exitReason} at ${exitPriceWithSlippage.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
        continue;
      }
      
      // Check trailing stop (secondary)
      if (trailingStopManager) {
        const trailingResult = trailingStopManager.checkTrailingStop(currentPrice);
        if (trailingResult.shouldClose) {
          const exitPriceWithSlippage = position.type === 'buy'
            ? currentPrice * (1 - slippage)
            : currentPrice * (1 + slippage);
          
          const pnl = position.type === 'buy'
            ? position.quantity * (exitPriceWithSlippage - position.entry_price)
            : position.quantity * (position.entry_price - exitPriceWithSlippage);
          
          const exitNotional = position.quantity * exitPriceWithSlippage;
          const exitFee = (exitNotional * takerFee) / 100;
          const entryFee = (position as any).entryFee || 0;
          const netProfit = pnl - entryFee - exitFee;
          
          position.exit_price = exitPriceWithSlippage;
          position.exit_time = currentTime;
          position.profit = netProfit;
          (position as any).exit_reason = 'TRAILING_STOP_TRIGGERED';
          
          balance += netProfit;
          availableBalance += lockedMargin + netProfit;
          lockedMargin = 0;
          
          trades.push(position);
          position = null;
          trailingStopManager.reset();
          
          console.log(`[${i}] SMA TRAILING STOP at ${exitPriceWithSlippage.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
          continue;
        }
      }
    }
    
    // Progress logging every 1000 candles
    if (i % 1000 === 0) {
      console.log(`[SMA-BACKTEST] Progress: ${i}/${candles.length} candles (${((i/candles.length)*100).toFixed(1)}%)`);
    }
    
    // ✅ Direct indicator access (no slice, no map, just array indexing)
    const currentSMAFast = smaFast[i];
    const currentSMASlow = smaSlow[i];
    const prevSMAFast = smaFast[i - 1];
    const prevSMASlow = smaSlow[i - 1];
    const currentRSI = rsi[i];
    const currentATR = atr[i];
    
    // ✅ Calculate crossover signals (O(1) instead of O(n))
    const goldenCross = prevSMAFast <= prevSMASlow && currentSMAFast > currentSMASlow;
    const deathCross = prevSMAFast >= prevSMASlow && currentSMAFast < currentSMASlow;
    
    // Calculate volume confirmation
    const volumeAvg = candles.slice(Math.max(0, i - 20), i).reduce((sum, c) => sum + c.volume, 0) / Math.min(20, i);
    const volumeConfirmed = currentCandle.volume >= volumeAvg * config.volume_multiplier;
    
    // Debug: Log all crossover detections
    if (goldenCross) {
      goldenCrossCount++;
      console.log(`[${i}] 🔍 GOLDEN CROSS detected at ${currentPrice.toFixed(2)} - RSI: ${currentRSI.toFixed(2)}, Volume: ${currentCandle.volume.toFixed(0)} (avg: ${volumeAvg.toFixed(0)}, confirmed: ${volumeConfirmed})`);
    }
    if (deathCross) {
      deathCrossCount++;
      console.log(`[${i}] 🔍 DEATH CROSS detected at ${currentPrice.toFixed(2)} - RSI: ${currentRSI.toFixed(2)}, Volume: ${currentCandle.volume.toFixed(0)} (avg: ${volumeAvg.toFixed(0)}, confirmed: ${volumeConfirmed})`);
    }
    
    // BUY signal: Golden cross + RSI not overbought + Volume
    if (goldenCross && !position) {
      if (currentRSI >= config.rsi_overbought) {
        rsiRejections++;
        console.log(`[${i}] ❌ BUY rejected: RSI too high (${currentRSI.toFixed(2)} >= ${config.rsi_overbought})`);
      } else if (!volumeConfirmed) {
        volumeRejections++;
        console.log(`[${i}] ❌ BUY rejected: Volume too low (${currentCandle.volume.toFixed(0)} < ${(volumeAvg * config.volume_multiplier).toFixed(0)})`);
      } else {
        // Position sizing (margin-based). Margin = % of available balance; Exposure = margin * leverage
        const positionSizePercent = strategy.position_size_percent || 100;
        const margin = availableBalance * (positionSizePercent / 100);
        
        const entryPrice = currentPrice * (1 + slippage);
        let quantity = (margin * leverage) / entryPrice; // convert exposure to base qty
        quantity = Math.floor(quantity / stepSize) * stepSize;
        
        let entryNotional = quantity * entryPrice;
        let marginRequired = entryNotional / leverage;
        
        // Ensure minimum notional requirement is met
        if (entryNotional < minNotional) {
          const minQuantity = Math.ceil(minNotional / entryPrice / stepSize) * stepSize;
          quantity = minQuantity;
          entryNotional = quantity * entryPrice;
          marginRequired = entryNotional / leverage;
        }
        
        // Guard: if rounding made margin exceed available, shrink to fit
        if (marginRequired > availableBalance) {
          const maxExposure = availableBalance * leverage;
          quantity = Math.floor((maxExposure / entryPrice) / stepSize) * stepSize;
          entryNotional = quantity * entryPrice;
          marginRequired = entryNotional / leverage;
        }
        
        if (quantity >= minQty && entryNotional >= minNotional) {
        
        if (marginRequired <= availableBalance) {
          // Calculate SL/TP based on user parameters
          const stopLossPct = slPercent;
          const takeProfitPct = tpPercent;
          
          const stopLossPrice = entryPrice * (1 - stopLossPct / 100);
          const takeProfitPrice = entryPrice * (1 + takeProfitPct / 100);
          
          const entryFee = (entryNotional * makerFee) / 100;
          
          position = {
            entry_price: entryPrice,
            entry_time: currentTime,
            type: 'buy',
            quantity: quantity
          };
          
          // Store SL/TP and fees in position metadata
          (position as any).stopLossPrice = stopLossPrice;
          (position as any).takeProfitPrice = takeProfitPrice;
          (position as any).entryFee = entryFee;
          (position as any).entryNotional = entryNotional;
          
          availableBalance -= marginRequired;
          lockedMargin += marginRequired;
          
          // Initialize trailing stop for LONG position
          if (trailingStopManager) {
            trailingStopManager.initialize(entryPrice, 'buy');
          }
          
          console.log(`[${i}] 🟢 BUY at ${entryPrice.toFixed(2)} - SL: ${stopLossPrice.toFixed(2)}, TP: ${takeProfitPrice.toFixed(2)}`);
          consecutiveInsufficientBalance = 0; // Reset counter on successful trade
        }
        } else {
          constraintRejections++;
          consecutiveInsufficientBalance++; // Increment counter when can't trade
          // Removed verbose rejection logging to prevent CPU timeout
        }
      }
    }
    
    // SHORT signal: Death cross + RSI not oversold + Volume
    if (deathCross && !position) {
      if (currentRSI <= config.rsi_oversold) {
        rsiRejections++;
        console.log(`[${i}] ❌ SHORT rejected: RSI too low (${currentRSI.toFixed(2)} <= ${config.rsi_oversold})`);
      } else if (!volumeConfirmed) {
        volumeRejections++;
        console.log(`[${i}] ❌ SHORT rejected: Volume too low (${currentCandle.volume.toFixed(0)} < ${(volumeAvg * config.volume_multiplier).toFixed(0)})`);
      } else {
        // Position sizing (margin-based). Margin = % of available balance; Exposure = margin * leverage
        const positionSizePercent = strategy.position_size_percent || 100;
        const margin = availableBalance * (positionSizePercent / 100);
        
        const entryPrice = currentPrice * (1 - slippage); // Better price for SHORT
        let quantity = (margin * leverage) / entryPrice; // convert exposure to base qty
        quantity = Math.floor(quantity / stepSize) * stepSize;
        
        let entryNotional = quantity * entryPrice;
        let marginRequired = entryNotional / leverage;
        
        // Ensure minimum notional requirement is met
        if (entryNotional < minNotional) {
          const minQuantity = Math.ceil(minNotional / entryPrice / stepSize) * stepSize;
          quantity = minQuantity;
          entryNotional = quantity * entryPrice;
          marginRequired = entryNotional / leverage;
        }
        
        // Guard: shrink if rounding exceeds available margin
        if (marginRequired > availableBalance) {
          const maxExposure = availableBalance * leverage;
          quantity = Math.floor((maxExposure / entryPrice) / stepSize) * stepSize;
          entryNotional = quantity * entryPrice;
          marginRequired = entryNotional / leverage;
        }
        
        if (quantity >= minQty && entryNotional >= minNotional) {
        
        if (marginRequired <= availableBalance) {
          // Calculate SL/TP based on user parameters
          const stopLossPct = slPercent;
          const takeProfitPct = tpPercent;
          
          const stopLossPrice = entryPrice * (1 + stopLossPct / 100);
          const takeProfitPrice = entryPrice * (1 - takeProfitPct / 100);
          
          const entryFee = (entryNotional * makerFee) / 100;
          
          position = {
            entry_price: entryPrice,
            entry_time: currentTime,
            type: 'sell', // SHORT position
            quantity: quantity
          };
          
          // Store SL/TP and fees in position metadata
          (position as any).stopLossPrice = stopLossPrice;
          (position as any).takeProfitPrice = takeProfitPrice;
          (position as any).entryFee = entryFee;
          (position as any).entryNotional = entryNotional;
          
          availableBalance -= marginRequired;
          lockedMargin += marginRequired;
          
          // Initialize trailing stop for SHORT position
          if (trailingStopManager) {
            trailingStopManager.initialize(entryPrice, 'sell');
          }
          
          console.log(`[${i}] 🔴 SHORT at ${entryPrice.toFixed(2)} - SL: ${stopLossPrice.toFixed(2)}, TP: ${takeProfitPrice.toFixed(2)}`);
          consecutiveInsufficientBalance = 0; // Reset counter on successful trade
        }
        } else {
          constraintRejections++;
          consecutiveInsufficientBalance++; // Increment counter when can't trade
          // Removed verbose rejection logging to prevent CPU timeout
        }
      }
    }
    
    // Removed opposite signal exits - now only exits via SL/TP/Trailing
    
    // Update balance history
    const currentBalance = balance + (position ? (currentPrice - position.entry_price) * position.quantity : 0);
    balanceHistory.push({ time: currentTime, balance: currentBalance });
    
    // Update max balance and drawdown
    if (currentBalance > maxBalance) {
      maxBalance = currentBalance;
    }
    const currentDrawdown = ((maxBalance - currentBalance) / maxBalance) * 100;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
  }

  // Close any remaining position
  if (position) {
    const finalCandle = candles[candles.length - 1];
    const exitPrice = finalCandle.close * (1 - slippage);
    const profit = (exitPrice - position.entry_price) * position.quantity;
    const fees = (position.entry_price * position.quantity * makerFee) + (exitPrice * position.quantity * takerFee);
    const netProfit = profit - fees;
    
    balance += netProfit;
    availableBalance += lockedMargin + netProfit;
    
    position.exit_price = exitPrice;
    position.exit_time = finalCandle.open_time;
    position.profit = netProfit;
    (position as any).exit_reason = 'END_OF_BACKTEST';
    
    trades.push(position);
    
    console.log(`Final SELL at ${exitPrice.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Final Balance: ${balance.toFixed(2)}`);
  }

  // Debug summary (moved AFTER final position is closed)
  console.log(`[SMA-BACKTEST] Summary:
    - Total candles: ${candles.length}
    - Golden crosses detected: ${goldenCrossCount}
    - Death crosses detected: ${deathCrossCount}
    - Total crossovers: ${goldenCrossCount + deathCrossCount}
    - RSI rejections: ${rsiRejections}
    - Volume rejections: ${volumeRejections}
    - Exchange constraint rejections: ${constraintRejections}
    - Trades executed: ${trades.length}
    - Filter pass rate: ${((trades.length / (goldenCrossCount + deathCrossCount)) * 100).toFixed(2)}%`);

  // Calculate performance metrics
  const totalTrades = trades.length;
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winTrades = trades.filter(t => (t.profit || 0) > 0).length;
  const loseTrades = totalTrades - winTrades;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const avgWin = trades.filter(t => (t.profit || 0) > 0).reduce((sum, t) => sum + (t.profit || 0), 0) / Math.max(winTrades, 1);
  const avgLoss = trades.filter(t => (t.profit || 0) < 0).reduce((sum, t) => sum + (t.profit || 0), 0) / Math.max(totalTrades - winTrades, 1);
  const profitFactor = Math.abs(avgWin * winTrades) / Math.abs(avgLoss * (totalTrades - winTrades));

  const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[SMA-BACKTEST] ✅ Completed in ${executionTime}s`);
  console.log(`SMA Crossover Backtest Results:`);
  console.log(`- Total Return: ${totalReturn.toFixed(2)}%`);
  console.log(`- Total Trades: ${totalTrades}`);
  console.log(`- Win Rate: ${winRate.toFixed(2)}%`);
  console.log(`- Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`- Profit Factor: ${profitFactor.toFixed(2)}`);

  // Save results to database
  const { error } = await supabaseClient
    .from('strategy_backtest_results')
    .insert({
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_balance: initialBalance,
      final_balance: balance,
      total_return: totalReturn,
      total_trades: totalTrades,
      winning_trades: winTrades,
      losing_trades: loseTrades,
      win_rate: winRate,
      max_drawdown: maxDrawdown,
      profit_factor: profitFactor,
      trades: trades,
      balance_history: balanceHistory
    });

  if (error) {
    console.error('Error saving backtest results:', error);
  }

  // Normalize trades before returning
  const normalizedTrades = normalizeTrades(trades);
  
  return new Response(
    JSON.stringify({
      success: true,
      results: {
        initialBalance,
        finalBalance: balance,
        totalReturn,
        totalTrades: normalizedTrades.length,
        winRate,
        maxDrawdown,
        profitFactor,
        trades: normalizedTrades,
        balanceHistory
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ============= MTF MOMENTUM STRATEGY IMPLEMENTATION =============
// Helper function to sample candles for large datasets
function sampleCandles(candles: Candle[], maxCandles: number): Candle[] {
  if (candles.length <= maxCandles) return candles;
  
  const step = Math.ceil(candles.length / maxCandles);
  const sampled = candles.filter((_, index) => index % step === 0);
  
  console.log(`[BACKTEST-SAMPLING] Reduced ${candles.length} → ${sampled.length} candles (step: ${step})`);
  return sampled;
}

async function runMTFMomentumBacktest(
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
  console.log('Initializing MTF Momentum backtest...');
  
  // Extract SL/TP parameters for use throughout the function
  const slPercent = stopLossPercent || strategy.stop_loss_percent || 2.0;
  const tpPercent = takeProfitPercent || strategy.take_profit_percent || 4.0;
  
  let balance = initialBalance || strategy.initial_capital || 10000;
  let availableBalance = balance;
  let lockedMargin = 0;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [{ time: candles[0].open_time, balance }];

  // Get dynamic exchange constraints based on symbol
  const exchangeType = strategy.exchange_type || 'bybit';
  const symbol = strategy.symbol || 'BTCUSDT';
  const constraints = exchangeType === 'bybit' 
    ? getBybitConstraints(symbol)
    : getBybitConstraints(symbol);
  
  const { stepSize, minQty, minNotional } = constraints;
  console.log(`[MTF-BACKTEST] Using ${exchangeType} constraints:`, { stepSize, minQty, minNotional });

  // Get unified strategy configuration from database
  console.log(`[MTF-BACKTEST] 🔍 DEBUG: About to get strategy config...`);
  const config = getStrategyBacktestConfig(strategy, 'mtf_momentum');
  console.log(`[MTF-BACKTEST] 🔍 DEBUG: Strategy config loaded successfully`);

  // Apply data sampling for large datasets - FORCE SAMPLING TO ALWAYS RUN
  try {
    const MAX_CANDLES = 5000;
    console.log(`[MTF-BACKTEST] 🔍 DEBUG: Original candles: ${candles.length}, MAX_CANDLES: ${MAX_CANDLES}`);
    console.log(`[MTF-BACKTEST] 🔍 DEBUG: sampleCandles function exists: ${typeof sampleCandles}`);
    
    // FORCE SAMPLING - Always sample to prevent CPU timeout
    console.log(`[MTF-BACKTEST] 🔍 DEBUG: FORCING sampling to prevent CPU timeout...`);
    candles = sampleCandles(candles, MAX_CANDLES);
    console.log(`[MTF-BACKTEST] 🔍 DEBUG: After FORCED sampling: ${candles.length} candles`);
  } catch (error) {
    console.error(`[MTF-BACKTEST] 🔍 ERROR in sampling:`, error);
    // Fallback: manually limit candles to prevent CPU timeout
    if (candles.length > 5000) {
      console.log(`[MTF-BACKTEST] 🔍 FALLBACK: Manually limiting candles from ${candles.length} to 5000`);
      candles = candles.slice(0, 5000);
    }
  }

  // FINAL SAFETY CHECK: Always limit candles to prevent CPU timeout
  if (candles.length > 5000) {
    console.log(`[MTF-BACKTEST] 🔍 FINAL SAFETY: Limiting candles from ${candles.length} to 5000`);
    candles = candles.slice(0, 5000);
  }

  const startTime = Date.now();
  console.log(`[MTF-BACKTEST] Starting optimization: ${candles.length} 1m candles`);
  console.log(`Strategy config:`, config);

  // Initialize Trailing Stop Manager if configured
  let trailingStopManager: any = null;
  if (trailingStopPercent && trailingStopPercent > 0) {
    trailingStopManager = {
      maxProfitPercent: 0,
      trailingPercent: trailingStopPercent,
      isActive: false,
      entryPrice: 0,
      positionType: 'buy' as 'buy' | 'sell',
      
      initialize(entryPrice: number, positionType: 'buy' | 'sell'): void {
        this.entryPrice = entryPrice;
        this.positionType = positionType;
        this.maxProfitPercent = 0;
        this.isActive = false;
        console.log(`[MTF TRAILING] Initialized for ${positionType} at ${entryPrice.toFixed(2)}`);
      },
      
      checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string } {
        if (!this.isActive) {
          const currentProfitPercent = this.calculateProfitPercent(currentPrice);
          if (currentProfitPercent > 0) {
          this.isActive = true;
          this.maxProfitPercent = currentProfitPercent;
          return { shouldClose: false, reason: 'TRAILING_ACTIVATED' };
          }
          return { shouldClose: false, reason: 'NO_PROFIT_YET' };
        }
        
        const currentProfitPercent = this.calculateProfitPercent(currentPrice);
        if (currentProfitPercent > this.maxProfitPercent) {
          this.maxProfitPercent = currentProfitPercent;
        }
        
        const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
        
        if (currentProfitPercent < trailingThreshold) {
          return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED' };
        }
        
        return { shouldClose: false, reason: 'TRAILING_ACTIVE' };
      },
      
      calculateProfitPercent(currentPrice: number): number {
        if (this.positionType === 'buy') {
          return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
        } else {
          return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
        }
      },
      
      reset(): void {
        this.maxProfitPercent = 0;
        this.isActive = false;
        this.entryPrice = 0;
      }
    };
  }

  // Get multi-timeframe data (1m, 5m, 15m)
  const candles1m = candles;
  const candles5m = resampleCandles(candles, '5m');
  const candles15m = resampleCandles(candles, '15m');
  
  console.log(`[MTF-BACKTEST] Resampled: ${candles5m.length} 5m → ${candles15m.length} 15m candles`);
  
  // Validate minimum data requirements
  const minRequiredCandles = Math.max(config.mtf_rsi_period, config.mtf_macd_slow) + 10;
  if (candles1m.length < minRequiredCandles || candles5m.length < minRequiredCandles || candles15m.length < minRequiredCandles) {
    const debugMode = false; // Debug mode disabled
    if (debugMode) {
      console.log(JSON.stringify({ type: 'debug', scope: 'MTF-BACKTEST', event: 'INDICATOR_WINDOW_MISSING', candles1m: candles1m.length, candles5m: candles5m.length, candles15m: candles15m.length, required: minRequiredCandles }));
    }
    return new Response(JSON.stringify({ success: false, error: 'Insufficient data for MTF analysis' }), { headers: corsHeaders });
  }

  // PRE-CALCULATE ALL INDICATORS ONCE (O(n) instead of O(n³))
  const closes1m = candles1m.map(c => c.close);
  const closes5m = candles5m.map(c => c.close);
  const closes15m = candles15m.map(c => c.close);
  
  console.log(`[MTF-BACKTEST] Pre-calculating indicators...`);
  const rsi1m = calculateRSI(closes1m, config.mtf_rsi_period);
  const rsi5m = calculateRSI(closes5m, config.mtf_rsi_period);
  const rsi15m = calculateRSI(closes15m, config.mtf_rsi_period);
  
  const macd1m = calculateMACD(closes1m);
  const macd5m = calculateMACD(closes5m);
  const macd15m = calculateMACD(closes15m);
  
  const atr1m = calculateATR(candles1m, 14);
  
  // OPTIMIZATION: Pre-import MTF evaluation function to avoid dynamic imports
  const { evaluateMTFMomentum } = await import('../helpers/mtf-momentum-strategy.ts');
  
  console.log(`[MTF-BACKTEST] ✅ Indicators ready, starting backtest loop...`);

  // Early termination tracking
  let consecutiveInsufficientBalance = 0;
  const MAX_INSUFFICIENT_BALANCE_CANDLES = 500;

  for (let i = Math.max(config.mtf_rsi_period, config.mtf_macd_slow); i < candles.length; i++) {
    // Early termination if balance too low
    if (!position && consecutiveInsufficientBalance >= MAX_INSUFFICIENT_BALANCE_CANDLES) {
      console.log(`[MTF-BACKTEST] ⚠️ Terminating early: Insufficient balance for ${MAX_INSUFFICIENT_BALANCE_CANDLES} candles`);
      break;
    }
    const currentCandle = candles[i];
    const currentPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
    
    // Synchronize indices across timeframes
    const index5m = Math.floor(i / 5);
    const index15m = Math.floor(i / 15);
    
    // Guard against missing windows
    if (index5m >= candles5m.length || index15m >= candles15m.length) {
      const debugMode = false; // Debug mode disabled
      if (debugMode) {
        console.log(JSON.stringify({ type: 'debug', scope: 'MTF-BACKTEST', event: 'INDICATOR_WINDOW_MISSING', i, index5m, index15m, len5m: candles5m.length, len15m: candles15m.length }));
      }
      continue;
    }
    const currentTime = currentCandle.open_time;
    
    // Check SL/TP first (priority over trailing stop)
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
            exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
          } else {
            exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
        }
      } else {
        const slHit = currentCandle.high >= stopLossPrice;
        const tpHit = currentCandle.low <= takeProfitPrice;
        
        if (slHit && tpHit) {
          const distToSL = Math.abs(currentPrice - stopLossPrice);
          const distToTP = Math.abs(currentPrice - takeProfitPrice);
          if (distToSL <= distToTP) {
            exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
          } else {
            exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
        }
      }
      
      if (exitPrice) {
        const exitPriceWithSlippage = position.type === 'buy'
          ? exitPrice * (1 - slippage)
          : exitPrice * (1 + slippage);
        
        const pnl = position.type === 'buy'
          ? position.quantity * (exitPriceWithSlippage - position.entry_price)
          : position.quantity * (position.entry_price - exitPriceWithSlippage);
        
        const exitNotional = position.quantity * exitPriceWithSlippage;
        const exitFee = (exitNotional * takerFee) / 100;
        const entryFee = (position as any).entryFee || 0;
        const netProfit = pnl - entryFee - exitFee;
        
        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentTime;
        position.profit = netProfit;
        
        balance += netProfit;
        availableBalance += lockedMargin + netProfit;
        lockedMargin = 0;
        
        trades.push(position);
        position = null;
        
        if (trailingStopManager) {
          trailingStopManager.reset();
        }
        
        // Track balance on trade exit
        balanceHistory.push({ time: currentTime, balance });
        
        console.log(`[${i}] MTF ${exitReason} at ${exitPriceWithSlippage.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
        continue;
      }
      
      // Check trailing stop (secondary)
      if (trailingStopManager) {
        const trailingResult = trailingStopManager.checkTrailingStop(currentPrice);
        if (trailingResult.shouldClose) {
          const exitPriceWithSlippage = position.type === 'buy'
            ? currentPrice * (1 - slippage)
            : currentPrice * (1 + slippage);
          
          const pnl = position.type === 'buy'
            ? position.quantity * (exitPriceWithSlippage - position.entry_price)
            : position.quantity * (position.entry_price - exitPriceWithSlippage);
          
          const exitNotional = position.quantity * exitPriceWithSlippage;
          const exitFee = (exitNotional * takerFee) / 100;
          const entryFee = (position as any).entryFee || 0;
          const netProfit = pnl - entryFee - exitFee;
          
          position.exit_price = exitPriceWithSlippage;
          position.exit_time = currentTime;
          position.profit = netProfit;
          
          balance += netProfit;
          availableBalance += lockedMargin + netProfit;
          lockedMargin = 0;
          
          trades.push(position);
          position = null;
          trailingStopManager.reset();
          
          console.log(`[${i}] MTF TRAILING STOP at ${exitPriceWithSlippage.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
          continue;
        }
      }
    }
    
  // ✅ FIXED: Proper multi-timeframe data synchronization
  // Find the closest 5m and 15m candles to current 1m candle
  
  // Find 5m candle that contains this 1m candle
  let idx5m = -1;
  for (let j = 0; j < candles5m.length; j++) {
    if (candles5m[j].open_time <= currentTime && 
        (j === candles5m.length - 1 || candles5m[j + 1].open_time > currentTime)) {
      idx5m = j;
      break;
    }
  }
  
  // Find 15m candle that contains this 1m candle
  let idx15m = -1;
  for (let j = 0; j < candles15m.length; j++) {
    if (candles15m[j].open_time <= currentTime && 
        (j === candles15m.length - 1 || candles15m[j + 1].open_time > currentTime)) {
      idx15m = j;
      break;
    }
  }
  
  // Skip if we don't have valid multi-timeframe data
  if (idx5m < 0 || idx15m < 0 || i < 50) {
    continue;
  }
  
  const currentRSI1m = rsi1m[i];
  const currentRSI5m = rsi5m[idx5m];
  const currentRSI15m = rsi15m[idx15m];
  
  const currentMACD1m = macd1m.histogram[i];
  const currentMACD5m = macd5m.histogram[idx5m];
  const currentMACD15m = macd15m.histogram[idx15m];
  
  // FIXED: Calculate volume ratio for each candle
  const currentVolume = currentCandle.volume;
  const recentVolumes = candles1m.slice(Math.max(0, i - 19), i + 1).map(c => c.volume);
  const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;
    
    // OPTIMIZED: Use pre-imported helper function for MTF evaluation (matches real-time monitoring)
    // Prepare candle slices (same as real-time monitoring)
    const candles1mSlice = candles1m.slice(Math.max(0, i - 500), i + 1).map(c => ({
      open: c.open, high: c.high, low: c.low, 
      close: c.close, volume: c.volume, timestamp: c.open_time
    }));
    
    const candles5mSlice = candles5m.slice(Math.max(0, idx5m - 200), idx5m + 1).map(c => ({
      open: c.open, high: c.high, low: c.low, 
      close: c.close, volume: c.volume, timestamp: c.open_time
    }));
    
    const candles15mSlice = candles15m.slice(Math.max(0, idx15m - 100), idx15m + 1).map(c => ({
      open: c.open, high: c.high, low: c.low, 
      close: c.close, volume: c.volume, timestamp: c.open_time
    }));
    
    // Evaluate using helper function
    const mtfSignal = evaluateMTFMomentum(
      candles1mSlice,
      candles5mSlice,
      candles15mSlice,
      {
        rsi_period: config.mtf_rsi_period,
        rsi_entry_threshold: config.mtf_rsi_entry_threshold || 55, // Changed from 45 to 55
        macd_fast: config.mtf_macd_fast,
        macd_slow: config.mtf_macd_slow,
        macd_signal: config.mtf_macd_signal,
        volume_multiplier: config.mtf_volume_multiplier * 1.5, // Increase by 50%
        atr_sl_multiplier: 1.5,
        atr_tp_multiplier: 2.0,
        trailing_stop_percent: 0.5,
        max_position_time: 30,
        min_profit_percent: 0.2
      },
      position !== null
    );
    
    // Position cooldown logic
    const lastTradeTime = trades.length > 0 ? trades[trades.length - 1].exit_time || 0 : 0;
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes
    const inCooldown = (currentCandle.open_time - lastTradeTime) < cooldownPeriod;

    // Daily trade limit
    const today = new Date(currentCandle.open_time).toDateString();
    const todayTrades = trades.filter(t => new Date(t.entry_time).toDateString() === today).length;
    const dailyLimitReached = todayTrades >= 5;

    const mtfLongCondition = !position && !inCooldown && !dailyLimitReached && mtfSignal.signal_type === 'BUY';
    const mtfShortCondition = !position && !inCooldown && !dailyLimitReached && mtfSignal.signal_type === 'SELL';
    
    // Removed debug logging to prevent CPU timeout
    
    if (mtfLongCondition) {
      // Position sizing (margin-based)
      const positionSizePercent = strategy.position_size_percent || 100;
      const margin = availableBalance * (positionSizePercent / 100);
      
      const entryPrice = currentPrice * (1 + slippage);
      let quantity = (margin * leverage) / entryPrice;
      quantity = Math.floor(quantity / stepSize) * stepSize;
      
      let entryNotional = quantity * entryPrice;
      let marginRequired = entryNotional / leverage;
      
      if (marginRequired > availableBalance) {
        const maxExposure = availableBalance * leverage;
        quantity = Math.floor((maxExposure / entryPrice) / stepSize) * stepSize;
        entryNotional = quantity * entryPrice;
        marginRequired = entryNotional / leverage;
      }
      
      if (quantity >= minQty && entryNotional >= minNotional) {
        
        if (marginRequired <= availableBalance) {
          // Calculate SL/TP based on user parameters
          const stopLossPct = slPercent;
          const takeProfitPct = tpPercent;
          
          const stopLossPrice = entryPrice * (1 - stopLossPct / 100);
          const takeProfitPrice = entryPrice * (1 + takeProfitPct / 100);
          
          const entryFee = (entryNotional * makerFee) / 100;
          
          position = {
            entry_price: entryPrice,
            entry_time: currentTime,
            type: 'buy',
            quantity: quantity
          };
          
          // Store SL/TP and fees in position metadata
          (position as any).stopLossPrice = stopLossPrice;
          (position as any).takeProfitPrice = takeProfitPrice;
          (position as any).entryFee = entryFee;
          (position as any).entryNotional = entryNotional;
          
          availableBalance -= marginRequired;
          lockedMargin += marginRequired;
          
          // Initialize trailing stop for LONG position
          if (trailingStopManager) {
            trailingStopManager.initialize(entryPrice, 'buy');
          }
          
          console.log(`[${i}] MTF BUY at ${entryPrice.toFixed(2)} - SL: ${stopLossPrice.toFixed(2)}, TP: ${takeProfitPrice.toFixed(2)}`);
          consecutiveInsufficientBalance = 0; // Reset counter on successful trade
          
          // Track balance on trade entry
          balanceHistory.push({ time: currentTime, balance: availableBalance + lockedMargin });
        }
      }
      // Removed verbose rejection logging to prevent CPU timeout
    }
    
    // Handle SHORT entry (new SELL position)
    if (mtfShortCondition) {
      // Position sizing (margin-based)
      const positionSizePercent = strategy.position_size_percent || 100;
      const margin = availableBalance * (positionSizePercent / 100);
      
      const entryPrice = currentPrice * (1 - slippage); // Better price for SHORT
      let quantity = (margin * leverage) / entryPrice;
      quantity = Math.floor(quantity / stepSize) * stepSize;
      
      let entryNotional = quantity * entryPrice;
      let marginRequired = entryNotional / leverage;
      
      if (marginRequired > availableBalance) {
        const maxExposure = availableBalance * leverage;
        quantity = Math.floor((maxExposure / entryPrice) / stepSize) * stepSize;
        entryNotional = quantity * entryPrice;
        marginRequired = entryNotional / leverage;
      }
      
      if (quantity >= minQty && entryNotional >= minNotional) {
        
        if (marginRequired <= availableBalance) {
          // Calculate SL/TP based on user parameters
          const stopLossPct = slPercent;
          const takeProfitPct = tpPercent;
          
          const stopLossPrice = entryPrice * (1 + stopLossPct / 100);
          const takeProfitPrice = entryPrice * (1 - takeProfitPct / 100);
          
          const entryFee = (entryNotional * makerFee) / 100;
          
          position = {
            entry_price: entryPrice,
            entry_time: currentTime,
            type: 'sell',  // SHORT position
            quantity: quantity
          };
          
          // Store SL/TP and fees in position metadata
          (position as any).stopLossPrice = stopLossPrice;
          (position as any).takeProfitPrice = takeProfitPrice;
          (position as any).entryFee = entryFee;
          (position as any).entryNotional = entryNotional;
          
          availableBalance -= marginRequired;
          lockedMargin += marginRequired;
          
          // Initialize trailing stop for SHORT position
          if (trailingStopManager) {
            trailingStopManager.initialize(entryPrice, 'sell');
          }
          
          console.log(`[${i}] MTF SHORT at ${entryPrice.toFixed(2)} - SL: ${stopLossPrice.toFixed(2)}, TP: ${takeProfitPrice.toFixed(2)}`);
          consecutiveInsufficientBalance = 0;
          
          // Track balance on trade entry
          balanceHistory.push({ time: currentTime, balance: availableBalance + lockedMargin });
        }
      } else {
        consecutiveInsufficientBalance++;
        // Removed verbose rejection logging to prevent CPU timeout
      }
    }
    
    // Removed RSI-based exits and opposite signal exits - now only exits via SL/TP/Trailing

    // Update balance tracking
    balance = availableBalance + lockedMargin;
    
    // Only track balance on significant events (trades, not every candle)
    // balanceHistory.push({ time: currentTime, balance }); // Removed to prevent CPU timeout
    
    if (balance > maxBalance) maxBalance = balance;
    maxDrawdown = Math.max(maxDrawdown, ((maxBalance - balance) / maxBalance) * 100);
  }

  // Close any remaining position
  if (position) {
    const finalCandle = candles[candles.length - 1];
    const exitPrice = finalCandle.close * (1 - slippage);
    const pnl = position.quantity * (exitPrice - position.entry_price);
    const exitFee = (exitPrice * position.quantity * takerFee) / 100;
    const netProfit = pnl - exitFee;
    
    balance += netProfit;
    availableBalance += lockedMargin + netProfit;
    
    position.exit_price = exitPrice;
    position.exit_time = finalCandle.open_time;
    position.profit = netProfit;
    (position as any).exit_reason = 'END_OF_BACKTEST';
    
    trades.push(position);
    
    // Track balance on final position closure
    balanceHistory.push({ time: finalCandle.open_time, balance });
    
    console.log(`Final SELL at ${exitPrice.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Final Balance: ${balance.toFixed(2)}`);
  }

  // Calculate performance metrics
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winTrades = trades.filter(t => (t.profit || 0) > 0).length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const avgWin = trades.filter(t => (t.profit || 0) > 0).reduce((sum, t) => sum + (t.profit || 0), 0) / Math.max(winTrades, 1);
  const avgLoss = trades.filter(t => (t.profit || 0) < 0).reduce((sum, t) => sum + (t.profit || 0), 0) / Math.max(totalTrades - winTrades, 1);
  const profitFactor = Math.abs(avgWin * winTrades) / Math.abs(avgLoss * (totalTrades - winTrades));

  const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[MTF-BACKTEST] ✅ Completed in ${executionTime}s (${(candles.length / parseFloat(executionTime)).toFixed(0)} candles/sec)`);
  
  // Debug: Check balanceHistory size
  console.log(`[MTF-BACKTEST] 🔍 DEBUG: balanceHistory size: ${balanceHistory.length} entries`);
  console.log(`[MTF-BACKTEST] 🔍 DEBUG: trades size: ${trades.length} entries`);
  
  // Limit balanceHistory to prevent CPU timeout during serialization
  if (balanceHistory.length > 1000) {
    console.log(`[MTF-BACKTEST] 🔍 DEBUG: Limiting balanceHistory from ${balanceHistory.length} to 1000 entries`);
    const step = Math.ceil(balanceHistory.length / 1000);
    balanceHistory.splice(0, balanceHistory.length, ...balanceHistory.filter((_, index) => index % step === 0));
  }
  
  console.log(`MTF Momentum Backtest Results:`);
  console.log(`- Total Return: ${totalReturn.toFixed(2)}%`);
  console.log(`- Total Trades: ${totalTrades}`);
  console.log(`- Win Rate: ${winRate.toFixed(2)}%`);
  console.log(`- Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`- Profit Factor: ${profitFactor.toFixed(2)}`);

  // Save results to database
  const { error } = await supabaseClient
    .from('strategy_backtest_results')
    .insert({
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_balance: initialBalance,
      final_balance: balance,
      total_return: totalReturn,
      total_trades: totalTrades,
      winning_trades: winTrades,
      losing_trades: totalTrades - winTrades,
      win_rate: winRate,
      max_drawdown: maxDrawdown,
      profit_factor: profitFactor,
      // balance_history: balanceHistory, // Removed to prevent CPU timeout
      trades: trades
    });

  if (error) {
    console.error('Error saving MTF Momentum backtest results:', error);
  }

  // Normalize trades before returning
  const normalizedTrades = normalizeTrades(trades);
  
  return new Response(
    JSON.stringify({
      success: true,
      results: {
        initial_balance: initialBalance,
        final_balance: balance,
        total_return: totalReturn,
        total_trades: normalizedTrades.length,
        winning_trades: winTrades,
        losing_trades: totalTrades - winTrades,
        win_rate: winRate,
        max_drawdown: maxDrawdown,
        profit_factor: profitFactor,
        // balance_history: balanceHistory, // Removed to prevent CPU timeout
        trades: normalizedTrades
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Helper function to resample candles to different timeframes
function resampleCandles(candles: Candle[], timeframe: string): Candle[] {
  const interval = timeframe === '5m' ? 5 : timeframe === '15m' ? 15 : 1;
  if (interval === 1) return candles;
  
  const resampled: Candle[] = [];
  
  // Single-pass accumulation (O(n) instead of O(n²))
  for (let i = 0; i < candles.length; i += interval) {
    const endIdx = Math.min(i + interval, candles.length);
    
    // Initialize with first candle
    let high = candles[i].high;
    let low = candles[i].low;
    let volume = 0;
    
    // Accumulate without creating intermediate arrays
    for (let j = i; j < endIdx; j++) {
      if (candles[j].high > high) high = candles[j].high;
      if (candles[j].low < low) low = candles[j].low;
      volume += candles[j].volume;
    }
    
    resampled.push({
      open: candles[i].open,
      high,
      low,
      close: candles[endIdx - 1].close,
      volume,
      open_time: candles[i].open_time,
      close_time: candles[endIdx - 1].close_time
    });
  }
  
  return resampled;
}


// ============= MSTG (Multi-Strategy Trading Grid) IMPLEMENTATION =============
async function runMSTGBacktest(
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
  preloadedBenchmarkCandles?: Candle[] | null
) {
  const benchmarkSymbol = strategy.mstg_benchmark_symbol || 'BTCUSDT';
  console.log(`[MSTG] Starting MSTG backtest for ${strategy.symbol} vs ${benchmarkSymbol}`);
  
  // Use pre-loaded benchmark candles if available (CPU optimization)
  const benchmarkCandles: Candle[] = preloadedBenchmarkCandles || candles;
  
  if (!preloadedBenchmarkCandles) {
    console.warn('[MSTG] No pre-loaded benchmark data, using asset itself as benchmark');
  } else {
    console.log(`[MSTG] Using ${benchmarkCandles.length} pre-loaded benchmark candles`);
  }

  // Calculate MSTG components (optimized: reduced logging)
  const closes = candles.map(c => c.close);
  
  console.log(`[MSTG] Calculating indicators for ${closes.length} candles`);
  
  // 1. Momentum Score (M) - Normalized RSI
  const rsi = indicators.calculateRSI(closes, 14);
  const momentum = indicators.normalizeRSI(rsi);
  
  // 2. Trend Direction Score (T) - EMA10 vs EMA21
  const trendScore = indicators.calculateTrendScore(closes);
  
  // 3. Volatility Position Score (V) - Bollinger Band position
  const bbPosition = indicators.calculateBollingerPosition(candles, 20);
  const validBB = bbPosition.filter(v => !isNaN(v));
  console.log(`[MSTG Debug] BB Position: ${validBB.length} valid values, range: ${validBB.length > 0 ? `${Math.min(...validBB).toFixed(2)} to ${Math.max(...validBB).toFixed(2)}` : 'N/A'}`);
  
  // 4. Relative Strength Score (R) - Asset vs Benchmark
  const relativeStrength = indicators.calculateBenchmarkRelativeStrength(
    candles,
    benchmarkCandles,
    14
  );
  const validRS = relativeStrength.filter(v => !isNaN(v));
  console.log(`[MSTG Debug] Relative Strength: ${validRS.length} valid values, range: ${validRS.length > 0 ? `${Math.min(...validRS).toFixed(2)} to ${Math.max(...validRS).toFixed(2)}` : 'N/A'}`);
  
  // 5. Calculate Composite TS Score
  const weights = {
    wM: strategy.mstg_weight_momentum || 0.25,
    wT: strategy.mstg_weight_trend || 0.35,
    wV: strategy.mstg_weight_volatility || 0.20,
    wR: strategy.mstg_weight_relative || 0.20,
  };
  
  console.log(`[MSTG Debug] Weights: M=${weights.wM}, T=${weights.wT}, V=${weights.wV}, R=${weights.wR}`);
  
  const tsScore = indicators.calculateCompositeScore(
    momentum,
    trendScore,
    bbPosition,
    relativeStrength,
    weights
  );
  
  const validTS = tsScore.filter(v => !isNaN(v));
  console.log(`[MSTG Debug] Final TS Score: ${validTS.length} valid values out of ${tsScore.length}`);
  if (validTS.length > 0) {
    console.log(`[MSTG Debug] TS Score range: ${Math.min(...validTS).toFixed(2)} to ${Math.max(...validTS).toFixed(2)}`);
    console.log(`[MSTG Debug] Sample TS values [50-60]: ${tsScore.slice(50, 60).map(v => isNaN(v) ? 'NaN' : v.toFixed(2)).join(', ')}`);
  } else {
    console.error(`[MSTG Debug] ERROR: All TS scores are NaN! Cannot generate any trades.`);
  }
  
  // Trading parameters
  const longThreshold = strategy.mstg_long_threshold || 30;
  const shortThreshold = strategy.mstg_short_threshold || -30;
  const exitThreshold = strategy.mstg_exit_threshold || 0;
  const extremeThreshold = strategy.mstg_extreme_threshold || 60;
  
  console.log(`MSTG Parameters: Long=${longThreshold}, Short=${shortThreshold}, Exit=${exitThreshold}`);
  
  // Backtest simulation
  let balance = initialBalance || strategy.initial_capital || 10000;
  let availableBalance = balance;
  let lockedMargin = 0;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  let maxBalance = balance;
  let maxDrawdown = 0;
  const balanceHistory: { time: number; balance: number }[] = [{ time: candles[0].open_time, balance }];

  const stepSize = 0.00001;
  const minQty = 0.001;
  const minNotional = 10;

  // Find first valid TS score index dynamically
  let firstValidIndex = -1;
  for (let i = 0; i < tsScore.length; i++) {
    if (!isNaN(tsScore[i])) {
      firstValidIndex = i;
      break;
    }
  }
  
  if (firstValidIndex === -1) {
    console.error(`[MSTG Debug] ERROR: No valid TS scores found in entire dataset!`);
    throw new Error('No valid TS scores generated - check indicator calculations');
  }
  
  console.log(`[MSTG Debug] First valid TS score at index ${firstValidIndex} (out of ${candles.length} candles)`);
  console.log(`[MSTG Debug] Trading window: ${candles.length - firstValidIndex - 1} candles`);
  console.log(`[MSTG Debug] Date range: ${new Date(candles[0].open_time).toISOString()} to ${new Date(candles[candles.length - 1].open_time).toISOString()}`);
  
  let skippedNaN = 0;
  let entryChecks = 0;
  let signalsDetected = 0;
  
  // Start from first valid TS score + 1 (to allow for i-1 lookback)
  const startIndex = Math.max(firstValidIndex + 1, 1);
  console.log(`[MSTG Debug] Starting backtest from index ${startIndex}`);
  
  // Initialize Trailing Stop Manager if configured
  let trailingStopManager: any = null;
  if (trailingStopPercent && trailingStopPercent > 0) {
    trailingStopManager = {
      maxProfitPercent: 0,
      trailingPercent: trailingStopPercent,
      isActive: false,
      entryPrice: 0,
      positionType: 'buy' as 'buy' | 'sell',
      
      initialize(entryPrice: number, positionType: 'buy' | 'sell'): void {
        this.entryPrice = entryPrice;
        this.positionType = positionType;
        this.maxProfitPercent = 0;
        this.isActive = false;
        console.log(`[MSTG TRAILING] Initialized for ${positionType} at ${entryPrice.toFixed(2)}`);
      },
      
      checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string } {
        if (!this.isActive) {
          const currentProfitPercent = this.calculateProfitPercent(currentPrice);
          if (currentProfitPercent > 0) {
            this.isActive = true;
            this.maxProfitPercent = currentProfitPercent;
            console.log(`[MSTG TRAILING] Activated at ${currentProfitPercent.toFixed(2)}% profit`);
            return { shouldClose: false, reason: 'TRAILING_ACTIVATED' };
          }
          return { shouldClose: false, reason: 'NO_PROFIT_YET' };
        }
        
        const currentProfitPercent = this.calculateProfitPercent(currentPrice);
        if (currentProfitPercent > this.maxProfitPercent) {
          this.maxProfitPercent = currentProfitPercent;
          console.log(`[MSTG TRAILING] New max profit: ${currentProfitPercent.toFixed(2)}%`);
        }
        
        const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
        
        if (currentProfitPercent < trailingThreshold) {
          console.log(`[MSTG TRAILING] Triggered: ${currentProfitPercent.toFixed(2)}% < ${trailingThreshold.toFixed(2)}% (max: ${this.maxProfitPercent.toFixed(2)}%)`);
          return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED' };
        }
        
        return { shouldClose: false, reason: 'TRAILING_ACTIVE' };
      },
      
      calculateProfitPercent(currentPrice: number): number {
        if (this.positionType === 'buy') {
          return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
        } else {
          return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
        }
      },
      
      reset(): void {
        this.maxProfitPercent = 0;
        this.isActive = false;
        this.entryPrice = 0;
      }
    };
  }
  
  for (let i = startIndex; i < candles.length; i++) {
    const currentCandle = candles[i];
    const ts = tsScore[i - 1]; // Use previous candle to avoid look-ahead bias
    const prevTs = i > 1 ? tsScore[i - 2] : NaN;
    
    // Check trailing stop first (if position is open)
    if (position && trailingStopManager) {
      const currentPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
      const trailingResult = trailingStopManager.checkTrailingStop(currentPrice);
      if (trailingResult.shouldClose) {
        const exitPrice = currentPrice * (1 - slippage);
        const profit = (exitPrice - position.entry_price) * position.quantity;
        const entryFee = (position.entry_price * position.quantity * makerFee) / 100;
        const exitFee = (exitPrice * position.quantity * takerFee) / 100;
        const netProfit = profit - entryFee - exitFee;
        
        balance += netProfit;
        availableBalance += lockedMargin + netProfit;
        lockedMargin = 0;
        
        position.exit_price = exitPrice;
        position.exit_time = currentCandle.open_time;
        position.profit = netProfit;
        
        trades.push(position);
        position = null;
        trailingStopManager.reset();
        
        console.log(`[${i}] MSTG TRAILING STOP at ${exitPrice.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
        continue;
      }
    }
    
    if (isNaN(ts)) {
      skippedNaN++;
      continue;
    }

    const executionPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
    const priceWithSlippage = executionPrice * (1 + slippage / 100);

    // Check exit conditions first
    if (position) {
      let shouldExit = false;
      let exitReason = '';

      if (position.type === 'buy' && ts < exitThreshold) {
        shouldExit = true;
        exitReason = 'TS crossed below exit threshold';
      } else if (position.type === 'sell' && ts > exitThreshold) {
        shouldExit = true;
        exitReason = 'TS crossed above exit threshold';
      }

      // Extreme zone - partial profit or tighten stops
      if ((position.type === 'buy' && ts > extremeThreshold) || 
          (position.type === 'sell' && ts < -extremeThreshold)) {
        console.log(`Extreme zone detected at candle ${i}, TS=${ts.toFixed(2)}`);
      }

      if (shouldExit) {
        const exitPriceWithSlippage = position.type === 'buy' 
          ? priceWithSlippage * (1 - slippage / 100)
          : priceWithSlippage * (1 + slippage / 100);

        let pnl = 0;
        if (productType === 'futures') {
          pnl = position.type === 'buy'
            ? (exitPriceWithSlippage - position.entry_price) * position.quantity
            : (position.entry_price - exitPriceWithSlippage) * position.quantity;
          
          const exitFee = Math.abs(exitPriceWithSlippage * position.quantity * takerFee);
          pnl -= exitFee;
          
          availableBalance += lockedMargin + pnl;
          lockedMargin = 0;
        } else {
          const saleProceeds = exitPriceWithSlippage * position.quantity;
          const exitFee = saleProceeds * takerFee;
          pnl = saleProceeds - exitFee - (position.entry_price * position.quantity);
          availableBalance += saleProceeds - exitFee;
        }

        balance += pnl;
        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentCandle.open_time;
        position.profit = pnl;
        (position as any).exit_reason = exitReason;
        trades.push({ ...position });
        position = null;

        console.log(`Exit: ${exitReason}, PnL=${pnl.toFixed(2)}, Balance=${balance.toFixed(2)}`);
      }
    }

    // Check entry conditions
    if (!position) {
      entryChecks++;
      let shouldEnter = false;
      let entryType: 'buy' | 'sell' | null = null;

      if (ts > longThreshold) {
        shouldEnter = true;
        entryType = 'buy';
        signalsDetected++;
        if (signalsDetected <= 5) {
          console.log(`[MSTG Debug] [${i}] Long signal #${signalsDetected} detected: TS=${ts.toFixed(2)} > ${longThreshold}, Date=${new Date(currentCandle.open_time).toISOString()}`);
        }
      } else if (ts < shortThreshold) {
        shouldEnter = true;
        entryType = 'sell';
        signalsDetected++;
        if (signalsDetected <= 5) {
          console.log(`[MSTG Debug] [${i}] Short signal #${signalsDetected} detected: TS=${ts.toFixed(2)} < ${shortThreshold}, Date=${new Date(currentCandle.open_time).toISOString()}`);
        }
      }

      if (shouldEnter && entryType) {
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

        quantity = Math.floor(quantity / stepSize) * stepSize;
        notional = quantity * priceWithSlippage;
        
        if (quantity < minQty || notional < minNotional) {
          warnings.push(`[${new Date(currentCandle.open_time).toISOString()}] MSTG entry rejected: quantity=${quantity.toFixed(5)} (min=${minQty}) | notional=${notional.toFixed(2)} (min=${minNotional})`);
          continue;
        }

        const entryFee = notional * makerFee;
        const totalCost = productType === 'futures' ? margin + entryFee : notional + entryFee;
        
        if (totalCost > availableBalance) {
          continue;
        }

        availableBalance -= totalCost;
        if (productType === 'futures') {
          lockedMargin = margin;
        }

        position = {
          entry_price: priceWithSlippage,
          entry_time: currentCandle.open_time,
          type: entryType,
          quantity: quantity,
        };

        console.log(`Entry ${entryType}: TS=${ts.toFixed(2)}, Price=${priceWithSlippage.toFixed(2)}, Qty=${quantity.toFixed(5)}`);
      }
    }

    // Update balance history and drawdown
    balanceHistory.push({ time: currentCandle.open_time, balance });
    if (balance > maxBalance) {
      maxBalance = balance;
    }
    const drawdown = ((maxBalance - balance) / maxBalance) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Close any open position at end
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    
    let pnl = 0;
    if (productType === 'futures') {
      pnl = position.type === 'buy'
        ? (exitPrice - position.entry_price) * position.quantity
        : (position.entry_price - exitPrice) * position.quantity;
      availableBalance += lockedMargin + pnl;
      lockedMargin = 0;
    } else {
      const saleProceeds = exitPrice * position.quantity;
      pnl = saleProceeds - (position.entry_price * position.quantity);
      availableBalance += saleProceeds;
    }

    balance += pnl;
    position.exit_price = exitPrice;
    position.exit_time = lastCandle.open_time;
    position.profit = pnl;
    (position as any).exit_reason = 'END_OF_PERIOD';
    trades.push({ ...position });
  }

  // Calculate metrics
  const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
  const winningTrades = trades.filter(t => (t.profit || 0) > 0).length;
  const losingTrades = trades.filter(t => (t.profit || 0) < 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  console.log(`[MSTG Debug] Backtest Summary:`);
  console.log(`[MSTG Debug] - Total candles: ${candles.length}`);
  console.log(`[MSTG Debug] - Trading window: ${candles.length - startIndex} candles`);
  console.log(`[MSTG Debug] - Skipped NaN values: ${skippedNaN}`);
  console.log(`[MSTG Debug] - Entry checks: ${entryChecks}`);
  console.log(`[MSTG Debug] - Signals detected: ${signalsDetected}`);
  console.log(`[MSTG Debug] - Trades executed: ${trades.length}`);
  console.log(`[MSTG Debug] - Final balance: ${balance.toFixed(2)}, Win rate: ${winRate.toFixed(2)}%`);

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
      trades: trades,
      balance_history: balanceHistory
    });

  // Normalize trades before returning
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
        sharpe_ratio: null,
        profit_factor: null,
        trades: normalizedTrades,
        balance_history: balanceHistory,
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
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
  corsHeaders: any,
  trailingStopPercent?: number,
  stopLossPercent?: number,
  takeProfitPercent?: number,
  useFirstTouch: boolean = true,
  executeCloseOnNextOpen: boolean = true
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

  // Get unified strategy configuration from database
  const enhancedConfig = getStrategyBacktestConfig(strategy, '4h_reentry');
  
  // Session parameters (NY time 00:00-03:59)
  const sessionStart = "00:00";
  const sessionEnd = "03:59";
  const riskRewardRatio = enhancedConfig.riskRewardRatio || 2;

  // State tracking for 4h range
  let currentDayRange: { date: string; H_4h: number; L_4h: number } | null = null;
  let previousCandleBreakout: { type: 'above' | 'below' | null; candle: Candle } | null = null;

  console.log(`Processing ${candles.length} candles for 4h reentry logic...`);

  // Initialize Trailing Stop Manager if configured
  let trailingStopManager: any = null;
  if (trailingStopPercent && trailingStopPercent > 0) {
    trailingStopManager = {
      maxProfitPercent: 0,
      trailingPercent: trailingStopPercent,
      isActive: false,
      entryPrice: 0,
      positionType: 'buy' as 'buy' | 'sell',
      
      initialize(entryPrice: number, positionType: 'buy' | 'sell'): void {
        this.entryPrice = entryPrice;
        this.positionType = positionType;
        this.maxProfitPercent = 0;
        this.isActive = false;
        console.log(`[4H TRAILING] Initialized for ${positionType} at ${entryPrice.toFixed(2)}`);
      },
      
      checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string } {
        if (!this.isActive) {
          const currentProfitPercent = this.calculateProfitPercent(currentPrice);
          if (currentProfitPercent > 0) {
            this.isActive = true;
            this.maxProfitPercent = currentProfitPercent;
            console.log(`[4H TRAILING] Activated at ${currentProfitPercent.toFixed(2)}% profit`);
            return { shouldClose: false, reason: 'TRAILING_ACTIVATED' };
          }
          return { shouldClose: false, reason: 'NO_PROFIT_YET' };
        }
        
        const currentProfitPercent = this.calculateProfitPercent(currentPrice);
        if (currentProfitPercent > this.maxProfitPercent) {
          this.maxProfitPercent = currentProfitPercent;
          console.log(`[4H TRAILING] New max profit: ${currentProfitPercent.toFixed(2)}%`);
        }
        
        const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
        
        if (currentProfitPercent < trailingThreshold) {
          console.log(`[4H TRAILING] Triggered: ${currentProfitPercent.toFixed(2)}% < ${trailingThreshold.toFixed(2)}% (max: ${this.maxProfitPercent.toFixed(2)}%)`);
          return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED' };
        }
        
        return { shouldClose: false, reason: 'TRAILING_ACTIVE' };
      },
      
      calculateProfitPercent(currentPrice: number): number {
        if (this.positionType === 'buy') {
          return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
        } else {
          return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
        }
      },
      
      reset(): void {
        this.maxProfitPercent = 0;
        this.isActive = false;
        this.entryPrice = 0;
      }
    };
  }

  for (let i = 1; i < candles.length; i++) {
    const currentCandle = candles[i];
    const previousCandle = candles[i - 1];
    
    const nyTime = convertToNYTime(currentCandle.open_time);
    const currentDate = nyTime.toISOString().split('T')[0];
    
    // Check trailing stop first (if position is open)
    if (position && trailingStopManager) {
      const currentPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
      const trailingResult = trailingStopManager.checkTrailingStop(currentPrice);
      if (trailingResult.shouldClose) {
        const exitPrice = currentPrice * (1 - slippage);
        const profit = (exitPrice - position.entry_price) * position.quantity;
        const entryFee = (position.entry_price * position.quantity * makerFee) / 100;
        const exitFee = (exitPrice * position.quantity * takerFee) / 100;
        const netProfit = profit - entryFee - exitFee;
        
        balance += netProfit;
        availableBalance += lockedMargin + netProfit;
        lockedMargin = 0;
        
        position.exit_price = exitPrice;
        position.exit_time = currentCandle.open_time;
        position.profit = netProfit;
        
        trades.push(position);
        position = null;
        trailingStopManager.reset();
        
        console.log(`[${i}] 4H TRAILING STOP at ${exitPrice.toFixed(2)} - P&L: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
        continue;
      }
    }
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
        console.log(`[${i}] ${nyTimeStr} LONG re-entry signal: C_prev=${C_prev.toFixed(2)} < L_4h=${currentDayRange.L_4h.toFixed(2)}, C_curr=${C_curr.toFixed(2)} >= L_4h`);
      }
      // SHORT setup: C_{t-1} > H_4h AND C_t <= H_4h
      else if (C_prev > currentDayRange.H_4h && C_curr <= currentDayRange.H_4h) {
        shouldEnterShort = true;
        console.log(`[${i}] ${nyTimeStr} SHORT re-entry signal: C_prev=${C_prev.toFixed(2)} > H_4h=${currentDayRange.H_4h.toFixed(2)}, C_curr=${C_curr.toFixed(2)} <= H_4h`);
      }

      if (shouldEnterLong || shouldEnterShort) {
        // Apply enhanced filters before entry (matching evaluate4hReentry logic)
        if (i < 200) {
          // Need enough candles for indicators
          continue;
        }
        
        // Calculate indicators for filter checks
        const recentCandles = candles.slice(Math.max(0, i - 200), i + 1);
        const closes = recentCandles.map(c => c.close);
        const rsi = indicators.calculateRSI(closes, 14);
        const adx = indicators.calculateADX(recentCandles, 14);
        const bollinger = indicators.calculateBollingerBands(closes, enhancedConfig.bollinger_period || 20, enhancedConfig.bollinger_std || 2.0);
        const atr = indicators.calculateATR(recentCandles, 14);
        
        const currentRSI = rsi[rsi.length - 1];
        const currentADX = adx.adx[adx.adx.length - 1];
        const currentBollingerUpper = bollinger.upper[bollinger.upper.length - 1];
        const currentBollingerLower = bollinger.lower[bollinger.lower.length - 1];
        const currentBollingerMiddle = bollinger.middle[bollinger.middle.length - 1];
        const currentPrice = currentCandle.close;
        const bollingerPosition = (currentPrice - currentBollingerLower) / (currentBollingerUpper - currentBollingerLower);
        
        // Calculate momentum score
        const prevPrice = recentCandles[recentCandles.length - 2].close;
        const priceChange = ((currentPrice - prevPrice) / prevPrice) * 100;
        const rsiScore = currentRSI > 50 ? 1 : -1;
        const momentumScore = (priceChange * 0.7) + (rsiScore * 0.3);
        
        // Calculate EMA20 for trend filter
        const ema20 = indicators.calculateEMA(closes, 20);
        const currentEMA20 = ema20[ema20.length - 1];
        const isBullishTrend = currentPrice > currentEMA20;
        const isBearishTrend = currentPrice < currentEMA20;
        
        // Volume confirmation
        const currentVolume = currentCandle.volume;
        const avgVolume = recentCandles.slice(-21, -1).reduce((sum, c) => sum + c.volume, 0) / 20;
        const volumeThreshold = enhancedConfig.volume_threshold || 1.1;
        const volumeConfirmed = currentVolume >= avgVolume * volumeThreshold;
        
        // Apply filters with optimized thresholds
        const adxThreshold = enhancedConfig.adx_threshold || 18;
        const rsiOversold = enhancedConfig.rsi_oversold || 20;
        const rsiOverbought = enhancedConfig.rsi_overbought || 80;
        const momentumThreshold = enhancedConfig.momentum_threshold || 8;
        
        const adxConfirmed = currentADX >= adxThreshold;
        const rsiConfirmed = currentRSI > rsiOversold && currentRSI < rsiOverbought;
        const momentumConfirmed = Math.abs(momentumScore) >= momentumThreshold;
        const bollingerConfirmed = bollingerPosition >= 0.0 && bollingerPosition <= 1.0;
        const trendConfirmed = shouldEnterLong ? isBullishTrend : isBearishTrend;
        
        // Check all filters
        if (!adxConfirmed || !rsiConfirmed || !momentumConfirmed || !bollingerConfirmed || !volumeConfirmed || !trendConfirmed) {
          console.log(`[${i}] ${nyTimeStr} ❌ ${shouldEnterLong ? 'LONG' : 'SHORT'} entry rejected - filters: ADX=${adxConfirmed ? '✓' : '✗'}(${currentADX.toFixed(1)}/${adxThreshold}), RSI=${rsiConfirmed ? '✓' : '✗'}(${currentRSI.toFixed(1)}/${rsiOversold}-${rsiOverbought}), Momentum=${momentumConfirmed ? '✓' : '✗'}(${Math.abs(momentumScore).toFixed(1)}/${momentumThreshold}), BB=${bollingerConfirmed ? '✓' : '✗'}, Vol=${volumeConfirmed ? '✓' : '✗'}(${(currentVolume/avgVolume).toFixed(2)}x/${volumeThreshold}x), Trend=${trendConfirmed ? '✓' : '✗'}`);
          continue;
        }
        
        console.log(`[${i}] ${nyTimeStr} ✅ ${shouldEnterLong ? 'LONG' : 'SHORT'} entry confirmed - all filters passed`);
        
        // Determine execution price FIRST
        let executionPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
        // If we execute on close but want exchange-like next-open fill, shift to next candle open when available
        if (executeCloseOnNextOpen && executionTiming === 'close' && (i + 1) < candles.length) {
          executionPrice = candles[i + 1].open;
        }
        const priceWithSlippage = shouldEnterLong 
          ? executionPrice * (1 + slippage / 100)
          : executionPrice * (1 - slippage / 100);
        
        // FIXED: Calculate SL/TP based on ACTUAL entry price with slippage
        const slPercent = stopLossPercent || strategy.stop_loss_percent || 5.0;
        const tpPercent = takeProfitPercent || strategy.take_profit_percent || 10.0;
        
        if (shouldEnterLong) {
          stopLossPrice = priceWithSlippage * (1 - slPercent / 100);
          takeProfitPrice = priceWithSlippage * (1 + tpPercent / 100);
        } else {
          stopLossPrice = priceWithSlippage * (1 + slPercent / 100);
          takeProfitPrice = priceWithSlippage * (1 - tpPercent / 100);
        }
        
        console.log(`[${i}] ${nyTimeStr} Entry Price: ${priceWithSlippage.toFixed(2)}, SL: ${stopLossPrice.toFixed(2)} (${slPercent}%), TP: ${takeProfitPrice.toFixed(2)} (${tpPercent}%)`);

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
        
        // Validate constraints with verbose logging
        const canEnter = quantity >= minQty && actualNotional >= minNotional && margin <= availableBalance;
        
        if (!canEnter) {
          const reason = quantity < minQty ? 'quantity < minQty' : actualNotional < minNotional ? 'notional < minNotional' : 'margin > availableBalance';
          warnings.push(`[${new Date(currentCandle.open_time).toISOString()}] 4h Reentry ${shouldEnterLong ? 'LONG' : 'SHORT'} rejected: quantity=${quantity.toFixed(5)} (min=${minQty}) | notional=${actualNotional.toFixed(2)} (min=${minNotional}) | ${reason}`);
          console.log(`[${i}] ${nyTimeStr} ❌ ENTRY REJECTED (${shouldEnterLong ? 'LONG' : 'SHORT'}): ${reason}`);
        }
        
        if (canEnter) {
          const entryFee = actualNotional * (takerFee / 100);
          
          position = {
            type: shouldEnterLong ? 'buy' : 'sell',
            entry_price: priceWithSlippage,
            entry_time: currentCandle.open_time,
            quantity,
            stopLossPrice,
            takeProfitPrice,
            entryFee,
          } as any;
          
          // Store dynamic SL/TP and entry fee in position metadata
          (position as any).id = trades.length + 1;
          (position as any).stopLossPrice = stopLossPrice;
          (position as any).takeProfitPrice = takeProfitPrice;
          (position as any).entryFee = entryFee; // FIXED: Store entry fee
          (position as any).entryNotional = actualNotional; // FIXED: Store entry notional
          
          // Deduct margin only (fees will be deducted from PnL)
          if (productType === 'futures') {
            lockedMargin = margin;
            availableBalance -= margin; // FIXED: Don't deduct entry fee from balance
          } else {
            availableBalance -= actualNotional; // FIXED: Don't deduct entry fee from balance
          }
          
          // Initialize trailing stop for position
          if (trailingStopManager) {
            trailingStopManager.initialize(priceWithSlippage, shouldEnterLong ? 'buy' : 'sell');
          }
          
          console.log(`[${i}] ${nyTimeStr} ✅ Opened ${shouldEnterLong ? 'LONG' : 'SHORT'} at ${priceWithSlippage.toFixed(2)}`);
          console.log(`  - Quantity: ${quantity.toFixed(5)}, Notional: ${actualNotional.toFixed(2)}, Margin: ${margin.toFixed(2)}`);
          console.log(`  - Entry Fee: ${entryFee.toFixed(2)} (${(takerFee).toFixed(3)}%)`);
          console.log(`  - SL: ${stopLossPrice.toFixed(2)}, TP: ${takeProfitPrice.toFixed(2)}`);
          console.log(`  - Available Balance: ${availableBalance.toFixed(2)}, Locked Margin: ${lockedMargin.toFixed(2)}`);
        }
      }
    } else {
      // Check for exit: SL/TP using intrabar logic
      const stopLossPrice = (position as any).stopLossPrice;
      const takeProfitPrice = (position as any).takeProfitPrice;
      
      // DISABLED: Opposite reentry signals (4h Reentry specific)
      // This was causing positions to close on signals instead of SL/TP
      // Now SL/TP have priority and positions only close on risk management
      let shouldExitOnSignal = false;
      let exitSignalReason = '';
      
      // DISABLED: Check for opposite reentry signals
      // if (position.type === 'buy') {
      //   // Exit LONG on SHORT reentry signal
      //   if (C_prev > currentDayRange.H_4h && C_curr <= currentDayRange.H_4h) {
      //     shouldExitOnSignal = true;
      //     exitSignalReason = 'SHORT_REENTRY_SIGNAL';
      //   }
      // } else if (position.type === 'sell') {
      //   // Exit SHORT on LONG reentry signal  
      //   if (C_prev < currentDayRange.L_4h && C_curr >= currentDayRange.L_4h) {
      //     shouldExitOnSignal = true;
      //     exitSignalReason = 'LONG_REENTRY_SIGNAL';
      //   }
      // }
      
      let exitPrice: number | null = null;
      let exitReason = '';
      
      // Priority 1: Check SL/TP first (most important for risk management)
      if (position.type === 'buy') {
        // LONG position
        const slHit = currentCandle.low <= stopLossPrice;
        const tpHit = currentCandle.high >= takeProfitPrice;
        
        if (slHit && tpHit) {
          if (useFirstTouch) {
            // First-touch heuristic using distance from open
            const distToSL = Math.abs((executionTiming === 'open' ? currentCandle.open : currentCandle.close) - stopLossPrice);
            const distToTP = Math.abs((executionTiming === 'open' ? currentCandle.open : currentCandle.close) - takeProfitPrice);
            if (distToSL <= distToTP) {
              exitPrice = stopLossPrice; exitReason = 'STOP_LOSS_FIRST_TOUCH';
            } else {
              exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT_FIRST_TOUCH';
            }
          } else {
            // Conservative
            exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
        }
      } else {
        // SHORT position
        const slHit = currentCandle.high >= stopLossPrice;
        const tpHit = currentCandle.low <= takeProfitPrice;
        
        if (slHit && tpHit) {
          if (useFirstTouch) {
            const distToSL = Math.abs((executionTiming === 'open' ? currentCandle.open : currentCandle.close) - stopLossPrice);
            const distToTP = Math.abs((executionTiming === 'open' ? currentCandle.open : currentCandle.close) - takeProfitPrice);
            if (distToSL <= distToTP) {
              exitPrice = stopLossPrice; exitReason = 'STOP_LOSS_FIRST_TOUCH';
            } else {
              exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT_FIRST_TOUCH';
            }
          } else {
            exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
          }
        } else if (slHit) {
          exitPrice = stopLossPrice; exitReason = 'STOP_LOSS';
        } else if (tpHit) {
          exitPrice = takeProfitPrice; exitReason = 'TAKE_PROFIT';
        }
      }
      
      // Priority 2: Check for opposite reentry signals (only if no SL/TP hit)
      if (!exitPrice && shouldExitOnSignal) {
        let execPrice = executionTiming === 'open' ? currentCandle.open : currentCandle.close;
        if (executeCloseOnNextOpen && executionTiming === 'close' && (i + 1) < candles.length) {
          execPrice = candles[i + 1].open;
        }
        exitPrice = execPrice;
        exitReason = exitSignalReason;
        console.log(`[${i}] ${nyTimeStr} 🚨 EXIT SIGNAL: ${exitSignalReason} at ${exitPrice.toFixed(2)}`);
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
        const entryFee = (position as any).entryFee || 0; // FIXED: Get entry fee from position
        const netProfit = pnl - entryFee - exitFee; // FIXED: Deduct both fees
        
        position.exit_price = exitPriceWithSlippage;
        position.exit_time = currentCandle.open_time;
        position.profit = netProfit;
        (position as any).profit_percent = (netProfit / (position.quantity * position.entry_price)) * 100;
        (position as any).exit_reason = exitReason;
        
        // Return funds
        if (productType === 'futures') {
          availableBalance += (lockedMargin + netProfit);
          lockedMargin = 0;
        } else {
          availableBalance += (exitNotional - exitFee);
        }
        
        balance = availableBalance + lockedMargin;
        trades.push(position);
        
        console.log(`[${i}] ❌ Closed ${position.type.toUpperCase()} via ${exitReason} at ${exitPriceWithSlippage.toFixed(2)}`);
        console.log(`  - Raw PnL: ${pnl.toFixed(2)}, Entry Fee: ${entryFee.toFixed(2)}, Exit Fee: ${exitFee.toFixed(2)}`);
        console.log(`  - Net Profit: ${netProfit.toFixed(2)}, Balance: ${balance.toFixed(2)}`);
        
        // Reset trailing stop
        if (trailingStopManager) {
          trailingStopManager.reset();
        }
        
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
    const entryFee = (position as any).entryFee || 0; // FIXED: Get entry fee from position
    const netProfit = pnl - entryFee - exitFee; // FIXED: Deduct both fees
    
    position.exit_price = exitPrice;
    position.exit_time = lastCandle.open_time;
    position.profit = netProfit;
    (position as any).profit_percent = (netProfit / (position.quantity * position.entry_price)) * 100;
    (position as any).exit_reason = 'END_OF_BACKTEST';
    
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

  // Exit reason summary
  const exitSummary = trades.reduce((acc: Record<string, number>, t: any) => {
    const reason = (t as any).exit_reason || 'UNKNOWN';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

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
      trades: trades,
      balance_history: balanceHistory
    });

  // Normalize trades before returning
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
        exit_summary: exitSummary,
        trades: normalizedTrades  // Move trades into results
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}