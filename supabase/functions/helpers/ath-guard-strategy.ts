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

// Main evaluation function
export function evaluateATHGuardStrategy(
  candles: Candle[],
  config: ATHGuardConfig,
  positionOpen: boolean
): ATHGuardSignal {
  console.log('[ATH-GUARD] 🔍 Starting evaluation...');
  
  // Need minimum candles for all indicators (increased to 200 for new indicators)
  const minCandles = Math.max(200, config.bollinger_period + 50);
  if (candles.length < minCandles) {
    console.log(`[ATH-GUARD] ❌ Insufficient data: ${candles.length} candles (need ${minCandles})`);
    return { signal_type: null, reason: 'Insufficient candle data' };
  }
  
  const closes = candles.map(c => c.close);
  
  // Calculate all indicators
  const ema50 = calculateEMA(closes, 50);
  const ema100 = calculateEMA(closes, 100);
  const ema150 = calculateEMA(closes, 150);
  const vwap = calculateVWAP(candles);
  const macd = calculateMACD(closes);
  const stoch = calculateStochastic(candles, 14);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(candles, 14);
  
  // Calculate new indicators
  const adx = calculateADX(candles, 14);
  const bollinger = calculateBollingerBands(closes, config.bollinger_period, config.bollinger_std);
  const supportResistance = calculateSupportResistance(candles, config.support_resistance_lookback);
  
  const currentPrice = candles[candles.length - 1].close;
  const currentEMA50 = ema50[ema50.length - 1];
  const currentEMA100 = ema100[ema100.length - 1];
  const currentEMA150 = ema150[ema150.length - 1];
  const currentVWAP = vwap[vwap.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  const currentATR = atr[atr.length - 1];
  
  // New indicator values
  const currentADX = adx[adx.length - 1];
  const currentBollingerUpper = bollinger.upper[bollinger.upper.length - 1];
  const currentBollingerMiddle = bollinger.middle[bollinger.middle.length - 1];
  const currentBollingerLower = bollinger.lower[bollinger.lower.length - 1];
  const bollingerPosition = calculateBollingerPosition(currentPrice, currentBollingerUpper, currentBollingerMiddle, currentBollingerLower);
  
  const ema150Slope = calculateEMASlope(ema150);
  
  // Calculate momentum score
  const momentumScore = calculateMomentumScore(candles, rsi, macd, stoch);
  
  // Calculate ATH distance
  const athDistance = Math.abs(currentPrice - currentEMA150) / currentEMA150;
  
  console.log(`[ATH-GUARD] 📊 Current State:`, {
    price: currentPrice.toFixed(2),
    ema50: currentEMA50.toFixed(2),
    ema100: currentEMA100.toFixed(2),
    ema150: currentEMA150.toFixed(2),
    vwap: currentVWAP.toFixed(2),
    ema150Slope: ema150Slope.toFixed(4),
    rsi: currentRSI.toFixed(2),
    positionOpen
  });
  
  // Calculate volume ratio early for breakout logic
  const currentVolume = candles[candles.length - 1].volume;
  const last20Volumes = candles.slice(-21, -1).map(c => c.volume);
  const avgVolume = last20Volumes.reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = currentVolume / avgVolume;
  
  // OPTIMIZED: Stricter volume confirmation (1.3 → 1.5)
  const volumeConfirmed = volumeRatio >= config.volume_multiplier;
  
  // NEW: Breakout Entry (Priority entry - bypasses all other filters)
  const recentHigh = Math.max(...candles.slice(-20).map(c => c.high));
  const recentLow = Math.min(...candles.slice(-20).map(c => c.low));
  const breakoutThreshold = 0.002; // 0.2% breakout
  const volumeSpike = volumeRatio >= 1.5; // OPTIMIZED: 50% volume spike (was 1.3)
  
  if (!positionOpen && currentPrice > recentHigh * (1 + breakoutThreshold) && volumeSpike) {
    const stopLoss = currentPrice - (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice + (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice + (config.atr_tp2_multiplier * currentATR);
    
    console.log('[ATH-GUARD] 🚀 BREAKOUT LONG DETECTED', {
      price: currentPrice.toFixed(2),
      recentHigh: recentHigh.toFixed(2),
      breakout: `+${((currentPrice / recentHigh - 1) * 100).toFixed(2)}%`,
      volumeSpike: `${volumeRatio.toFixed(2)}x`
    });
    
    return {
      signal_type: 'BUY',
      reason: 'ATH Guard BREAKOUT LONG: Price broke recent high with volume spike',
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      adx: currentADX,
      bollinger_position: bollingerPosition,
      momentum_score: momentumScore,
      support_resistance_level: recentHigh,
      confidence: 85, // High confidence for breakouts
      time_to_expire: 15 // Short expiration for breakout signals
    };
  }
  
  if (!positionOpen && currentPrice < recentLow * (1 - breakoutThreshold) && volumeSpike) {
    const stopLoss = currentPrice + (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice - (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice - (config.atr_tp2_multiplier * currentATR);
    
    console.log('[ATH-GUARD] 🚀 BREAKOUT SHORT DETECTED', {
      price: currentPrice.toFixed(2),
      recentLow: recentLow.toFixed(2),
      breakout: `${((currentPrice / recentLow - 1) * 100).toFixed(2)}%`,
      volumeSpike: `${volumeRatio.toFixed(2)}x`
    });
    
    return {
      signal_type: 'SELL',
      reason: 'ATH Guard BREAKOUT SHORT: Price broke recent low with volume spike',
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      adx: currentADX,
      bollinger_position: bollingerPosition,
      momentum_score: momentumScore,
      support_resistance_level: recentLow,
      confidence: 85, // High confidence for breakouts
      time_to_expire: 15 // Short expiration for breakout signals
    };
  }
  
  // Step 1: Simplified Bias Filter (EMA alignment only)
  const bias = checkBiasFilter(currentPrice, currentEMA50, currentEMA100, currentEMA150, ema150Slope, config);
  
  console.log(`[ATH-GUARD] 🎯 Step 1 - Simplified Bias Filter: ${bias}`, {
    priceVsEMA150: currentPrice > currentEMA150 ? 'ABOVE' : 'BELOW',
    emaAlignment: `EMA50(${currentEMA50.toFixed(2)}) ${currentEMA50 > currentEMA100 ? '>' : '<'} EMA100(${currentEMA100.toFixed(2)})`,
    slope: `${ema150Slope.toFixed(4)}%`,
    passed: bias !== 'NEUTRAL'
  });
  
  if (bias === 'NEUTRAL') {
    return { signal_type: null, reason: 'No clear bias - EMA alignment not met' };
  }
  
  // Step 2: OPTIMIZED Confirmation - Require Volume, ADX, and Momentum
  // Stricter filters for better win rate
  const momentumConfirmed = Math.abs(momentumScore) >= config.momentum_threshold;
  const adxConfirmed = currentADX >= config.adx_threshold; // OPTIMIZED: Require ADX >= 25
  const volumeConfirmedStep2 = volumeRatio >= config.volume_multiplier; // OPTIMIZED: Require volume >= 1.5
  
  console.log(`[ATH-GUARD] 📈 Step 2 - Optimized Confirmation:`, {
    momentum_confirmed: momentumConfirmed ? '✅ PASS' : '❌ FAIL',
    adx_confirmed: adxConfirmed ? '✅ PASS' : '❌ FAIL',
    volume_confirmed: volumeConfirmedStep2 ? '✅ PASS' : '❌ FAIL',
    currentVolume: currentVolume.toFixed(0),
    avgVolume: avgVolume.toFixed(0),
    ratio: `${volumeRatio.toFixed(2)}x (need ${config.volume_multiplier}x)`,
    adx_value: `${currentADX.toFixed(2)} (need ${config.adx_threshold})`,
    momentum_score: momentumScore.toFixed(2)
  });
  
  if (!momentumConfirmed || !adxConfirmed || !volumeConfirmedStep2) {
    return { signal_type: null, reason: `Confirmation failed: Momentum=${momentumConfirmed}, ADX=${adxConfirmed}, Volume=${volumeConfirmedStep2}` };
  }
  
  // Step 3: OPTIMIZED Momentum Confirmation (RSI + MACD) with stricter RSI threshold
  const hasMomentum = checkMomentum(macd, rsi, bias, config);
  
  const idx = macd.macd.length - 1;
  const currentMACD = macd.macd[idx];
  const currentSignal = macd.signal[idx];
  const currentHistogram = macd.histogram[idx];
  
  // OPTIMIZED: Stricter RSI check for LONG (require RSI < threshold, not just < 50)
  const rsiCheck = bias === 'LONG' 
    ? currentRSI < config.rsi_threshold  // OPTIMIZED: Require RSI < 80 (not overbought)
    : currentRSI > (100 - config.rsi_threshold); // OPTIMIZED: Require RSI > 20 (not oversold)
  
  console.log(`[ATH-GUARD] ⚡ Step 3 - Optimized Momentum Confirmation: ${hasMomentum && rsiCheck ? '✅ PASS' : '❌ FAIL'}`, {
    bias,
    rsi: `${currentRSI.toFixed(2)} (need ${bias === 'LONG' ? `<${config.rsi_threshold}` : `>${100 - config.rsi_threshold}`})`,
    rsi_check: rsiCheck ? '✅ PASS' : '❌ FAIL',
    macd: {
      histogram: currentHistogram.toFixed(4),
      condition: bias === 'LONG' ? '>0' : '<0'
    }
  });
  
  if (!hasMomentum || !rsiCheck) {
    return { signal_type: null, reason: `Momentum not aligned: MACD=${hasMomentum}, RSI=${rsiCheck}` };
  }
  
  // All conditions met - generate signal
  console.log('[ATH-GUARD] ✅ ALL CONDITIONS PASSED!');
  
  if (!positionOpen && bias === 'LONG') {
    // Enhanced signal generation with new parameters
    const stopLoss = currentPrice - (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice + (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice + (config.atr_tp2_multiplier * currentATR);
    
    // Calculate confidence score
    const confidence = calculateSignalConfidence(
      currentRSI, 
      currentADX, 
      momentumScore, 
      bollingerPosition,
      volumeConfirmed, // OPTIMIZED: Use strict volume confirmation (>= 1.5x)
      athDistance
    );
    
    console.log('[ATH-GUARD] 🚀 GENERATING ENHANCED BUY SIGNAL', {
      entry: currentPrice.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      tp1: takeProfit1.toFixed(2),
      tp2: takeProfit2.toFixed(2),
      atr: currentATR.toFixed(2),
      ratio: `1:2 (SL=${config.atr_sl_multiplier}x, TP2=${config.atr_tp2_multiplier}x ATR)`,
      confidence: `${confidence.toFixed(1)}%`,
      adx: currentADX.toFixed(2),
      momentum: momentumScore.toFixed(2),
      bollinger: bollingerPosition.toFixed(3)
    });
    
    return {
      signal_type: 'BUY',
      reason: 'ATH Guard LONG: Simplified 3-step (Bias + Momentum + Pullback)',
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      adx: currentADX,
      bollinger_position: bollingerPosition,
      momentum_score: momentumScore,
      support_resistance_level: supportResistance.resistance,
      confidence: confidence,
      time_to_expire: config.max_position_time
    };
  }
  
  if (!positionOpen && bias === 'SHORT') {
    // Enhanced signal generation with new parameters
    const stopLoss = currentPrice + (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice - (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice - (config.atr_tp2_multiplier * currentATR);
    
    // Calculate confidence score
    const confidence = calculateSignalConfidence(
      currentRSI, 
      currentADX, 
      momentumScore, 
      bollingerPosition,
      volumeConfirmed, // OPTIMIZED: Use strict volume confirmation (>= 1.5x)
      athDistance
    );
    
    console.log('[ATH-GUARD] 🚀 GENERATING ENHANCED SELL SIGNAL', {
      entry: currentPrice.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      tp1: takeProfit1.toFixed(2),
      tp2: takeProfit2.toFixed(2),
      atr: currentATR.toFixed(2),
      ratio: `1:2 (SL=${config.atr_sl_multiplier}x, TP2=${config.atr_tp2_multiplier}x ATR)`,
      confidence: `${confidence.toFixed(1)}%`,
      adx: currentADX.toFixed(2),
      momentum: momentumScore.toFixed(2),
      bollinger: bollingerPosition.toFixed(3)
    });
    
    return {
      signal_type: 'SELL',
      reason: 'ATH Guard SHORT: Enhanced 4-step (Bias + Volume + ADX + Momentum)',
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      adx: currentADX,
      bollinger_position: bollingerPosition,
      momentum_score: momentumScore,
      support_resistance_level: supportResistance.support,
      confidence: confidence,
      time_to_expire: config.max_position_time
    };
  }
  
  // Exit logic: If position open and price closes below EMA50 (long) or above EMA50 (short)
  if (positionOpen) {
    const positionType = currentPrice > currentEMA50 ? 'LONG' : 'SHORT';
    
    console.log('[ATH-GUARD] 🔄 Checking exit conditions for open position', {
      positionType,
      currentPrice: currentPrice.toFixed(2),
      ema50: currentEMA50.toFixed(2)
    });
    
    if (positionType === 'LONG' && currentPrice < currentEMA50) {
      console.log('[ATH-GUARD] 🛑 EXIT LONG: Price closed below EMA50');
      return {
        signal_type: 'SELL',
        reason: 'Exit LONG: Price closed below EMA50',
      };
    }
    
    if (positionType === 'SHORT' && currentPrice > currentEMA50) {
      console.log('[ATH-GUARD] 🛑 EXIT SHORT: Price closed above EMA50');
      return {
        signal_type: 'BUY',
        reason: 'Exit SHORT: Price closed above EMA50',
      };
    }
  }
  
  console.log('[ATH-GUARD] ⏸️ No signal generated (position already open or bias not aligned)');
  return { signal_type: null, reason: 'No signal' };
}

// Default configuration for ATH Guard strategy (1m timeframe)
export const defaultATHGuardConfig: ATHGuardConfig = {
  // Original parameters
  ema_slope_threshold: 0.15,
  pullback_tolerance: 0.25,  // OPTIMIZED: Increased from 0.15 to 0.25 for pullback confirmation
  volume_multiplier: 1.5,   // OPTIMIZED: Stricter volume (1.5) for strong volume confirmation
  stoch_oversold: 25,
  stoch_overbought: 75,
  atr_sl_multiplier: 1.0,   // OPTIMIZED: Tighter stop loss for 1m scalping
  atr_tp1_multiplier: 0.6,  // OPTIMIZED: Adjusted take profit 1
  atr_tp2_multiplier: 1.2,  // OPTIMIZED: Adjusted take profit 2
  ath_safety_distance: 0.2,
  rsi_threshold: 80,        // OPTIMIZED: Stricter RSI (80) for overbought confirmation
  
  // New enhanced parameters
  adx_threshold: 25,        // OPTIMIZED: Higher ADX (25) for stronger trend
  bollinger_period: 20,
  bollinger_std: 2.0,
  trailing_stop_percent: 0.5,
  max_position_time: 45,    // OPTIMIZED: Shorter position time (45 min) for 1m scalping
  min_volume_spike: 1.2,
  momentum_threshold: 15,
  support_resistance_lookback: 20
};
