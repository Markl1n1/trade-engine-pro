/**
 * Market Regime Detection Module
 * 
 * This module analyzes market conditions to determine the current regime:
 * - Trending: Strong directional movement with high ADX
 * - Ranging: Sideways movement with low volatility
 * - Volatile: High volatility with unpredictable direction
 */

export interface MarketRegime {
  regime: 'trending' | 'ranging' | 'volatile';
  strength: number; // 0-100
  direction: 'up' | 'down' | 'sideways';
  confidence: number; // 0-100
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
 * Calculate Average Directional Index (ADX)
 */
function calculateADX(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const adx: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  
  // Calculate DM and TR
  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff = lows[i - 1] - lows[i];
    
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
    
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(tr1, tr2, tr3));
  }
  
  // Calculate smoothed DM and TR
  const smoothedPlusDM = calculateEMA(plusDM, period);
  const smoothedMinusDM = calculateEMA(minusDM, period);
  const smoothedTR = calculateEMA(tr, period);
  
  // Calculate DI+ and DI-
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  
  for (let i = 0; i < smoothedPlusDM.length; i++) {
    const plusDIValue = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
    const minusDIValue = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
    plusDI.push(plusDIValue);
    minusDI.push(minusDIValue);
  }
  
  // Calculate DX and ADX
  for (let i = 0; i < plusDI.length; i++) {
    const dx = Math.abs(plusDI[i] - minusDI[i]) / (plusDI[i] + minusDI[i]) * 100;
    adx.push(dx);
  }
  
  // Smooth ADX
  return calculateEMA(adx, period);
}

/**
 * Detect market regime based on technical indicators
 */
export function detectMarketRegime(candles: Candle[]): MarketRegime {
  if (candles.length < 50) {
    return {
      regime: 'ranging',
      strength: 50,
      direction: 'sideways',
      confidence: 30
    };
  }
  
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  
  // Calculate indicators
  const adx = calculateADX(highs, lows, closes, 14);
  const currentADX = adx[adx.length - 1];
  
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const currentEMA20 = ema20[ema20.length - 1];
  const currentEMA50 = ema50[ema50.length - 1];
  
  const atr = calculateATR(candles, 14);
  const currentATR = atr[atr.length - 1];
  const avgATR = atr.slice(-20).reduce((sum, val) => sum + val, 0) / 20;
  
  // Calculate trend direction
  const trendDirection = currentEMA20 > currentEMA50 ? 'up' : 'down';
  
  // Calculate volatility ratio
  const volatilityRatio = currentATR / avgATR;
  
  // Determine regime based on ADX and volatility
  if (currentADX > 25) {
    // Strong trend
    return {
      regime: 'trending',
      strength: Math.min(currentADX, 100),
      direction: trendDirection,
      confidence: Math.min(currentADX, 100)
    };
  } else if (volatilityRatio > 1.5) {
    // High volatility
    return {
      regime: 'volatile',
      strength: Math.min(volatilityRatio * 50, 100),
      direction: 'sideways',
      confidence: Math.min(volatilityRatio * 30, 80)
    };
  } else {
    // Ranging market
    return {
      regime: 'ranging',
      strength: Math.min(currentADX, 100),
      direction: 'sideways',
      confidence: Math.min(100 - currentADX, 90)
    };
  }
}

/**
 * Check if a strategy is suitable for current market regime
 */
export function isStrategySuitableForRegime(
  strategyType: string,
  marketRegime: MarketRegime
): boolean {
  const strategyRegimeMap: Record<string, string[]> = {
    'sma_20_200_rsi': ['trending'],
    'mtf_momentum': ['trending', 'volatile'],
    'ath_guard': ['trending', 'volatile'],
    '4h_reentry_br': ['trending', 'ranging'],
    'mstg': ['trending', 'ranging']
  };
  
  const suitableRegimes = strategyRegimeMap[strategyType] || ['trending'];
  return suitableRegimes.includes(marketRegime.regime);
}

/**
 * Get regime-specific position size adjustment
 */
export function getRegimePositionAdjustment(marketRegime: MarketRegime): number {
  switch (marketRegime.regime) {
    case 'trending':
      return 1.0; // Full position size
    case 'ranging':
      return 0.7; // Reduce by 30% in ranging markets
    case 'volatile':
      return 0.5; // Reduce by 50% in volatile markets
    default:
      return 0.8; // Default reduction
  }
}

/**
 * Get regime-specific stop loss adjustment
 */
export function getRegimeStopLossAdjustment(marketRegime: MarketRegime): number {
  switch (marketRegime.regime) {
    case 'trending':
      return 1.0; // Normal stop loss
    case 'ranging':
      return 0.8; // Tighter stops in ranging markets
    case 'volatile':
      return 1.5; // Wider stops in volatile markets
    default:
      return 1.0;
  }
}
