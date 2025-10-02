// Comprehensive indicator calculation library for all 50+ indicators

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ============= MOVING AVERAGES =============

export function calculateSMA(data: number[], period: number): number[] {
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

export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Find first valid (non-NaN) values for SMA calculation
  const validData: number[] = [];
  const validIndices: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (!isNaN(data[i]) && isFinite(data[i])) {
      validData.push(data[i]);
      validIndices.push(i);
    }
  }
  
  if (validData.length < period) {
    return data.map(() => NaN);
  }
  
  // Calculate initial SMA from first valid values
  const sma = validData.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let prevEMA = sma;
  
  for (let i = 0; i < data.length; i++) {
    if (i < validIndices[period - 1]) {
      result.push(NaN);
    } else if (isNaN(data[i]) || !isFinite(data[i])) {
      result.push(NaN);
    } else {
      const ema = (data[i] - prevEMA) * multiplier + prevEMA;
      result.push(ema);
      prevEMA = ema;
    }
  }
  
  return result;
}

export function calculateWMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const weights = Array.from({ length: period }, (_, i) => i + 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const weightedSum = data
        .slice(i - period + 1, i + 1)
        .reduce((sum, val, idx) => sum + val * weights[idx], 0);
      result.push(weightedSum / weightSum);
    }
  }
  return result;
}

export function calculateDEMA(data: number[], period: number): number[] {
  const ema1 = calculateEMA(data, period);
  const ema2 = calculateEMA(ema1.filter(v => !isNaN(v)), period);
  return ema1.map((v, i) => 2 * v - (ema2[i] || 0));
}

export function calculateTEMA(data: number[], period: number): number[] {
  const ema1 = calculateEMA(data, period);
  const ema2 = calculateEMA(ema1.filter(v => !isNaN(v)), period);
  const ema3 = calculateEMA(ema2.filter(v => !isNaN(v)), period);
  return ema1.map((v, i) => 3 * v - 3 * (ema2[i] || 0) + (ema3[i] || 0));
}

export function calculateHullMA(data: number[], period: number): number[] {
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));
  
  const wma1 = calculateWMA(data, halfPeriod);
  const wma2 = calculateWMA(data, period);
  const rawHull = wma1.map((v, i) => 2 * v - wma2[i]);
  
  return calculateWMA(rawHull, sqrtPeriod);
}

export function calculateVWMA(candles: Candle[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let volumeSum = 0;
      let priceVolumeSum = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        priceVolumeSum += candles[j].close * candles[j].volume;
        volumeSum += candles[j].volume;
      }
      
      result.push(volumeSum === 0 ? NaN : priceVolumeSum / volumeSum);
    }
  }
  return result;
}

// ============= OSCILLATORS =============

export function calculateRSI(data: number[], period: number = 14): number[] {
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
      result.push(NaN);
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
  
  return [NaN, ...result];
}

export function calculateStochastic(candles: Candle[], period: number = 14, smoothK: number = 3, smoothD: number = 3): { k: number[], d: number[] } {
  const k: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      k.push(NaN);
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
  
  const smoothedK = calculateSMA(k, smoothK);
  const d = calculateSMA(smoothedK, smoothD);
  
  return { k: smoothedK, d };
}

export function calculateCCI(candles: Candle[], period: number = 20): number[] {
  const result: number[] = [];
  const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = typicalPrices.slice(i - period + 1, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      const meanDeviation = slice.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;
      
      result.push((typicalPrices[i] - sma) / (0.015 * meanDeviation));
    }
  }
  return result;
}

export function calculateWPR(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const close = candles[i].close;
      
      result.push(((high - close) / (high - low)) * -100);
    }
  }
  return result;
}

export function calculateMFI(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
  const moneyFlow = typicalPrices.map((tp, i) => tp * candles[i].volume);
  
  for (let i = 1; i < candles.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      let positiveFlow = 0;
      let negativeFlow = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        if (typicalPrices[j] > typicalPrices[j - 1]) {
          positiveFlow += moneyFlow[j];
        } else {
          negativeFlow += moneyFlow[j];
        }
      }
      
      const mfr = negativeFlow === 0 ? 100 : positiveFlow / negativeFlow;
      result.push(100 - (100 / (1 + mfr)));
    }
  }
  
  return [NaN, ...result];
}

export function calculateStochRSI(data: number[], rsiPeriod: number = 14, stochPeriod: number = 14): number[] {
  const rsi = calculateRSI(data, rsiPeriod);
  const result: number[] = [];
  
  for (let i = 0; i < rsi.length; i++) {
    if (i < stochPeriod - 1 || isNaN(rsi[i])) {
      result.push(NaN);
    } else {
      const slice = rsi.slice(i - stochPeriod + 1, i + 1).filter(v => !isNaN(v));
      const min = Math.min(...slice);
      const max = Math.max(...slice);
      
      if (max === min) {
        result.push(50);
      } else {
        result.push(((rsi[i] - min) / (max - min)) * 100);
      }
    }
  }
  
  return result;
}

export function calculateMomentum(data: number[], period: number = 10): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      result.push(data[i] - data[i - period]);
    }
  }
  
  return result;
}

export function calculateROC(data: number[], period: number = 12): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      result.push(((data[i] - data[i - period]) / data[i - period]) * 100);
    }
  }
  
  return result;
}

// ============= VOLUME INDICATORS =============

export function calculateOBV(candles: Candle[]): number[] {
  const result: number[] = [0];
  
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      result.push(result[result.length - 1] + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      result.push(result[result.length - 1] - candles[i].volume);
    } else {
      result.push(result[result.length - 1]);
    }
  }
  
  return result;
}

export function calculateADLine(candles: Candle[]): number[] {
  const result: number[] = [0];
  
  for (let i = 0; i < candles.length; i++) {
    const clv = ((candles[i].close - candles[i].low) - (candles[i].high - candles[i].close)) / (candles[i].high - candles[i].low || 1);
    const ad = clv * candles[i].volume;
    result.push(i === 0 ? ad : result[result.length - 1] + ad);
  }
  
  return result;
}

export function calculateCMF(candles: Candle[], period: number = 20): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let mfvSum = 0;
      let volumeSum = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        const mfm = ((candles[j].close - candles[j].low) - (candles[j].high - candles[j].close)) / (candles[j].high - candles[j].low || 1);
        mfvSum += mfm * candles[j].volume;
        volumeSum += candles[j].volume;
      }
      
      result.push(volumeSum === 0 ? 0 : mfvSum / volumeSum);
    }
  }
  
  return result;
}

export function calculateVWAP(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativePV += typicalPrice * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    
    result.push(cumulativeVolume === 0 ? NaN : cumulativePV / cumulativeVolume);
  }
  
  return result;
}

// ============= TREND INDICATORS =============

export function calculateMACD(data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: number[], signal: number[], histogram: number[] } {
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  const macd = fastEMA.map((v, i) => v - slowEMA[i]);
  const signal = calculateEMA(macd.filter(v => !isNaN(v)), signalPeriod);
  
  // Pad signal to match macd length
  const paddedSignal = new Array(macd.length - signal.length).fill(NaN).concat(signal);
  const histogram = macd.map((v, i) => v - paddedSignal[i]);
  
  return { macd, signal: paddedSignal, histogram };
}

export function calculateADX(candles: Candle[], period: number = 14): { adx: number[], plusDI: number[], minusDI: number[] } {
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  const atr = calculateEMA([NaN, ...tr], period);
  const plusDI = plusDM.map((dm, i) => atr[i + 1] === 0 ? 0 : (dm / atr[i + 1]) * 100);
  const minusDI = minusDM.map((dm, i) => atr[i + 1] === 0 ? 0 : (dm / atr[i + 1]) * 100);
  
  const dx = plusDI.map((pdi, i) => {
    const sum = pdi + minusDI[i];
    return sum === 0 ? 0 : (Math.abs(pdi - minusDI[i]) / sum) * 100;
  });
  
  const adx = calculateEMA([NaN, ...dx], period);
  
  return { adx, plusDI: [NaN, ...plusDI], minusDI: [NaN, ...minusDI] };
}

// ============= VOLATILITY INDICATORS =============

export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const tr: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  
  return [NaN, ...calculateEMA(tr, period)];
}

export function calculateBollingerBands(data: number[], period: number = 20, deviation: number = 2): { upper: number[], middle: number[], lower: number[] } {
  const middle = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      
      upper.push(mean + deviation * stdDev);
      lower.push(mean - deviation * stdDev);
    }
  }
  
  return { upper, middle, lower };
}

// ============================================================================
// MSTG (Market Sentiment Trend Gauge) Indicators
// ============================================================================

/**
 * Normalize values to a specified range
 */
export function normalizeToRange(values: number[], min: number, max: number): number[] {
  const result: number[] = [];
  const validValues = values.filter(v => !isNaN(v) && isFinite(v));
  
  if (validValues.length === 0) {
    return values.map(() => NaN);
  }
  
  const dataMin = Math.min(...validValues);
  const dataMax = Math.max(...validValues);
  const range = dataMax - dataMin;
  
  for (const value of values) {
    if (isNaN(value) || !isFinite(value)) {
      result.push(NaN);
    } else if (range === 0) {
      result.push(0);
    } else {
      const normalized = ((value - dataMin) / range) * (max - min) + min;
      result.push(normalized);
    }
  }
  
  return result;
}

/**
 * Normalize RSI from [0,100] to [-100,+100]
 */
export function normalizeRSI(rsi: number[]): number[] {
  return rsi.map(value => {
    if (isNaN(value)) return NaN;
    return (value - 50) * 2; // Converts 0->-100, 50->0, 100->+100
  });
}

/**
 * Calculate Bollinger Band Position (0 to 1, where price is within bands)
 */
export function calculateBollingerPosition(candles: Candle[], period: number = 20): number[] {
  const closes = candles.map(c => c.close);
  const bb = calculateBollingerBands(closes, period, 2);
  const position: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(bb.upper[i]) || isNaN(bb.lower[i])) {
      position.push(NaN);
    } else {
      const range = bb.upper[i] - bb.lower[i];
      if (range === 0) {
        position.push(0.5);
      } else {
        const pos = (candles[i].close - bb.lower[i]) / range;
        position.push(Math.max(0, Math.min(1, pos))); // Clamp to [0,1]
      }
    }
  }
  
  return position;
}

/**
 * Calculate Trend Score based on EMA10 vs EMA21
 */
export function calculateTrendScore(data: number[]): number[] {
  const ema10 = calculateEMA(data, 10);
  const ema21 = calculateEMA(data, 21);
  const diff: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (isNaN(ema10[i]) || isNaN(ema21[i])) {
      diff.push(NaN);
    } else {
      diff.push(ema10[i] - ema21[i]);
    }
  }
  
  return normalizeToRange(diff, -100, 100);
}

/**
 * Calculate Benchmark Relative Strength
 * Compares asset returns vs benchmark returns
 */
export function calculateBenchmarkRelativeStrength(
  assetCandles: Candle[],
  benchmarkCandles: Candle[],
  period: number = 14
): number[] {
  const result: number[] = [];
  
  // Check if asset and benchmark are the same
  const isSameAsset = assetCandles.length === benchmarkCandles.length && 
    assetCandles.every((c, i) => c.close === benchmarkCandles[i]?.close);
  
  if (isSameAsset) {
    // If comparing to itself, return neutral scores (0)
    return assetCandles.map((_, i) => i < period ? NaN : 0);
  }
  
  for (let i = 0; i < assetCandles.length; i++) {
    if (i < period) {
      result.push(NaN);
      continue;
    }
    
    // Calculate returns over period
    const assetReturn = (assetCandles[i].close - assetCandles[i - period].close) / assetCandles[i - period].close;
    const benchmarkReturn = (benchmarkCandles[i].close - benchmarkCandles[i - period].close) / benchmarkCandles[i - period].close;
    
    const relativeStrength = (assetReturn - benchmarkReturn) * 100;
    result.push(relativeStrength);
  }
  
  return normalizeToRange(result, -100, 100);
}

/**
 * Calculate Composite MSTG Score
 */
export function calculateCompositeScore(
  momentum: number[],
  trend: number[],
  volatility: number[],
  relativeStrength: number[],
  weights: { wM: number, wT: number, wV: number, wR: number }
): number[] {
  const rawScores: number[] = [];
  
  for (let i = 0; i < momentum.length; i++) {
    // Allow score calculation even if some components are NaN by treating them as 0
    const m = isNaN(momentum[i]) ? 0 : momentum[i];
    const t = isNaN(trend[i]) ? 0 : trend[i];
    const v = isNaN(volatility[i]) ? 0.5 : volatility[i]; // Default to neutral
    const r = isNaN(relativeStrength[i]) ? 0 : relativeStrength[i];
    
    // Only push NaN if ALL components are NaN
    if (isNaN(momentum[i]) && isNaN(trend[i]) && isNaN(volatility[i]) && isNaN(relativeStrength[i])) {
      rawScores.push(NaN);
    } else {
      const score = 
        weights.wM * m +
        weights.wT * t +
        weights.wV * (v * 200 - 100) + // Convert [0,1] to [-100,100]
        weights.wR * r;
      rawScores.push(score);
    }
  }
  
  // Apply EMA_5 smoothing
  return calculateEMA(rawScores, 5);
}

// ============= NEW INDICATORS =============

/**
 * Parabolic SAR
 */
export function calculateParabolicSAR(
  candles: Candle[],
  acceleration: number = 0.02,
  maxAcceleration: number = 0.2
): number[] {
  if (candles.length < 2) return candles.map(() => NaN);

  const sar: number[] = [];
  let af = acceleration;
  let isUptrend = candles[1].close > candles[0].close;
  let ep = isUptrend ? candles[1].high : candles[1].low;
  let currentSAR = isUptrend ? candles[0].low : candles[0].high;

  sar.push(NaN); // First value

  for (let i = 1; i < candles.length; i++) {
    sar.push(currentSAR);

    // Update SAR
    currentSAR = currentSAR + af * (ep - currentSAR);

    // Check for trend reversal
    if (isUptrend) {
      if (candles[i].low < currentSAR) {
        isUptrend = false;
        currentSAR = ep;
        ep = candles[i].low;
        af = acceleration;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(af + acceleration, maxAcceleration);
        }
      }
    } else {
      if (candles[i].high > currentSAR) {
        isUptrend = true;
        currentSAR = ep;
        ep = candles[i].high;
        af = acceleration;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(af + acceleration, maxAcceleration);
        }
      }
    }
  }

  return sar;
}

/**
 * KDJ J Line
 */
export function calculateKDJ(
  candles: Candle[],
  period: number = 9,
  smoothK: number = 3,
  smoothD: number = 3
): { k: number[], d: number[], j: number[] } {
  const stoch = calculateStochastic(candles, period, smoothK, smoothD);
  const j = stoch.k.map((k, i) => 3 * k - 2 * stoch.d[i]);
  return { k: stoch.k, d: stoch.d, j };
}

/**
 * SuperTrend
 */
export function calculateSuperTrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3
): { trend: number[], direction: number[] } {
  const atr = calculateATR(candles, period);
  const trend: number[] = [];
  const direction: number[] = [];

  let upperBand: number[] = [];
  let lowerBand: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    upperBand[i] = hl2 + multiplier * (atr[i] || 0);
    lowerBand[i] = hl2 - multiplier * (atr[i] || 0);
  }

  let currentTrend = 1; // 1 = up, -1 = down
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trend.push(lowerBand[i]);
      direction.push(1);
      continue;
    }

    // Adjust bands
    if (lowerBand[i] > trend[i - 1] || candles[i - 1].close < trend[i - 1]) {
      lowerBand[i] = lowerBand[i];
    } else {
      lowerBand[i] = Math.max(lowerBand[i], trend[i - 1]);
    }

    if (upperBand[i] < trend[i - 1] || candles[i - 1].close > trend[i - 1]) {
      upperBand[i] = upperBand[i];
    } else {
      upperBand[i] = Math.min(upperBand[i], trend[i - 1]);
    }

    // Determine trend
    if (candles[i].close > upperBand[i]) {
      currentTrend = 1;
      trend.push(lowerBand[i]);
    } else if (candles[i].close < lowerBand[i]) {
      currentTrend = -1;
      trend.push(upperBand[i]);
    } else {
      trend.push(currentTrend === 1 ? lowerBand[i] : upperBand[i]);
    }

    direction.push(currentTrend);
  }

  return { trend, direction };
}

/**
 * TD Sequential
 */
export function calculateTDSequential(candles: Candle[]): { setup: number[], countdown: number[] } {
  const setup: number[] = [];
  const countdown: number[] = [];

  let setupCount = 0;
  let countdownCount = 0;
  let setupComplete = false;

  for (let i = 0; i < candles.length; i++) {
    if (i < 4) {
      setup.push(0);
      countdown.push(0);
      continue;
    }

    // Setup phase
    if (candles[i].close < candles[i - 4].close) {
      setupCount = setupCount > 0 ? setupCount + 1 : 1;
    } else if (candles[i].close > candles[i - 4].close) {
      setupCount = setupCount < 0 ? setupCount - 1 : -1;
    } else {
      setupCount = 0;
    }

    if (Math.abs(setupCount) >= 9) {
      setupComplete = true;
      setupCount = setupCount > 0 ? 9 : -9;
    }

    setup.push(setupCount);

    // Countdown phase
    if (setupComplete && i >= 8) {
      if (setupCount > 0 && candles[i].close < candles[i - 2].low) {
        countdownCount++;
      } else if (setupCount < 0 && candles[i].close > candles[i - 2].high) {
        countdownCount++;
      }

      if (countdownCount >= 13) {
        countdownCount = 13;
        setupComplete = false;
      }
    }

    countdown.push(countdownCount);
  }

  return { setup, countdown };
}

/**
 * Anchored VWAP
 */
export function calculateAnchoredVWAP(candles: Candle[], anchorIndex: number = 0): number[] {
  const result: number[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i < anchorIndex) {
      result.push(NaN);
      continue;
    }

    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativePV += typicalPrice * candles[i].volume;
    cumulativeVolume += candles[i].volume;

    result.push(cumulativeVolume === 0 ? NaN : cumulativePV / cumulativeVolume);
  }

  return result;
}

/**
 * Ichimoku Cloud Components
 */
export function calculateIchimoku(
  candles: Candle[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouBPeriod: number = 52
): {
  tenkan: number[];
  kijun: number[];
  senkouA: number[];
  senkouB: number[];
  chikou: number[];
} {
  const tenkan: number[] = [];
  const kijun: number[] = [];
  const senkouA: number[] = [];
  const senkouB: number[] = [];
  const chikou: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    // Tenkan-sen (Conversion Line)
    if (i < tenkanPeriod - 1) {
      tenkan.push(NaN);
    } else {
      const slice = candles.slice(i - tenkanPeriod + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      tenkan.push((high + low) / 2);
    }

    // Kijun-sen (Base Line)
    if (i < kijunPeriod - 1) {
      kijun.push(NaN);
    } else {
      const slice = candles.slice(i - kijunPeriod + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      kijun.push((high + low) / 2);
    }

    // Senkou Span A (Leading Span A) - projected 26 periods ahead
    if (i < kijunPeriod - 1) {
      senkouA.push(NaN);
    } else {
      senkouA.push((tenkan[i] + kijun[i]) / 2);
    }

    // Senkou Span B (Leading Span B) - projected 26 periods ahead
    if (i < senkouBPeriod - 1) {
      senkouB.push(NaN);
    } else {
      const slice = candles.slice(i - senkouBPeriod + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      senkouB.push((high + low) / 2);
    }

    // Chikou Span (Lagging Span) - current close shifted back 26 periods
    chikou.push(candles[i].close);
  }

  return { tenkan, kijun, senkouA, senkouB, chikou };
}

/**
 * Bollinger Band Width
 */
export function calculateBollingerWidth(upper: number[], lower: number[]): number[] {
  return upper.map((u, i) => u - lower[i]);
}

/**
 * Percent B (%B)
 */
export function calculatePercentB(price: number[], upper: number[], lower: number[]): number[] {
  return price.map((p, i) => {
    const range = upper[i] - lower[i];
    return range === 0 ? 0.5 : (p - lower[i]) / range;
  });
}

/**
 * EMA Crossover Signal Detection
 */
export function detectEMACrossover(
  emaShort: number[],
  emaLong: number[]
): number[] {
  const signals: number[] = [];

  for (let i = 0; i < emaShort.length; i++) {
    if (i === 0 || isNaN(emaShort[i]) || isNaN(emaLong[i]) || isNaN(emaShort[i - 1]) || isNaN(emaLong[i - 1])) {
      signals.push(0);
      continue;
    }

    // Bullish crossover
    if (emaShort[i - 1] <= emaLong[i - 1] && emaShort[i] > emaLong[i]) {
      signals.push(1);
    }
    // Bearish crossover
    else if (emaShort[i - 1] >= emaLong[i - 1] && emaShort[i] < emaLong[i]) {
      signals.push(-1);
    }
    // No crossover
    else {
      signals.push(0);
    }
  }

  return signals;
}
