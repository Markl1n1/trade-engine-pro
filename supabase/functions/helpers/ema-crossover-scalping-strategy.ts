// EMA Crossover Scalping Strategy
// Enhanced strategy with EMA 200 global trend filter for 50%+ win rate
// - Fast EMA (9) for entry signals
// - Slow EMA (21) for trend filter
// - EMA 200 for global trend direction
// - ATR (14) for risk management

import { Candle, BaseSignal, BaseConfig } from './strategy-interfaces.ts';

export interface EMACrossoverConfig extends BaseConfig {
  fast_ema_period: number;      // default 9
  slow_ema_period: number;      // default 21
  global_ema_period: number;    // default 200 (global trend filter)
  atr_period: number;           // default 14
  atr_sl_multiplier: number;    // default 1.0
  atr_tp_multiplier: number;    // default 1.5
  use_rsi_filter: boolean;      // default true (enabled for better filtering)
  rsi_period: number;           // default 14
  rsi_long_threshold: number;   // default 40
  rsi_short_threshold: number;  // default 60
  max_position_time: number;    // default 15 minutes (900 seconds)
  use_trend_filter: boolean;    // default true (EMA 200 trend filter)
  use_volatility_filter: boolean; // default true
  volatility_multiplier: number;  // default 2.0 (skip if ATR > 2x average)
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
      return {
        signal_type: 'SELL',
        reason: `Take profit hit: ${actualProfitPercent.toFixed(2)}% (Target: ${config.atr_tp_multiplier}x ATR)`,
        confidence: 95
      };
    }
    
    // Exit on opposite crossover
    if (prevFastEMA >= prevSlowEMA && currentFastEMA < currentSlowEMA) {
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
      // CRITICAL FIX: STRICT RSI filter - BLOCK if not in "strength zone"
      if (config.use_rsi_filter && (rsiValue < config.rsi_long_threshold || rsiValue > 70)) {
        console.log(`[EMA-CROSSOVER] ❌ LONG BLOCKED: RSI ${rsiValue.toFixed(1)} not in range ${config.rsi_long_threshold}-70`);
        return { signal_type: null, reason: `LONG blocked: RSI ${rsiValue.toFixed(1)} outside strength zone` };
      }
      
      // STRICT: Block if global trend is bearish and filter is enabled
      if (config.use_trend_filter && !globalTrendBullish) {
        console.log(`[EMA-CROSSOVER] ❌ LONG BLOCKED: Counter-trend (price below EMA 200)`);
        return { signal_type: null, reason: `LONG blocked: Counter-trend` };
      }
      
      // STRICT: Block if volatility too high
      if (volatilityTooHigh) {
        console.log(`[EMA-CROSSOVER] ❌ LONG BLOCKED: High volatility ATR ${currentATR.toFixed(4)} > ${(avgATR * config.volatility_multiplier).toFixed(4)}`);
        return { signal_type: null, reason: `LONG blocked: High volatility` };
      }
      
      let confidence = 90;
      
      if (isLowLiquidityHour()) {
        confidence -= 15;
      }
      
      const stopLoss = currentPrice - (currentATR * config.atr_sl_multiplier);
      const takeProfit = currentPrice + (currentATR * config.atr_tp_multiplier);
      
      console.log(`[EMA-CROSSOVER] 🚀 LONG ENTRY: Fast(${currentFastEMA.toFixed(2)}) > Slow(${currentSlowEMA.toFixed(2)}), Global EMA: ${currentGlobalEMA.toFixed(2)}, RSI: ${rsiValue.toFixed(1)}, Confidence: ${confidence}%`);
      
      return {
        signal_type: 'BUY',
        reason: `Bullish EMA crossover (Trend ALIGNED, RSI: ${rsiValue.toFixed(1)})`,
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
      // CRITICAL FIX: STRICT RSI filter - BLOCK if not in "weakness zone"
      if (config.use_rsi_filter && (rsiValue > config.rsi_short_threshold || rsiValue < 30)) {
        console.log(`[EMA-CROSSOVER] ❌ SHORT BLOCKED: RSI ${rsiValue.toFixed(1)} not in range 30-${config.rsi_short_threshold}`);
        return { signal_type: null, reason: `SHORT blocked: RSI ${rsiValue.toFixed(1)} outside weakness zone` };
      }
      
      // STRICT: Block if global trend is bullish and filter is enabled
      if (config.use_trend_filter && !globalTrendBearish) {
        console.log(`[EMA-CROSSOVER] ❌ SHORT BLOCKED: Counter-trend (price above EMA 200)`);
        return { signal_type: null, reason: `SHORT blocked: Counter-trend` };
      }
      
      // STRICT: Block if volatility too high
      if (volatilityTooHigh) {
        console.log(`[EMA-CROSSOVER] ❌ SHORT BLOCKED: High volatility ATR ${currentATR.toFixed(4)} > ${(avgATR * config.volatility_multiplier).toFixed(4)}`);
        return { signal_type: null, reason: `SHORT blocked: High volatility` };
      }
      
      let confidence = 90;
      
      if (isLowLiquidityHour()) {
        confidence -= 15;
      }
      
      const stopLoss = currentPrice + (currentATR * config.atr_sl_multiplier);
      const takeProfit = currentPrice - (currentATR * config.atr_tp_multiplier);
      
      console.log(`[EMA-CROSSOVER] 🔻 SHORT ENTRY: Fast(${currentFastEMA.toFixed(2)}) < Slow(${currentSlowEMA.toFixed(2)}), Global EMA: ${currentGlobalEMA.toFixed(2)}, RSI: ${rsiValue.toFixed(1)}, Confidence: ${confidence}%`);
      
      return {
        signal_type: 'SELL',
        reason: `Bearish EMA crossover (Trend ALIGNED, RSI: ${rsiValue.toFixed(1)})`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        confidence: confidence,
        time_to_expire: config.max_position_time
      };
    }
  }
  
  return { signal_type: null, reason: 'No crossover detected' };
}

// Default configuration - optimized for 50%+ win rate with STRICT filtering
export function getDefaultEMACrossoverConfig(): EMACrossoverConfig {
  return {
    fast_ema_period: 9,
    slow_ema_period: 21,
    global_ema_period: 200,          // EMA 200 for global trend
    atr_period: 14,
    atr_sl_multiplier: 2.0,          // WIDER: Give trades room to breathe
    atr_tp_multiplier: 3.0,          // WIDER: 1.5 R:R ratio (key for 50%+ profitability)
    use_rsi_filter: true,            // Enabled RSI filter (STRICT)
    rsi_period: 14,
    rsi_long_threshold: 45,          // RSI > 45 for LONG (momentum zone)
    rsi_short_threshold: 55,         // RSI < 55 for SHORT (weakness zone)
    max_position_time: 1800,         // 30 minutes (longer for trend)
    use_trend_filter: true,          // Enable global trend filter (STRICT)
    use_volatility_filter: true,     // Enable volatility filter (STRICT)
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
