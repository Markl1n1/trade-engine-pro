// ATH Guard Mode - 1-Minute Scalping Strategy Helper
// Professional scalping system with multiple confirmation layers

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface ATHGuardConfig {
  ema_slope_threshold: number;
  pullback_tolerance: number;
  volume_multiplier: number;
  stoch_oversold: number;
  stoch_overbought: number;
  atr_sl_multiplier: number;
  atr_tp1_multiplier: number;
  atr_tp2_multiplier: number;
  ath_safety_distance: number;
  rsi_threshold: number;
  // Новые параметры для улучшенной стратегии
  adx_threshold: number;
  bollinger_period: number;
  bollinger_std: number;
  trailing_stop_percent: number;
  max_position_time: number;
  min_volume_spike: number;
  momentum_threshold: number;
  support_resistance_lookback: number;
}

interface ATHGuardSignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  stop_loss?: number;
  take_profit_1?: number;
  take_profit_2?: number;
  // Новые поля для улучшенной стратегии
  adx?: number;
  bollinger_position?: number;
  momentum_score?: number;
  support_resistance_level?: number;
  confidence?: number;
  time_to_expire?: number;
}

// Calculate EMA
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

// Calculate EMA slope (percentage change)
function calculateEMASlope(ema: number[]): number {
  if (ema.length < 2) return 0;
  const current = ema[ema.length - 1];
  const previous = ema[ema.length - 2];
  return ((current - previous) / previous) * 100;
}

// Calculate VWAP
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

// Calculate MACD
function calculateMACD(data: number[]): { macd: number[], signal: number[], histogram: number[] } {
  const fastEMA = calculateEMA(data, 12);
  const slowEMA = calculateEMA(data, 26);
  
  const macd = fastEMA.map((v, i) => v - slowEMA[i]);
  const signal = calculateEMA(macd.slice(26), 9);
  
  const paddedSignal = new Array(26).fill(0).concat(signal);
  const histogram = macd.map((v, i) => v - paddedSignal[i]);
  
  return { macd, signal: paddedSignal, histogram };
}

// Calculate Stochastic
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

// Calculate SMA
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

// Calculate RSI
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

// Calculate ATR
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

// Calculate ADX (Average Directional Index)
function calculateADX(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  const tr: number[] = [];
  
  // Calculate DM+ and DM-
  for (let i = 1; i < candles.length; i++) {
    const highDiff = candles[i].high - candles[i-1].high;
    const lowDiff = candles[i-1].low - candles[i].low;
    
    dmPlus.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    dmMinus.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
    
    // Calculate True Range
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i-1].close;
    
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);
  }
  
  // Calculate smoothed values
  const smoothedDMPlus = calculateEMA(dmPlus, period);
  const smoothedDMMinus = calculateEMA(dmMinus, period);
  const smoothedTR = calculateEMA(tr, period);
  
  // Calculate DI+ and DI-
  for (let i = 0; i < smoothedDMPlus.length; i++) {
    const diPlus = smoothedTR[i] === 0 ? 0 : (smoothedDMPlus[i] / smoothedTR[i]) * 100;
    const diMinus = smoothedTR[i] === 0 ? 0 : (smoothedDMMinus[i] / smoothedTR[i]) * 100;
    
    const dx = diPlus + diMinus === 0 ? 0 : Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
    result.push(dx);
  }
  
  // Calculate ADX
  const adx = calculateEMA(result, period);
  return new Array(candles.length - adx.length).fill(0).concat(adx);
}

// Calculate Bollinger Bands
function calculateBollingerBands(data: number[], period: number = 20, stdDev: number = 2): { upper: number[], middle: number[], lower: number[] } {
  const result = { upper: [] as number[], middle: [] as number[], lower: [] as number[] };
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.upper.push(data[i]);
      result.middle.push(data[i]);
      result.lower.push(data[i]);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
      const stdDeviation = Math.sqrt(variance);
      
      result.upper.push(sma + (stdDeviation * stdDev));
      result.middle.push(sma);
      result.lower.push(sma - (stdDeviation * stdDev));
    }
  }
  
  return result;
}

// Calculate Support/Resistance levels
function calculateSupportResistance(candles: Candle[], lookback: number = 20): { support: number, resistance: number } {
  if (candles.length < lookback) {
    return { support: candles[candles.length - 1].low, resistance: candles[candles.length - 1].high };
  }
  
  const recentCandles = candles.slice(-lookback);
  const lows = recentCandles.map(c => c.low);
  const highs = recentCandles.map(c => c.high);
  
  const support = Math.min(...lows);
  const resistance = Math.max(...highs);
  
  return { support, resistance };
}

// Calculate Momentum Score
function calculateMomentumScore(candles: Candle[], rsi: number[], macd: any, stoch: any): number {
  const currentPrice = candles[candles.length - 1].close;
  const prevPrice = candles[candles.length - 2].close;
  const priceChange = ((currentPrice - prevPrice) / prevPrice) * 100;
  
  const rsiScore = rsi[rsi.length - 1] > 50 ? 1 : -1;
  const macdScore = macd.histogram[macd.histogram.length - 1] > 0 ? 1 : -1;
  const stochScore = stoch.k[stoch.k.length - 1] > 50 ? 1 : -1;
  
  const momentumScore = (priceChange * 0.4) + (rsiScore * 0.3) + (macdScore * 0.2) + (stochScore * 0.1);
  
  return Math.max(-100, Math.min(100, momentumScore));
}

// Calculate Bollinger Position
function calculateBollingerPosition(price: number, upper: number, middle: number, lower: number): number {
  if (upper === lower) return 0.5;
  return (price - lower) / (upper - lower);
}

// Calculate Signal Confidence
function calculateSignalConfidence(
  rsi: number, 
  adx: number, 
  momentumScore: number, 
  bollingerPosition: number,
  volumeConfirmed: boolean,
  athDistance: number
): number {
  let confidence = 0;
  
  // RSI contribution (0-25 points)
  if (rsi > 30 && rsi < 70) confidence += 15;
  else if (rsi > 20 && rsi < 80) confidence += 10;
  else confidence += 5;
  
  // ADX contribution (0-25 points)
  if (adx > 25) confidence += 25;
  else if (adx > 20) confidence += 20;
  else if (adx > 15) confidence += 15;
  else confidence += 5;
  
  // Momentum contribution (0-25 points)
  if (Math.abs(momentumScore) > 20) confidence += 25;
  else if (Math.abs(momentumScore) > 10) confidence += 20;
  else if (Math.abs(momentumScore) > 5) confidence += 15;
  else confidence += 5;
  
  // Bollinger position contribution (0-15 points)
  if (bollingerPosition > 0.2 && bollingerPosition < 0.8) confidence += 15;
  else if (bollingerPosition > 0.1 && bollingerPosition < 0.9) confidence += 10;
  else confidence += 5;
  
  // Volume confirmation (0-10 points)
  if (volumeConfirmed) confidence += 10;
  
  // ATH distance bonus (0-10 points)
  if (athDistance > 0.5) confidence += 10;
  else if (athDistance > 0.3) confidence += 5;
  
  return Math.min(100, Math.max(0, confidence));
}

// Simplified Bias Filter (Step 1) - EMA alignment only
function checkBiasFilter(
  price: number,
  ema50: number,
  ema100: number,
  ema150: number,
  ema150Slope: number,
  config: ATHGuardConfig
): 'LONG' | 'SHORT' | 'NEUTRAL' {
  // Simplified: Just check EMA alignment and basic slope
  if (price > ema150 && ema50 > ema100 && ema150Slope > 0) {
    return 'LONG';
  }
  
  if (price < ema150 && ema50 < ema100 && ema150Slope < 0) {
    return 'SHORT';
  }
  
  return 'NEUTRAL';
}

// Check Pullback (retracement to VWAP/EMA50)
function checkPullback(
  candles: Candle[],
  vwap: number,
  ema50: number,
  bias: 'LONG' | 'SHORT',
  config: ATHGuardConfig
): boolean {
  if (candles.length < 2) return false;
  
  const currentPrice = candles[candles.length - 1].close;
  const previousPrice = candles[candles.length - 2].close;
  const tolerance = config.pullback_tolerance / 100;
  
  if (bias === 'LONG') {
    // Check if price was near VWAP/EMA50 and now reclaimed
    const distanceToVWAP = Math.abs(previousPrice - vwap) / vwap;
    const distanceToEMA = Math.abs(previousPrice - ema50) / ema50;
    
    const wasNearSupport = distanceToVWAP <= tolerance || distanceToEMA <= tolerance;
    const reclaimedSupport = currentPrice > vwap || currentPrice > ema50;
    
    return wasNearSupport && reclaimedSupport;
  } else {
    // Check if price tested and rejected VWAP/EMA50
    const distanceToVWAP = Math.abs(previousPrice - vwap) / vwap;
    const distanceToEMA = Math.abs(previousPrice - ema50) / ema50;
    
    const wasNearResistance = distanceToVWAP <= tolerance || distanceToEMA <= tolerance;
    const rejectedResistance = currentPrice < vwap || currentPrice < ema50;
    
    return wasNearResistance && rejectedResistance;
  }
}

// Simplified Momentum Confirmation (Step 3) - RSI + MACD only
function checkMomentum(
  macd: { macd: number[], signal: number[], histogram: number[] },
  rsi: number[],
  bias: 'LONG' | 'SHORT',
  config: ATHGuardConfig
): boolean {
  const idx = macd.macd.length - 1;
  const prevIdx = idx - 1;
  
  if (idx < 1) return false;
  
  const currentMACD = macd.macd[idx];
  const currentSignal = macd.signal[idx];
  const currentHistogram = macd.histogram[idx];
  const currentRSI = rsi[idx];
  
  // OPTIMIZED: Softened momentum check - ANY condition passes
  if (bias === 'LONG') {
    return currentRSI > 45 || currentHistogram > 0; // Either RSI or MACD
  } else {
    return currentRSI < 55 || currentHistogram < 0; // Either RSI or MACD
  }
}

// Simplified Volume Confirmation (Step 2) - Basic volume spike
function checkVolume(candles: Candle[], config: ATHGuardConfig): boolean {
  if (candles.length < 21) return false;
  
  const currentVolume = candles[candles.length - 1].volume;
  const last20Volumes = candles.slice(-21, -1).map(c => c.volume);
  const avgVolume = last20Volumes.reduce((a, b) => a + b, 0) / 20;
  
  // Simplified: Just check for volume spike (20% above average)
  return currentVolume >= avgVolume * 1.2;
}

// Check ATH Safety
function checkATHSafety(
  candles: Candle[],
  rsi: number,
  bias: 'LONG' | 'SHORT',
  config: ATHGuardConfig
): boolean {
  // Calculate recent high (last 100 candles)
  const lookback = Math.min(100, candles.length);
  const recentCandles = candles.slice(-lookback);
  const recentHigh = Math.max(...recentCandles.map(c => c.high));
  
  const currentPrice = candles[candles.length - 1].close;
  const distanceToATH = ((currentPrice - recentHigh) / recentHigh) * 100;
  
  if (bias === 'LONG') {
    // If price within 0.2% of ATH and RSI > 70, be cautious
    if (Math.abs(distanceToATH) < config.ath_safety_distance && rsi > config.rsi_threshold) {
      return false; // Don't take aggressive longs near ATH with high RSI
    }
  } else {
    // If price broke ATH by <0.1% then dropped below VWAP, it's a fake breakout (good for shorts)
    // This is handled in the main evaluation, so we return true here
  }
  
  return true;
}

// IMPROVED Main evaluation function with global trend filter + volatility check
export function evaluateATHGuardStrategy(
  candles: Candle[],
  config: ATHGuardConfig,
  positionOpen: boolean
): ATHGuardSignal {
  console.log('[ATH-GUARD] 🔍 Starting IMPROVED evaluation with global trend filter...');
  
  if (candles.length < 200) {
    console.log(`[ATH-GUARD] ❌ Insufficient data: ${candles.length} candles`);
    return { signal_type: null, reason: 'Insufficient candle data' };
  }
  
  if (positionOpen) {
    return { signal_type: null, reason: 'Position already open' };
  }
  
  const closes = candles.map(c => c.close);
  
  // Calculate essential indicators
  const ema50 = calculateEMA(closes, 50);
  const ema150 = calculateEMA(closes, 150);
  const ema200 = calculateEMA(closes, 200); // GLOBAL TREND FILTER
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(candles, 14);
  
  // Optional indicators for confidence
  const adx = calculateADX(candles, 14);
  const macd = calculateMACD(closes);
  
  const currentPrice = candles[candles.length - 1].close;
  const currentEMA50 = ema50[ema50.length - 1];
  const currentEMA150 = ema150[ema150.length - 1];
  const currentEMA200 = ema200[ema200.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  const currentATR = atr[atr.length - 1];
  const currentADX = adx[adx.length - 1];
  const currentHistogram = macd.histogram[macd.histogram.length - 1];
  
  const ema150Slope = calculateEMASlope(ema150);
  
  // Calculate volume
  const currentVolume = candles[candles.length - 1].volume;
  const last20Volumes = candles.slice(-21, -1).map(c => c.volume);
  const avgVolume = last20Volumes.reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = currentVolume / avgVolume;
  
  // Calculate volatility ratio for dynamic filter
  const last20ATR = atr.slice(-20);
  const avgATR = last20ATR.reduce((a, b) => a + b, 0) / 20;
  const volatilityRatio = currentATR / avgATR;
  
  // GLOBAL TREND from EMA 200
  const globalTrend = currentPrice > currentEMA200 ? 'UP' : 'DOWN';
  
  console.log(`[ATH-GUARD] 📊 Indicators:`, {
    price: currentPrice.toFixed(2),
    ema50: currentEMA50.toFixed(2),
    ema150: currentEMA150.toFixed(2),
    ema200: currentEMA200.toFixed(2),
    globalTrend,
    rsi: currentRSI.toFixed(2),
    adx: currentADX.toFixed(2),
    volumeRatio: volumeRatio.toFixed(2),
    volatilityRatio: volatilityRatio.toFixed(2)
  });
  
  // VOLATILITY FILTER: Skip if market too volatile (> 2x average ATR)
  if (volatilityRatio > 2.0) {
    console.log(`[ATH-GUARD] ⚠️ Market too volatile: ${volatilityRatio.toFixed(2)}x average ATR`);
    return { signal_type: null, reason: `High volatility: ${volatilityRatio.toFixed(2)}x ATR` };
  }
  
  // STEP 1: EMA Alignment - determine bias
  let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  
  if (currentPrice > currentEMA150 && currentEMA50 > currentEMA150 && ema150Slope > 0) {
    bias = 'LONG';
  } else if (currentPrice < currentEMA150 && currentEMA50 < currentEMA150 && ema150Slope < 0) {
    bias = 'SHORT';
  }
  
  console.log(`[ATH-GUARD] 🎯 Step 1 - EMA Alignment: ${bias}`);
  
  if (bias === 'NEUTRAL') {
    return { signal_type: null, reason: 'No EMA alignment' };
  }
  
  // STEP 2: RSI Direction Check
  const rsiOk = bias === 'LONG' ? currentRSI < 70 : currentRSI > 30;
  
  console.log(`[ATH-GUARD] 📊 Step 2 - RSI: ${currentRSI.toFixed(1)} ${rsiOk ? '✅' : '❌'}`);
  
  if (!rsiOk) {
    return { signal_type: null, reason: `RSI extreme: ${currentRSI.toFixed(1)}` };
  }
  
  // ALL BLOCKING CHECKS PASS - Now calculate confidence
  let confidence = 100;
  
  // GLOBAL TREND modifier (-30 if against global trend)
  const trendAligned = (bias === 'LONG' && globalTrend === 'UP') || (bias === 'SHORT' && globalTrend === 'DOWN');
  if (!trendAligned) {
    console.log(`[ATH-GUARD] ⚠️ Against global trend (${globalTrend}) (-30 confidence)`);
    confidence -= 30;
  }
  
  // ADX modifier (-15 if weak trend)
  if (config.adx_threshold && currentADX < config.adx_threshold) {
    console.log(`[ATH-GUARD] ⚠️ Weak ADX: ${currentADX.toFixed(1)} (-15 confidence)`);
    confidence -= 15;
  }
  
  // Volume modifier (-15 if low volume)
  if (volumeRatio < 1.2) {
    console.log(`[ATH-GUARD] ⚠️ Low volume: ${volumeRatio.toFixed(2)}x (-15 confidence)`);
    confidence -= 15;
  }
  
  // MACD modifier (-10 if not aligned)
  const macdAligned = bias === 'LONG' ? currentHistogram > 0 : currentHistogram < 0;
  if (!macdAligned) {
    console.log(`[ATH-GUARD] ⚠️ MACD not aligned (-10 confidence)`);
    confidence -= 10;
  }
  
  // Volatility modifier (-10 if elevated volatility)
  if (volatilityRatio > 1.5) {
    console.log(`[ATH-GUARD] ⚠️ Elevated volatility: ${volatilityRatio.toFixed(2)}x (-10 confidence)`);
    confidence -= 10;
  }
  
  // Block entry only if confidence < 30%
  if (confidence < 30) {
    console.log(`[ATH-GUARD] ❌ Confidence too low: ${confidence}%`);
    return { signal_type: null, reason: `Low confidence: ${confidence}%` };
  }
  
  console.log(`[ATH-GUARD] ✅ Signal confidence: ${confidence}%`);
  
  // Generate signal
  if (bias === 'LONG') {
    const stopLoss = currentPrice - (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice + (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice + (config.atr_tp2_multiplier * currentATR);
    
    console.log('[ATH-GUARD] 🚀 BUY SIGNAL', {
      entry: currentPrice.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      tp1: takeProfit1.toFixed(2),
      tp2: takeProfit2.toFixed(2),
      confidence: `${confidence}%`,
      globalTrend
    });
    
    return {
      signal_type: 'BUY',
      reason: `ATH Guard LONG (EMA+RSI+Trend:${globalTrend}, conf:${confidence}%)`,
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      adx: currentADX,
      confidence: confidence,
      time_to_expire: config.max_position_time
    };
  }
  
  if (bias === 'SHORT') {
    const stopLoss = currentPrice + (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice - (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice - (config.atr_tp2_multiplier * currentATR);
    
    console.log('[ATH-GUARD] 🚀 SELL SIGNAL', {
      entry: currentPrice.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      tp1: takeProfit1.toFixed(2),
      tp2: takeProfit2.toFixed(2),
      confidence: `${confidence}%`,
      globalTrend
    });
    
    return {
      signal_type: 'SELL',
      reason: `ATH Guard SHORT (EMA+RSI+Trend:${globalTrend}, conf:${confidence}%)`,
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      adx: currentADX,
      confidence: confidence,
      time_to_expire: config.max_position_time
    };
  }
  
  return { signal_type: null, reason: 'No signal' };
}

// Default configuration for SIMPLIFIED ATH Guard strategy
export const defaultATHGuardConfig: ATHGuardConfig = {
  // Core parameters (used)
  ema_slope_threshold: 0.05,  // Lower threshold for easier alignment
  volume_multiplier: 1.2,      // Moderate volume requirement
  atr_sl_multiplier: 1.5,
  atr_tp1_multiplier: 2.0,
  atr_tp2_multiplier: 3.0,
  rsi_threshold: 70,           // Not overbought for longs, not oversold for shorts
  
  // Optional modifiers (used for confidence scoring)
  adx_threshold: 20,           // Optional - reduces confidence if weak
  
  // Unused legacy parameters (kept for compatibility)
  pullback_tolerance: 0.15,
  stoch_oversold: 25,
  stoch_overbought: 75,
  ath_safety_distance: 0.2,
  bollinger_period: 20,
  bollinger_std: 2.0,
  trailing_stop_percent: 0.5,
  max_position_time: 120,      // 2 hours max position time
  min_volume_spike: 1.2,
  momentum_threshold: 15,
  support_resistance_lookback: 20
};
