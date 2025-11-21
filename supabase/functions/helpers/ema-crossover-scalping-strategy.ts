// EMA Crossover Scalping Strategy
// Simple, fast scalping strategy using only 3 indicators
// - Fast EMA (9) for entry signals
// - Slow EMA (21) for trend filter
// - ATR (14) for risk management

import { Candle, BaseSignal, BaseConfig } from './strategy-interfaces.ts';

export interface EMACrossoverConfig extends BaseConfig {
  fast_ema_period: number;      // default 9
  slow_ema_period: number;      // default 21
  atr_period: number;           // default 14
  atr_sl_multiplier: number;    // default 1.0
  atr_tp_multiplier: number;    // default 1.5
  use_rsi_filter: boolean;      // default false
  rsi_period: number;           // default 14
  rsi_long_threshold: number;   // default 40
  rsi_short_threshold: number;  // default 60
  max_position_time: number;    // default 15 minutes (900 seconds)
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

// Main evaluation function
export function evaluateEMACrossoverScalping(
  candles: Candle[],
  index: number,
  config: EMACrossoverConfig,
  positionOpen: boolean,
  entryPrice?: number,
  entryTime?: number,
  positionType?: 'buy' | 'sell'  // Added to fix SHORT position profit calculation
): BaseSignal {
  
  const minCandles = Math.max(
    config.fast_ema_period,
    config.slow_ema_period,
    config.atr_period,
    config.use_rsi_filter ? config.rsi_period : 0
  ) + 5;
  
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
  const atr = calculateATR(recentCandles, config.atr_period);
  
  const currentFastEMA = fastEMA[fastEMA.length - 1];
  const prevFastEMA = fastEMA[fastEMA.length - 2];
  const currentSlowEMA = slowEMA[slowEMA.length - 1];
  const prevSlowEMA = slowEMA[slowEMA.length - 2];
  const currentATR = atr[atr.length - 1];
  
  // Optional RSI filter
  let rsiValue = 50; // neutral default
  if (config.use_rsi_filter) {
    const rsi = calculateRSI(closes, config.rsi_period);
    rsiValue = rsi[rsi.length - 1] || 50;
  }
  
  // Check for position exit first
  if (positionOpen && entryPrice && entryTime) {
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = (priceChange / entryPrice) * 100;
    
    // CRITICAL FIX: Reverse profit calculation for SHORT positions
    // For SHORT: price going DOWN is profit, price going UP is loss
    // For LONG: price going UP is profit, price going DOWN is loss
    const actualProfitPercent = positionType === 'sell' 
      ? -priceChangePercent  // Reverse for short: negative price change = positive profit
      : priceChangePercent;   // Normal for long: positive price change = positive profit
    
    // Time-based exit (max position time)
    const positionDuration = (currentTime - entryTime) / 1000; // in seconds
    if (positionDuration >= config.max_position_time) {
      return {
        signal_type: 'SELL',
        reason: `Time exit: ${positionDuration.toFixed(0)}s elapsed, PnL: ${actualProfitPercent.toFixed(2)}%`,
        confidence: 70
      };
    }
    
    // ATR-based stop loss (loss = negative profit)
    const stopLossDistance = currentATR * config.atr_sl_multiplier;
    const stopLossPercent = (stopLossDistance / currentPrice) * 100;
    if (actualProfitPercent <= -stopLossPercent) {
      return {
        signal_type: 'SELL',
        reason: `Stop loss hit: ${actualProfitPercent.toFixed(2)}% (ATR: ${currentATR.toFixed(2)})`,
        confidence: 90
      };
    }
    
    // ATR-based take profit (profit = positive profit)
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
    const rsiOk = !config.use_rsi_filter || rsiValue > config.rsi_long_threshold;
    
    if (bullishCrossover && priceAboveSlow && rsiOk) {
      const stopLoss = currentPrice - (currentATR * config.atr_sl_multiplier);
      const takeProfit = currentPrice + (currentATR * config.atr_tp_multiplier);
      
      return {
        signal_type: 'BUY',
        reason: `Bullish EMA crossover: Fast(${currentFastEMA.toFixed(2)}) > Slow(${currentSlowEMA.toFixed(2)})${config.use_rsi_filter ? `, RSI: ${rsiValue.toFixed(1)}` : ''}`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        confidence: 80,
        time_to_expire: config.max_position_time
      };
    }
    
    // SHORT signal: Fast EMA crosses below Slow EMA
    const bearishCrossover = prevFastEMA >= prevSlowEMA && currentFastEMA < currentSlowEMA;
    const priceBelowSlow = currentPrice < currentSlowEMA;
    const rsiOkShort = !config.use_rsi_filter || rsiValue < config.rsi_short_threshold;
    
    if (bearishCrossover && priceBelowSlow && rsiOkShort) {
      const stopLoss = currentPrice + (currentATR * config.atr_sl_multiplier);
      const takeProfit = currentPrice - (currentATR * config.atr_tp_multiplier);
      
      return {
        signal_type: 'SELL',
        reason: `Bearish EMA crossover: Fast(${currentFastEMA.toFixed(2)}) < Slow(${currentSlowEMA.toFixed(2)})${config.use_rsi_filter ? `, RSI: ${rsiValue.toFixed(1)}` : ''}`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        confidence: 80,
        time_to_expire: config.max_position_time
      };
    }
  }
  
  return { signal_type: null, reason: 'No crossover detected' };
}

// Default configuration
export function getDefaultEMACrossoverConfig(): EMACrossoverConfig {
  return {
    fast_ema_period: 9,
    slow_ema_period: 21,
    atr_period: 14,
    atr_sl_multiplier: 1.0,
    atr_tp_multiplier: 1.5,
    use_rsi_filter: false,
    rsi_period: 14,
    rsi_long_threshold: 40,
    rsi_short_threshold: 60,
    max_position_time: 900, // 15 minutes in seconds
    
    // BaseConfig required fields (not used but needed for interface)
    adx_threshold: 20,
    bollinger_period: 20,
    bollinger_std: 2.0,
    rsi_oversold: 30,
    rsi_overbought: 70,
    momentum_threshold: 10,
    volume_multiplier: 1.2,
    trailing_stop_percent: 0.75
  };
}
