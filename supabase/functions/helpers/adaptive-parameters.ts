/**
 * Adaptive Parameters Module
 * 
 * This module dynamically adjusts strategy parameters based on:
 * - Market volatility
 * - Trend strength
 * - Volume patterns
 * - Market regime
 */

export interface AdaptiveConfig {
  baseRSIThreshold: number;
  volatilityMultiplier: number;
  trendStrengthMultiplier: number;
  volumeMultiplier: number;
  regimeMultiplier: number;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_time: number;
  close_time: number;
}

export interface MarketRegime {
  regime: 'trending' | 'ranging' | 'volatile';
  strength: number;
  direction: 'up' | 'down' | 'sideways';
  confidence: number;
}

/**
 * Calculate Average True Range (ATR)
 */
function calculateATR(candles: Candle[], period: number): number[] {
  const atr: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    
    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);
    
    const trueRange = Math.max(tr1, tr2, tr3);
    atr.push(trueRange);
  }
  
  // Calculate ATR using Wilder's smoothing
  const atrValues: number[] = [];
  let atrSum = 0;
  
  for (let i = 0; i < atr.length; i++) {
    if (i < period) {
      atrSum += atr[i];
      if (i === period - 1) {
        atrValues.push(atrSum / period);
      }
    } else {
      atrSum = (atrSum * (period - 1) + atr[i]) / period;
      atrValues.push(atrSum);
    }
  }
  
  return atrValues;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
function calculateEMA(values: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period && i < values.length; i++) {
    sum += values[i];
  }
  ema.push(sum / period);
  
  // Calculate subsequent EMAs
  for (let i = period; i < values.length; i++) {
    const currentEMA = (values[i] * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
    ema.push(currentEMA);
  }
  
  return ema;
}

/**
 * Calculate RSI
 */
function calculateRSI(prices: number[], period: number): number[] {
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  const avgGains = calculateEMA(gains, period);
  const avgLosses = calculateEMA(losses, period);
  
  const rsi: number[] = [];
  for (let i = 0; i < avgGains.length; i++) {
    const rs = avgGains[i] / (avgLosses[i] || 0.0001);
    const rsiValue = 100 - (100 / (1 + rs));
    rsi.push(rsiValue);
  }
  
  return rsi;
}

/**
 * Calculate adaptive RSI threshold based on volatility
 */
export function calculateAdaptiveRSIThreshold(
  candles: Candle[],
  baseThreshold: number,
  config: AdaptiveConfig
): number {
  if (candles.length < 20) {
    return baseThreshold;
  }
  
  const atr = calculateATR(candles, 14);
  const currentATR = atr[atr.length - 1];
  const avgATR = atr.slice(-20).reduce((sum, val) => sum + val, 0) / 20;
  
  const volatilityRatio = currentATR / avgATR;
  
  // Adjust RSI threshold based on volatility
  let adjustedThreshold = baseThreshold;
  
  if (volatilityRatio > 1.5) {
    // High volatility - lower threshold for more signals
    adjustedThreshold = baseThreshold * 0.9;
  } else if (volatilityRatio < 0.7) {
    // Low volatility - higher threshold for fewer, better signals
    adjustedThreshold = baseThreshold * 1.1;
  }
  
  // Apply regime multiplier
  adjustedThreshold *= config.regimeMultiplier;
  
  // Ensure reasonable bounds
  return Math.max(30, Math.min(90, adjustedThreshold));
}

/**
 * Calculate adaptive volume multiplier based on current volume patterns
 */
export function calculateAdaptiveVolumeMultiplier(
  candles: Candle[],
  baseMultiplier: number,
  config: AdaptiveConfig
): number {
  if (candles.length < 20) {
    return baseMultiplier;
  }
  
  const volumes = candles.map(c => c.volume);
  const avgVolume = volumes.slice(-20).reduce((sum, vol) => sum + vol, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  
  const volumeRatio = currentVolume / avgVolume;
  
  let adjustedMultiplier = baseMultiplier;
  
  // Adjust volume multiplier based on current volume
  if (volumeRatio > 2) {
    // High volume - lower threshold for more signals
    adjustedMultiplier = baseMultiplier * 0.8;
  } else if (volumeRatio < 0.5) {
    // Low volume - higher threshold for fewer signals
    adjustedMultiplier = baseMultiplier * 1.5;
  }
  
  // Apply volume multiplier from config
  adjustedMultiplier *= config.volumeMultiplier;
  
  // Ensure reasonable bounds
  return Math.max(0.5, Math.min(3.0, adjustedMultiplier));
}

/**
 * Calculate adaptive stop loss based on volatility and trend strength
 */
export function calculateAdaptiveStopLoss(
  candles: Candle[],
  baseStopLoss: number,
  config: AdaptiveConfig
): number {
  if (candles.length < 20) {
    return baseStopLoss;
  }
  
  const atr = calculateATR(candles, 14);
  const currentATR = atr[atr.length - 1];
  const currentPrice = candles[candles.length - 1].close;
  
  // Calculate ATR-based stop loss
  const atrStopLoss = (currentATR / currentPrice) * 100; // Convert to percentage
  
  // Calculate trend strength
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const currentEMA20 = ema20[ema20.length - 1];
  const currentEMA50 = ema50[ema50.length - 1];
  
  const trendStrength = Math.abs(currentEMA20 - currentEMA50) / currentPrice * 100;
  
  // Adjust stop loss based on volatility and trend
  let adjustedStopLoss = baseStopLoss;
  
  if (atrStopLoss > baseStopLoss) {
    // Use ATR-based stop if it's wider
    adjustedStopLoss = atrStopLoss;
  }
  
  // Adjust for trend strength
  if (trendStrength > 2) {
    // Strong trend - wider stops
    adjustedStopLoss *= 1.2;
  } else if (trendStrength < 0.5) {
    // Weak trend - tighter stops
    adjustedStopLoss *= 0.8;
  }
  
  // Apply volatility multiplier
  adjustedStopLoss *= config.volatilityMultiplier;
  
  // Ensure reasonable bounds
  return Math.max(0.5, Math.min(10.0, adjustedStopLoss));
}

/**
 * Calculate adaptive take profit based on volatility and trend
 */
export function calculateAdaptiveTakeProfit(
  candles: Candle[],
  baseTakeProfit: number,
  config: AdaptiveConfig
): number {
  if (candles.length < 20) {
    return baseTakeProfit;
  }
  
  const atr = calculateATR(candles, 14);
  const currentATR = atr[atr.length - 1];
  const currentPrice = candles[candles.length - 1].close;
  
  // Calculate ATR-based take profit
  const atrTakeProfit = (currentATR / currentPrice) * 100 * 2; // 2x ATR for take profit
  
  // Calculate trend strength
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const currentEMA20 = ema20[ema20.length - 1];
  const currentEMA50 = ema50[ema50.length - 1];
  
  const trendStrength = Math.abs(currentEMA20 - currentEMA50) / currentPrice * 100;
  
  // Adjust take profit based on volatility and trend
  let adjustedTakeProfit = baseTakeProfit;
  
  if (atrTakeProfit > baseTakeProfit) {
    // Use ATR-based take profit if it's higher
    adjustedTakeProfit = atrTakeProfit;
  }
  
  // Adjust for trend strength
  if (trendStrength > 2) {
    // Strong trend - higher take profit
    adjustedTakeProfit *= 1.3;
  } else if (trendStrength < 0.5) {
    // Weak trend - lower take profit
    adjustedTakeProfit *= 0.8;
  }
  
  // Apply trend strength multiplier
  adjustedTakeProfit *= config.trendStrengthMultiplier;
  
  // Ensure reasonable bounds
  return Math.max(1.0, Math.min(20.0, adjustedTakeProfit));
}

/**
 * Calculate adaptive RSI overbought/oversold levels
 */
export function calculateAdaptiveRSILevels(
  candles: Candle[],
  baseOverbought: number,
  baseOversold: number,
  config: AdaptiveConfig
): { overbought: number; oversold: number } {
  if (candles.length < 20) {
    return { overbought: baseOverbought, oversold: baseOversold };
  }
  
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const currentRSI = rsi[rsi.length - 1];
  
  // Calculate RSI volatility
  const rsiVolatility = rsi.slice(-20).reduce((sum, val) => sum + Math.abs(val - 50), 0) / 20;
  
  let adjustedOverbought = baseOverbought;
  let adjustedOversold = baseOversold;
  
  // Adjust levels based on RSI volatility
  if (rsiVolatility > 15) {
    // High RSI volatility - wider bands
    adjustedOverbought = Math.min(85, baseOverbought + 5);
    adjustedOversold = Math.max(15, baseOversold - 5);
  } else if (rsiVolatility < 8) {
    // Low RSI volatility - tighter bands
    adjustedOverbought = Math.max(65, baseOverbought - 5);
    adjustedOversold = Math.min(35, baseOversold + 5);
  }
  
  // Adjust for current RSI level
  if (currentRSI > 70) {
    // Currently overbought - slightly lower threshold
    adjustedOverbought *= 0.95;
  } else if (currentRSI < 30) {
    // Currently oversold - slightly higher threshold
    adjustedOversold *= 1.05;
  }
  
  return {
    overbought: Math.max(60, Math.min(90, adjustedOverbought)),
    oversold: Math.max(10, Math.min(40, adjustedOversold))
  };
}

/**
 * Get adaptive parameters for a strategy based on market conditions
 */
export function getAdaptiveParameters(
  candles: Candle[],
  baseConfig: any,
  marketRegime: MarketRegime,
  config: AdaptiveConfig
): any {
  const adaptiveConfig = { ...baseConfig };
  
  // Adjust RSI levels
  const rsiLevels = calculateAdaptiveRSILevels(
    candles,
    baseConfig.rsi_overbought || 70,
    baseConfig.rsi_oversold || 30,
    config
  );
  
  adaptiveConfig.rsi_overbought = rsiLevels.overbought;
  adaptiveConfig.rsi_oversold = rsiLevels.oversold;
  
  // Adjust volume multiplier
  adaptiveConfig.volume_multiplier = calculateAdaptiveVolumeMultiplier(
    candles,
    baseConfig.volume_multiplier || 1.2,
    config
  );
  
  // Adjust stop loss and take profit
  adaptiveConfig.stop_loss_percent = calculateAdaptiveStopLoss(
    candles,
    baseConfig.stop_loss_percent || 2.0,
    config
  );
  
  adaptiveConfig.take_profit_percent = calculateAdaptiveTakeProfit(
    candles,
    baseConfig.take_profit_percent || 4.0,
    config
  );
  
  // Apply regime-specific adjustments
  if (marketRegime.regime === 'trending') {
    adaptiveConfig.volume_multiplier *= 0.9; // Lower volume requirement in trends
    adaptiveConfig.take_profit_percent *= 1.2; // Higher targets in trends
  } else if (marketRegime.regime === 'ranging') {
    adaptiveConfig.stop_loss_percent *= 0.8; // Tighter stops in ranges
    adaptiveConfig.take_profit_percent *= 0.8; // Lower targets in ranges
  } else if (marketRegime.regime === 'volatile') {
    adaptiveConfig.stop_loss_percent *= 1.5; // Wider stops in volatility
    adaptiveConfig.volume_multiplier *= 1.3; // Higher volume requirement
  }
  
  return adaptiveConfig;
}

/**
 * Get default adaptive configuration
 */
export function getDefaultAdaptiveConfig(): AdaptiveConfig {
  return {
    baseRSIThreshold: 70,
    volatilityMultiplier: 1.0,
    trendStrengthMultiplier: 1.0,
    volumeMultiplier: 1.0,
    regimeMultiplier: 1.0
  };
}
