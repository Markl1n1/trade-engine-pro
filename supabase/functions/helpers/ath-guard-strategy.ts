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
}

interface ATHGuardSignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  stop_loss?: number;
  take_profit_1?: number;
  take_profit_2?: number;
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

// Check Bias Filter
function checkBiasFilter(
  price: number,
  ema50: number,
  ema100: number,
  ema150: number,
  ema150Slope: number,
  config: ATHGuardConfig
): 'LONG' | 'SHORT' | 'NEUTRAL' {
  // Long bias
  if (
    price > ema150 &&
    ema50 > ema100 &&
    ema100 > ema150 &&
    ema150Slope > config.ema_slope_threshold
  ) {
    return 'LONG';
  }
  
  // Short bias
  if (
    price < ema150 &&
    ema50 < ema100 &&
    ema100 < ema150 &&
    ema150Slope < -config.ema_slope_threshold
  ) {
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

// Check Momentum Triggers
function checkMomentum(
  macd: { macd: number[], signal: number[], histogram: number[] },
  stoch: { k: number[], d: number[] },
  bias: 'LONG' | 'SHORT',
  config: ATHGuardConfig
): boolean {
  const idx = macd.macd.length - 1;
  const prevIdx = idx - 1;
  
  if (idx < 1) return false;
  
  const currentMACD = macd.macd[idx];
  const currentSignal = macd.signal[idx];
  const currentHistogram = macd.histogram[idx];
  const prevMACD = macd.macd[prevIdx];
  const prevSignal = macd.signal[prevIdx];
  
  const currentK = stoch.k[idx];
  const currentD = stoch.d[idx];
  const prevK = stoch.k[prevIdx];
  const prevD = stoch.d[prevIdx];
  
  if (bias === 'LONG') {
    // MACD crossover above signal + histogram > 0
    const macdCross = prevMACD <= prevSignal && currentMACD > currentSignal && currentHistogram > 0;
    
    // Stochastic %K crosses above %D from below oversold zone
    const stochCross = prevK <= prevD && currentK > currentD && prevK < config.stoch_oversold;
    
    return macdCross && stochCross;
  } else {
    // MACD crossover below signal + histogram < 0
    const macdCross = prevMACD >= prevSignal && currentMACD < currentSignal && currentHistogram < 0;
    
    // Stochastic %K crosses below %D from above overbought zone
    const stochCross = prevK >= prevD && currentK < currentD && prevK > config.stoch_overbought;
    
    return macdCross && stochCross;
  }
}

// Check Volume Validation
function checkVolume(candles: Candle[], config: ATHGuardConfig): boolean {
  if (candles.length < 21) return false;
  
  const currentVolume = candles[candles.length - 1].volume;
  const last20Volumes = candles.slice(-21, -1).map(c => c.volume);
  const avgVolume = last20Volumes.reduce((a, b) => a + b, 0) / 20;
  
  return currentVolume >= avgVolume * config.volume_multiplier;
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
  
  // Need minimum candles for all indicators (reduced from 150 to 100 for better compatibility)
  if (candles.length < 100) {
    console.log(`[ATH-GUARD] ❌ Insufficient data: ${candles.length} candles (need 100)`);
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
  
  const currentPrice = candles[candles.length - 1].close;
  const currentEMA50 = ema50[ema50.length - 1];
  const currentEMA100 = ema100[ema100.length - 1];
  const currentEMA150 = ema150[ema150.length - 1];
  const currentVWAP = vwap[vwap.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  const currentATR = atr[atr.length - 1];
  
  const ema150Slope = calculateEMASlope(ema150);
  
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
  
  // Step 1: Check bias filter
  const bias = checkBiasFilter(currentPrice, currentEMA50, currentEMA100, currentEMA150, ema150Slope, config);
  
  console.log(`[ATH-GUARD] 🎯 Step 1 - Bias Filter: ${bias}`, {
    priceVsEMA150: currentPrice > currentEMA150 ? 'ABOVE' : 'BELOW',
    emaAlignment: `EMA50(${currentEMA50.toFixed(2)}) ${currentEMA50 > currentEMA100 ? '>' : '<'} EMA100(${currentEMA100.toFixed(2)}) ${currentEMA100 > currentEMA150 ? '>' : '<'} EMA150(${currentEMA150.toFixed(2)})`,
    slope: `${ema150Slope.toFixed(4)}% (threshold: ${config.ema_slope_threshold}%)`,
    passed: bias !== 'NEUTRAL'
  });
  
  if (bias === 'NEUTRAL') {
    return { signal_type: null, reason: 'No clear bias - EMA alignment not met' };
  }
  
  // Step 2: Check pullback
  const hasPullback = checkPullback(candles, currentVWAP, currentEMA50, bias, config);
  
  const prevPrice = candles[candles.length - 2]?.close || currentPrice;
  console.log(`[ATH-GUARD] 🔄 Step 2 - Pullback Check: ${hasPullback ? '✅ PASS' : '❌ FAIL'}`, {
    bias,
    prevPrice: prevPrice.toFixed(2),
    currentPrice: currentPrice.toFixed(2),
    vwap: currentVWAP.toFixed(2),
    ema50: currentEMA50.toFixed(2),
    tolerance: `${config.pullback_tolerance}%`
  });
  
  if (!hasPullback) {
    return { signal_type: null, reason: 'Waiting for pullback to VWAP/EMA50' };
  }
  
  // Step 3: Check momentum triggers
  const hasMomentum = checkMomentum(macd, stoch, bias, config);
  
  const idx = macd.macd.length - 1;
  const currentMACD = macd.macd[idx];
  const currentSignal = macd.signal[idx];
  const currentHistogram = macd.histogram[idx];
  const currentK = stoch.k[idx];
  const currentD = stoch.d[idx];
  
  console.log(`[ATH-GUARD] ⚡ Step 3 - Momentum Check: ${hasMomentum ? '✅ PASS' : '❌ FAIL'}`, {
    bias,
    macd: {
      line: currentMACD.toFixed(4),
      signal: currentSignal.toFixed(4),
      histogram: currentHistogram.toFixed(4),
      crossover: currentMACD > currentSignal ? 'ABOVE' : 'BELOW'
    },
    stochastic: {
      k: currentK.toFixed(2),
      d: currentD.toFixed(2),
      crossover: currentK > currentD ? 'ABOVE' : 'BELOW',
      zone: bias === 'LONG' ? `oversold(<${config.stoch_oversold})` : `overbought(>${config.stoch_overbought})`
    }
  });
  
  if (!hasMomentum) {
    return { signal_type: null, reason: 'Momentum triggers not aligned (MACD + Stochastic)' };
  }
  
  // Step 4: Check volume
  const hasVolume = checkVolume(candles, config);
  
  const currentVolume = candles[candles.length - 1].volume;
  const last20Volumes = candles.slice(-21, -1).map(c => c.volume);
  const avgVolume = last20Volumes.reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = currentVolume / avgVolume;
  
  console.log(`[ATH-GUARD] 📈 Step 4 - Volume Check: ${hasVolume ? '✅ PASS' : '❌ FAIL'}`, {
    currentVolume: currentVolume.toFixed(0),
    avgVolume: avgVolume.toFixed(0),
    ratio: `${volumeRatio.toFixed(2)}x (need ${config.volume_multiplier}x)`
  });
  
  if (!hasVolume) {
    return { signal_type: null, reason: `Volume too low (< ${config.volume_multiplier}x average)` };
  }
  
  // Step 5: Check ATH safety
  const athSafe = checkATHSafety(candles, currentRSI, bias, config);
  
  const lookback = Math.min(100, candles.length);
  const recentCandles = candles.slice(-lookback);
  const recentHigh = Math.max(...recentCandles.map(c => c.high));
  const distanceToATH = ((currentPrice - recentHigh) / recentHigh) * 100;
  
  console.log(`[ATH-GUARD] 🛡️ Step 5 - ATH Safety Check: ${athSafe ? '✅ PASS' : '❌ FAIL'}`, {
    bias,
    currentPrice: currentPrice.toFixed(2),
    recentHigh: recentHigh.toFixed(2),
    distanceToATH: `${distanceToATH.toFixed(2)}% (threshold: ${config.ath_safety_distance}%)`,
    rsi: `${currentRSI.toFixed(2)} (threshold: ${config.rsi_threshold})`
  });
  
  if (!athSafe) {
    return { signal_type: null, reason: 'Near ATH with high RSI - skipping aggressive entry' };
  }
  
  // All conditions met - generate signal
  console.log('[ATH-GUARD] ✅ ALL CONDITIONS PASSED!');
  
  if (!positionOpen && bias === 'LONG') {
    // Updated to 1:2 ratio: SL = 1.0x ATR, TP1 = 1.0x ATR (partial), TP2 = 2.0x ATR (full 1:2)
    const stopLoss = currentPrice - (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice + (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice + (config.atr_tp2_multiplier * currentATR);
    
    console.log('[ATH-GUARD] 🚀 GENERATING BUY SIGNAL', {
      entry: currentPrice.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      tp1: takeProfit1.toFixed(2),
      tp2: takeProfit2.toFixed(2),
      atr: currentATR.toFixed(2),
      ratio: `1:2 (SL=${config.atr_sl_multiplier}x, TP2=${config.atr_tp2_multiplier}x ATR)`
    });
    
    return {
      signal_type: 'BUY',
      reason: 'ATH Guard LONG: Bias filter + Pullback + MACD cross + Stoch cross + Volume spike',
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
    };
  }
  
  if (!positionOpen && bias === 'SHORT') {
    // Updated to 1:2 ratio: SL = 1.0x ATR, TP1 = 1.0x ATR (partial), TP2 = 2.0x ATR (full 1:2)
    const stopLoss = currentPrice + (config.atr_sl_multiplier * currentATR);
    const takeProfit1 = currentPrice - (config.atr_tp1_multiplier * currentATR);
    const takeProfit2 = currentPrice - (config.atr_tp2_multiplier * currentATR);
    
    console.log('[ATH-GUARD] 🚀 GENERATING SELL SIGNAL', {
      entry: currentPrice.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      tp1: takeProfit1.toFixed(2),
      tp2: takeProfit2.toFixed(2),
      atr: currentATR.toFixed(2),
      ratio: `1:2 (SL=${config.atr_sl_multiplier}x, TP2=${config.atr_tp2_multiplier}x ATR)`
    });
    
    return {
      signal_type: 'SELL',
      reason: 'ATH Guard SHORT: Bias filter + Rejection + MACD cross + Stoch cross + Volume spike',
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
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
