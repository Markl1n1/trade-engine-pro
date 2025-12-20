// EMA Crossover Scalping Strategy
// ROLLBACK v1.1 - Restored to 41%+ win rate configuration
// - Fast EMA (9) for entry signals
// - Slow EMA (21) for trend filter
// - EMA 200 for global trend direction (CONFIDENCE REDUCTION, not blocking)
// - ATR (14) for risk management
// - RSI filter with RELAXED thresholds (35/65)

import { Candle, BaseSignal, BaseConfig } from './strategy-interfaces.ts';

export interface EMACrossoverConfig extends BaseConfig {
  fast_ema_period: number;      // default 9
  slow_ema_period: number;      // default 21
  global_ema_period: number;    // default 200 (global trend filter)
  atr_period: number;           // default 14
  atr_sl_multiplier: number;    // default 1.5 (RESTORED)
  atr_tp_multiplier: number;    // default 2.0 (RESTORED)
  use_rsi_filter: boolean;      // default true
  rsi_period: number;           // default 14
  rsi_long_threshold: number;   // default 35 (RESTORED - more permissive)
  rsi_short_threshold: number;  // default 65 (RESTORED - more permissive)
  max_position_time: number;    // default 15 minutes (900 seconds)
  use_trend_filter: boolean;    // default true (CONFIDENCE REDUCTION)
  use_volatility_filter: boolean; // default true (CONFIDENCE REDUCTION)
  volatility_multiplier: number;  // default 2.0
}

// Calculate EMA
function calculateEMA(values: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Start with SMA for first value
  let sum = 0;
  for (let i = 0; i < period && i < values.length; i++) {
    sum += values[i];
  }
  ema[period - 1] = sum / period;
  
  // Calculate EMA for remaining values
  for (let i = period; i < values.length; i++) {
    ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  
  return ema;
}

// Calculate ATR (Average True Range)
function calculateATR(candles: Candle[], period: number): number[] {
  const atr: number[] = [];
  const trueRanges: number[] = [];
  
  // Calculate True Range for each candle
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      const tr1 = candles[i].high - candles[i].low;
      const tr2 = Math.abs(candles[i].high - candles[i - 1].close);
      const tr3 = Math.abs(candles[i].low - candles[i - 1].close);
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }
  }
  
  // Calculate ATR using EMA of True Ranges
  const atrValues = calculateEMA(trueRanges, period);
  
  return atrValues;
}

// Calculate RSI
function calculateRSI(prices: number[], period: number): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate gains and losses
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate average gains and losses
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < period && i < gains.length; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  // Calculate RSI
  for (let i = period - 1; i < gains.length; i++) {
    if (i > period - 1) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsiValue = 100 - (100 / (1 + rs));
    rsi.push(rsiValue);
  }
  
  return rsi;
}

// Calculate average ATR for volatility comparison
function calculateAverageATR(atrValues: number[], period: number): number {
  if (atrValues.length < period) return atrValues[atrValues.length - 1] || 0;
  const recentATR = atrValues.slice(-period);
  return recentATR.reduce((sum, val) => sum + (val || 0), 0) / period;
}

// Check if current hour is low liquidity (22:00-06:00 UTC)
function isLowLiquidityHour(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  return hour >= 22 || hour < 6;
}

// Main evaluation function
export function evaluateEMACrossoverScalping(
  candles: Candle[],
  index: number,
  config: EMACrossoverConfig,
  positionOpen: boolean,
  entryPrice?: number,
  entryTime?: number,
  positionType?: 'buy' | 'sell'
): BaseSignal {
  
  const minCandles = Math.max(
    config.fast_ema_period,
    config.slow_ema_period,
    config.global_ema_period || 200,
    config.atr_period,
    config.use_rsi_filter ? config.rsi_period : 0
  ) + 10;
  
  if (index < minCandles) {
    return { signal_type: null, reason: 'Insufficient candles for indicators' };
  }
  
  const recentCandles = candles.slice(0, index + 1);
  const closes = recentCandles.map(c => c.close);
  const currentPrice = candles[index].close;
  const currentTime = candles[index].close_time || candles[index].timestamp || 0;
  
  // Calculate indicators
  const fastEMA = calculateEMA(closes, config.fast_ema_period);
  const slowEMA = calculateEMA(closes, config.slow_ema_period);
  const globalEMA = calculateEMA(closes, config.global_ema_period || 200);
  const atr = calculateATR(recentCandles, config.atr_period);
  
  const currentFastEMA = fastEMA[fastEMA.length - 1];
  const prevFastEMA = fastEMA[fastEMA.length - 2];
  const currentSlowEMA = slowEMA[slowEMA.length - 1];
  const prevSlowEMA = slowEMA[slowEMA.length - 2];
  const currentGlobalEMA = globalEMA[globalEMA.length - 1];
  const currentATR = atr[atr.length - 1];
  const avgATR = calculateAverageATR(atr, 20);
  
  // Optional RSI filter
  let rsiValue = 50; // neutral default
  if (config.use_rsi_filter) {
    const rsi = calculateRSI(closes, config.rsi_period);
    rsiValue = rsi[rsi.length - 1] || 50;
  }
  
  // Global trend direction
  const globalTrendBullish = currentPrice > currentGlobalEMA;
  const globalTrendBearish = currentPrice < currentGlobalEMA;
  
  // Volatility check
  const volatilityTooHigh = config.use_volatility_filter && 
    currentATR > avgATR * config.volatility_multiplier;
  
  // DIAGNOSTIC LOGGING
  console.log(`[EMA-CROSSOVER-DIAG] idx=${index} | Fast=${currentFastEMA.toFixed(4)} Slow=${currentSlowEMA.toFixed(4)} Global=${currentGlobalEMA.toFixed(4)} | RSI=${rsiValue.toFixed(1)} | ATR=${currentATR.toFixed(6)} avgATR=${avgATR.toFixed(6)} | TrendBull=${globalTrendBullish} VolHigh=${volatilityTooHigh}`);
  
  // Check for position exit first
  if (positionOpen && entryPrice && entryTime) {
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = (priceChange / entryPrice) * 100;
    
    // CRITICAL FIX: Reverse profit calculation for SHORT positions
    const actualProfitPercent = positionType === 'sell' 
      ? -priceChangePercent
      : priceChangePercent;
    
    // Time-based exit
    const positionDuration = (currentTime - entryTime) / 1000;
    if (positionDuration >= config.max_position_time) {
      console.log(`[EMA-CROSSOVER] ⏱️ TIME EXIT: ${positionDuration.toFixed(0)}s >= ${config.max_position_time}s, PnL: ${actualProfitPercent.toFixed(2)}%`);
      return {
        signal_type: 'SELL',
        reason: `Time exit: ${positionDuration.toFixed(0)}s elapsed, PnL: ${actualProfitPercent.toFixed(2)}%`,
        confidence: 70
      };
    }
    
    // ATR-based stop loss
    const stopLossDistance = currentATR * config.atr_sl_multiplier;
    const stopLossPercent = (stopLossDistance / currentPrice) * 100;
    if (actualProfitPercent <= -stopLossPercent) {
      console.log(`[EMA-CROSSOVER] 🛑 STOP LOSS: ${actualProfitPercent.toFixed(2)}% <= -${stopLossPercent.toFixed(2)}%`);
      return {
        signal_type: 'SELL',
        reason: `Stop loss hit: ${actualProfitPercent.toFixed(2)}% (ATR: ${currentATR.toFixed(2)})`,
        confidence: 90
      };
    }
    
    // ATR-based take profit
    const takeProfitDistance = currentATR * config.atr_tp_multiplier;
    const takeProfitPercent = (takeProfitDistance / currentPrice) * 100;
    if (actualProfitPercent >= takeProfitPercent) {
      console.log(`[EMA-CROSSOVER] 🎯 TAKE PROFIT: ${actualProfitPercent.toFixed(2)}% >= ${takeProfitPercent.toFixed(2)}%`);
      return {
        signal_type: 'SELL',
        reason: `Take profit hit: ${actualProfitPercent.toFixed(2)}% (Target: ${config.atr_tp_multiplier}x ATR)`,
        confidence: 95
      };
    }
    
    // Exit on opposite crossover
    if (prevFastEMA >= prevSlowEMA && currentFastEMA < currentSlowEMA) {
      console.log(`[EMA-CROSSOVER] ↩️ OPPOSITE CROSSOVER EXIT: PnL: ${actualProfitPercent.toFixed(2)}%`);
      return {
        signal_type: 'SELL',
        reason: `Opposite crossover exit: Fast EMA crossed below Slow EMA, PnL: ${actualProfitPercent.toFixed(2)}%`,
        confidence: 85
      };
    }
    
    return { signal_type: null, reason: 'Position open, monitoring' };
  }
  
  // Entry signals (only when no position is open)
  if (!positionOpen) {
    // LONG signal: Fast EMA crosses above Slow EMA
    const bullishCrossover = prevFastEMA <= prevSlowEMA && currentFastEMA > currentSlowEMA;
    const priceAboveSlow = currentPrice > currentSlowEMA;
    
    if (bullishCrossover && priceAboveSlow) {
      let confidence = 90;
      let reasons: string[] = [];
      
      // RSI filter - CONFIDENCE REDUCTION (not blocking)
      if (config.use_rsi_filter) {
        if (rsiValue < config.rsi_long_threshold) {
          confidence -= 15;
          reasons.push(`RSI weak (${rsiValue.toFixed(1)} < ${config.rsi_long_threshold})`);
          console.log(`[EMA-CROSSOVER] ⚠️ LONG confidence reduced: RSI ${rsiValue.toFixed(1)} < ${config.rsi_long_threshold}`);
        } else if (rsiValue > 70) {
          confidence -= 10;
          reasons.push(`RSI overbought (${rsiValue.toFixed(1)})`);
          console.log(`[EMA-CROSSOVER] ⚠️ LONG confidence reduced: RSI overbought ${rsiValue.toFixed(1)}`);
        }
      }
      
      // Trend filter - CONFIDENCE REDUCTION (not blocking)
      if (config.use_trend_filter && !globalTrendBullish) {
        confidence -= 20;
        reasons.push('counter-trend');
        console.log(`[EMA-CROSSOVER] ⚠️ LONG confidence reduced: Counter-trend (price below EMA 200)`);
      }
      
      // Volatility filter - CONFIDENCE REDUCTION (not blocking)
      if (volatilityTooHigh) {
        confidence -= 15;
        reasons.push('high volatility');
        console.log(`[EMA-CROSSOVER] ⚠️ LONG confidence reduced: High volatility ATR ${currentATR.toFixed(4)}`);
      }
      
      if (isLowLiquidityHour()) {
        confidence -= 10;
        reasons.push('low liquidity hour');
      }
      
      // Only block if confidence drops below minimum threshold
      if (confidence < 50) {
        console.log(`[EMA-CROSSOVER] ❌ LONG BLOCKED: Confidence too low (${confidence}%): ${reasons.join(', ')}`);
        return { signal_type: null, reason: `LONG blocked: Low confidence (${confidence}%)` };
      }
      
      const stopLoss = currentPrice - (currentATR * config.atr_sl_multiplier);
      const takeProfit = currentPrice + (currentATR * config.atr_tp_multiplier);
      
      console.log(`[EMA-CROSSOVER] 🚀 LONG ENTRY: Fast(${currentFastEMA.toFixed(4)}) > Slow(${currentSlowEMA.toFixed(4)}), Global=${currentGlobalEMA.toFixed(4)}, RSI=${rsiValue.toFixed(1)}, Confidence=${confidence}%, SL=${stopLoss.toFixed(4)}, TP=${takeProfit.toFixed(4)}`);
      
      return {
        signal_type: 'BUY',
        reason: `Bullish EMA crossover (conf: ${confidence}%, RSI: ${rsiValue.toFixed(1)}${reasons.length > 0 ? ', ' + reasons.join(', ') : ''})`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        confidence: confidence,
        time_to_expire: config.max_position_time
      };
    }
    
    // SHORT signal: Fast EMA crosses below Slow EMA
    const bearishCrossover = prevFastEMA >= prevSlowEMA && currentFastEMA < currentSlowEMA;
    const priceBelowSlow = currentPrice < currentSlowEMA;
    
    if (bearishCrossover && priceBelowSlow) {
      let confidence = 90;
      let reasons: string[] = [];
      
      // RSI filter - CONFIDENCE REDUCTION (not blocking)
      if (config.use_rsi_filter) {
        if (rsiValue > config.rsi_short_threshold) {
          confidence -= 15;
          reasons.push(`RSI strong (${rsiValue.toFixed(1)} > ${config.rsi_short_threshold})`);
          console.log(`[EMA-CROSSOVER] ⚠️ SHORT confidence reduced: RSI ${rsiValue.toFixed(1)} > ${config.rsi_short_threshold}`);
        } else if (rsiValue < 30) {
          confidence -= 10;
          reasons.push(`RSI oversold (${rsiValue.toFixed(1)})`);
          console.log(`[EMA-CROSSOVER] ⚠️ SHORT confidence reduced: RSI oversold ${rsiValue.toFixed(1)}`);
        }
      }
      
      // Trend filter - CONFIDENCE REDUCTION (not blocking)
      if (config.use_trend_filter && !globalTrendBearish) {
        confidence -= 20;
        reasons.push('counter-trend');
        console.log(`[EMA-CROSSOVER] ⚠️ SHORT confidence reduced: Counter-trend (price above EMA 200)`);
      }
      
      // Volatility filter - CONFIDENCE REDUCTION (not blocking)
      if (volatilityTooHigh) {
        confidence -= 15;
        reasons.push('high volatility');
        console.log(`[EMA-CROSSOVER] ⚠️ SHORT confidence reduced: High volatility ATR ${currentATR.toFixed(4)}`);
      }
      
      if (isLowLiquidityHour()) {
        confidence -= 10;
        reasons.push('low liquidity hour');
      }
      
      // Only block if confidence drops below minimum threshold
      if (confidence < 50) {
        console.log(`[EMA-CROSSOVER] ❌ SHORT BLOCKED: Confidence too low (${confidence}%): ${reasons.join(', ')}`);
        return { signal_type: null, reason: `SHORT blocked: Low confidence (${confidence}%)` };
      }
      
      const stopLoss = currentPrice + (currentATR * config.atr_sl_multiplier);
      const takeProfit = currentPrice - (currentATR * config.atr_tp_multiplier);
      
      console.log(`[EMA-CROSSOVER] 🔻 SHORT ENTRY: Fast(${currentFastEMA.toFixed(4)}) < Slow(${currentSlowEMA.toFixed(4)}), Global=${currentGlobalEMA.toFixed(4)}, RSI=${rsiValue.toFixed(1)}, Confidence=${confidence}%, SL=${stopLoss.toFixed(4)}, TP=${takeProfit.toFixed(4)}`);
      
      return {
        signal_type: 'SELL',
        reason: `Bearish EMA crossover (conf: ${confidence}%, RSI: ${rsiValue.toFixed(1)}${reasons.length > 0 ? ', ' + reasons.join(', ') : ''})`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        confidence: confidence,
        time_to_expire: config.max_position_time
      };
    }
  }
  
  return { signal_type: null, reason: 'No crossover detected' };
}

// Default configuration - RESTORED to 41%+ win rate version
export function getDefaultEMACrossoverConfig(): EMACrossoverConfig {
  return {
    fast_ema_period: 9,
    slow_ema_period: 21,
    global_ema_period: 200,          // EMA 200 for global trend
    atr_period: 14,
    atr_sl_multiplier: 1.5,          // RESTORED: Tighter stop for better R:R
    atr_tp_multiplier: 2.0,          // RESTORED: 1.33 R:R ratio
    use_rsi_filter: true,            // Enabled RSI filter
    rsi_period: 14,
    rsi_long_threshold: 35,          // RESTORED: RSI > 35 for LONG (permissive)
    rsi_short_threshold: 65,         // RESTORED: RSI < 65 for SHORT (permissive)
    max_position_time: 900,          // 15 minutes
    use_trend_filter: true,          // Enable trend filter (CONFIDENCE REDUCTION)
    use_volatility_filter: true,     // Enable volatility filter (CONFIDENCE REDUCTION)
    volatility_multiplier: 2.0,      // Skip if ATR > 2x average
    
    // BaseConfig required fields
    adx_threshold: 20,
    bollinger_period: 20,
    bollinger_std: 2.0,
    rsi_oversold: 30,
    rsi_overbought: 70,
    momentum_threshold: 10,
    volume_multiplier: 1.2,
    trailing_stop_percent: 1.0
  };
}
