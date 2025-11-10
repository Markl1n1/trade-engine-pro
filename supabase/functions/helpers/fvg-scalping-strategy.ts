// FVG (Fair Value Gap) Scalping Strategy - ENHANCED
// Detects fair value gaps and trades retests with 3:1 R:R
// Includes RSI momentum, EMA trend, quality scoring, volume confirmation

import { Candle, BaseSignal } from './strategy-interfaces.ts';
import { calculateRSI, calculateEMA, calculateSMA } from '../indicators/all-indicators.ts';

export interface FVGConfig {
  keyTimeStart: string; // e.g., "09:30"
  keyTimeEnd: string;   // e.g., "09:35"
  keyTimeframe: string; // e.g., "5m"
  analysisTimeframe: string; // e.g., "1m"
  riskRewardRatio: number; // default 3.0
  tickSize: number; // default 0.01
  // Phase 2: Minimum FVG size
  min_fvg_size_percent: number; // default 0.3
  // Phase 3: Trend filter
  require_trend_alignment: boolean; // default true
  // Phase 4: Volume multiplier
  min_volume_ratio: number; // default 1.5
  // Phase 6: 50% mitigation
  prefer_50_percent_fill: boolean; // default true
  // Phase 7: Low liquidity filter
  avoid_low_liquidity_hours: boolean; // default true
  // extension: allow disabling time window via config loader flags
  disableTimeWindow?: boolean;
}

export interface FVGZone {
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  timestamp: number;
  detected: boolean;
}

// Check if current time is within trading window (9:30-9:35 AM EST)
export function isWithinTradingWindow(currentTime: Date, config: FVGConfig): boolean {
  const estTime = new Date(currentTime.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = estTime.getHours();
  const minutes = estTime.getMinutes();
  const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  const [startHour, startMin] = config.keyTimeStart.split(':').map(Number);
  const [endHour, endMin] = config.keyTimeEnd.split(':').map(Number);
  
  const currentMinutes = hours * 60 + minutes;
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// Detect Fair Value Gap between three consecutive candles (RELAXED LOGIC)
export function detectFairValueGap(candles: Candle[], tickSize: number = 0.01): FVGZone | null {
  if (candles.length < 3) {
    return null;
  }

  // Check last 3 candles
  const prev = candles[candles.length - 3];
  const middle = candles[candles.length - 2];
  const next = candles[candles.length - 1];

  // Calculate minimum gap size based on tick size and price
  const currentPrice = next.close;
  const minGapSize = Math.max(tickSize * 2, currentPrice * 0.001); // At least 2 ticks or 0.1% of price
  
  // Bullish FVG: gap exists AND middle doesn't FULLY CLOSE the gap
  const bullishGap = prev.high < next.low;
  const gapSize = next.low - prev.high;
  // Middle fills gap if it touches both sides of the gap
  const middleFillsGap = middle.low <= prev.high && middle.high >= next.low;
  
  // Debug: Log every 3-candle check
  console.log(`[FVG-CHECK] Prev H:${prev.high.toFixed(2)} | Mid L:${middle.low.toFixed(2)}-H:${middle.high.toFixed(2)} | Next L:${next.low.toFixed(2)} | Gap:${gapSize.toFixed(4)} | Min:${minGapSize.toFixed(4)}`);
  
  if (bullishGap && !middleFillsGap && gapSize >= minGapSize) {
    const top = next.low;    // Upper boundary of gap
    const bottom = prev.high; // Lower boundary of gap
    
    console.log('[FVG] ✅ Bullish FVG DETECTED:', {
      price: currentPrice.toFixed(2),
      minGap: minGapSize.toFixed(4),
      actualGap: gapSize.toFixed(4),
      gapPercent: ((gapSize / currentPrice) * 100).toFixed(3) + '%',
      fvgZone: `${bottom.toFixed(2)}-${top.toFixed(2)}`
    });
    return {
      type: 'bullish',
      top: top,
      bottom: bottom,
      timestamp: next.timestamp || next.open_time || 0,
      detected: true
    };
  } else if (bullishGap && !middleFillsGap) {
    console.log(`[FVG] ❌ Bullish gap TOO SMALL: ${gapSize.toFixed(4)} < ${minGapSize.toFixed(4)} (need ${((minGapSize - gapSize) / currentPrice * 100).toFixed(3)}% more)`);
  } else if (bullishGap && middleFillsGap) {
    console.log(`[FVG] ❌ Bullish gap FILLED by middle candle`);
  }

  // Bearish FVG: gap exists AND middle doesn't FULLY CLOSE the gap
  const bearishGap = prev.low > next.high;
  const gapSizeBear = prev.low - next.high;
  // Middle fills gap if it touches both sides of the gap
  const middleFillsGapBear = middle.high >= prev.low && middle.low <= next.high;
  
  if (bearishGap && !middleFillsGapBear && gapSizeBear >= minGapSize) {
    const top = prev.low;    // Upper boundary of gap
    const bottom = next.high; // Lower boundary of gap
    
    console.log('[FVG] ✅ Bearish FVG DETECTED:', {
      price: currentPrice.toFixed(2),
      minGap: minGapSize.toFixed(4),
      actualGap: gapSizeBear.toFixed(4),
      gapPercent: ((gapSizeBear / currentPrice) * 100).toFixed(3) + '%',
      fvgZone: `${bottom.toFixed(2)}-${top.toFixed(2)}`
    });
    return {
      type: 'bearish',
      top: top,
      bottom: bottom,
      timestamp: next.timestamp || next.open_time || 0,
      detected: true
    };
  } else if (bearishGap && !middleFillsGapBear) {
    console.log(`[FVG] ❌ Bearish gap TOO SMALL: ${gapSizeBear.toFixed(4)} < ${minGapSize.toFixed(4)} (need ${((minGapSize - gapSizeBear) / currentPrice * 100).toFixed(3)}% more)`);
  } else if (bearishGap && middleFillsGapBear) {
    console.log(`[FVG] ❌ Bearish gap FILLED by middle candle`);
  }

  return null;
}

// PHASE 2: Relaxed FVG detection with configurable minimum size
export function detectFairValueGapRelaxed(candles: Candle[], config: FVGConfig): FVGZone | null {
  if (candles.length < 3) return null;

  const prev = candles[candles.length - 3];
  const middle = candles[candles.length - 2];
  const next = candles[candles.length - 1];

  const currentPrice = next.close;
  const minGapSize = Math.max(0.15, currentPrice * (config.min_fvg_size_percent / 100));
  const minRemainingGap = Math.max(0.08, currentPrice * 0.002);

  // Bullish FVG: Look for upward gap with incomplete fill
  const upwardGap = next.low > prev.high;
  const gapSize = next.low - prev.high;
  
  if (upwardGap && gapSize >= minGapSize) {
    // Check if middle candle leaves some gap unfilled
    const filledTop = Math.min(next.low, middle.high);
    const filledBottom = Math.max(prev.high, middle.low);
    const remainingGap = filledTop - filledBottom;
    
    if (remainingGap > minRemainingGap) {
      console.log('[FVG-RELAXED] ✅ Bullish FVG detected:', {
        gapSize: gapSize.toFixed(2),
        remainingGap: remainingGap.toFixed(2),
        fvgZone: `${filledBottom.toFixed(2)}-${filledTop.toFixed(2)}`,
        minRequired: minGapSize.toFixed(2)
      });
      return {
        type: 'bullish',
        top: filledTop,
        bottom: filledBottom,
        timestamp: next.timestamp || next.open_time || 0,
        detected: true
      };
    }
  }

  // Bearish FVG: Look for downward gap with incomplete fill
  const downwardGap = next.high < prev.low;
  const gapSizeBear = prev.low - next.high;
  
  if (downwardGap && gapSizeBear >= minGapSize) {
    const filledTop = Math.min(prev.low, middle.high);
    const filledBottom = Math.max(next.high, middle.low);
    const remainingGap = filledTop - filledBottom;
    
    if (remainingGap > minRemainingGap) {
      console.log('[FVG-RELAXED] ✅ Bearish FVG detected:', {
        gapSize: gapSizeBear.toFixed(2),
        remainingGap: remainingGap.toFixed(2),
        fvgZone: `${filledBottom.toFixed(2)}-${filledTop.toFixed(2)}`,
        minRequired: minGapSize.toFixed(2)
      });
      return {
        type: 'bearish',
        top: filledTop,
        bottom: filledBottom,
        timestamp: next.timestamp || next.open_time || 0,
        detected: true
      };
    }
  }

  return null;
}

// PHASE 6: Check if candle retests the FVG zone with 50% mitigation preference
export function detectRetestCandle(fvg: FVGZone, candle: Candle, config: FVGConfig): { isRetest: boolean; touches50Percent: boolean } {
  if (!fvg.detected) return { isRetest: false, touches50Percent: false };

  const fvgMid = (fvg.top + fvg.bottom) / 2;
  const tolerance = fvg.bottom * 0.0005;
  let touches50Percent = false;

  if (fvg.type === 'bullish') {
    // Check if touches 50% midpoint
    touches50Percent = candle.low <= fvgMid && candle.high >= fvgMid;
    
    const isRetest = (candle.low <= fvg.top + tolerance && candle.low >= fvg.bottom - tolerance) ||
           (candle.high <= fvg.top + tolerance && candle.high >= fvg.bottom - tolerance) ||
           (candle.low < fvg.bottom - tolerance && candle.high > fvg.top + tolerance) ||
           (Math.abs(candle.low - fvg.bottom) <= tolerance || Math.abs(candle.high - fvg.top) <= tolerance);
    
    return { isRetest, touches50Percent };
  } else {
    // Check if touches 50% midpoint
    touches50Percent = candle.high >= fvgMid && candle.low <= fvgMid;
    
    const isRetest = (candle.high >= fvg.bottom - tolerance && candle.high <= fvg.top + tolerance) ||
           (candle.low >= fvg.bottom - tolerance && candle.low <= fvg.top + tolerance) ||
           (candle.high > fvg.top + tolerance && candle.low < fvg.bottom - tolerance) ||
           (Math.abs(candle.high - fvg.top) <= tolerance || Math.abs(candle.low - fvg.bottom) <= tolerance);
    
    return { isRetest, touches50Percent };
  }
}

// Check if retest candle engulfs the FVG zone (RELAXED)
export function checkEngulfment(retestCandle: Candle, fvg: FVGZone): boolean {
  if (fvg.type === 'bullish') {
    // More lenient bullish engulfment: candle closes above FVG top OR shows strong bullish momentum
    const tolerance = fvg.top * 0.0005; // 0.05% tolerance
    const strongBullish = retestCandle.close > retestCandle.open && 
                         (retestCandle.close - retestCandle.open) > (retestCandle.high - retestCandle.low) * 0.6;
    
    return retestCandle.close > fvg.top - tolerance || 
           (retestCandle.close > fvg.bottom && strongBullish);
  } else {
    // More lenient bearish engulfment: candle closes below FVG bottom OR shows strong bearish momentum
    const tolerance = fvg.bottom * 0.0005; // 0.05% tolerance
    const strongBearish = retestCandle.close < retestCandle.open && 
                         (retestCandle.open - retestCandle.close) > (retestCandle.high - retestCandle.low) * 0.6;
    
    return retestCandle.close < fvg.bottom + tolerance || 
           (retestCandle.close < fvg.top && strongBearish);
  }
}

// Calculate entry, SL, and TP based on FVG retest
export function calculateEntry(
  retestCandle: Candle,
  fvg: FVGZone,
  config: FVGConfig
): { entry: number; stopLoss: number; takeProfit: number } {
  const entry = retestCandle.close;
  
  if (fvg.type === 'bullish') {
    // For long: SL 1 tick below FVG bottom
    const stopLoss = fvg.bottom - config.tickSize;
    const riskDistance = entry - stopLoss;
    const takeProfit = entry + (riskDistance * config.riskRewardRatio);
    
    return { entry, stopLoss, takeProfit };
  } else {
    // For short: SL 1 tick above FVG top
    const stopLoss = fvg.top + config.tickSize;
    const riskDistance = stopLoss - entry;
    const takeProfit = entry - (riskDistance * config.riskRewardRatio);
    
    return { entry, stopLoss, takeProfit };
  }
}

// PHASE 5: Gap Quality Score - Comprehensive scoring system
export function calculateFVGQualityScore(
  fvg: FVGZone, 
  candle: Candle, 
  volumeRatio: number,
  rsiChange: number,
  trendAligned: boolean
): number {
  const gapSize = fvg.top - fvg.bottom;
  const pricePercent = (gapSize / candle.close) * 100;
  
  // Gap Size Score (30%) - normalized to 0-30
  const gapSizeScore = Math.min(30, pricePercent * 60); // 0.5% = 30 points
  
  // Volume Score (25%) - normalized to 0-25
  const volumeScore = Math.min(25, volumeRatio * 16.67); // 1.5x = 25 points
  
  // Momentum Score (25%) - based on RSI change
  const momentumScore = Math.min(25, Math.abs(rsiChange) * 2.5); // 10 change = 25 points
  
  // Trend Score (20%) - binary
  const trendScore = trendAligned ? 20 : 0;
  
  const totalScore = gapSizeScore + volumeScore + momentumScore + trendScore;
  
  console.log('[FVG-QUALITY]', {
    gapSize: gapSizeScore.toFixed(1),
    volume: volumeScore.toFixed(1),
    momentum: momentumScore.toFixed(1),
    trend: trendScore,
    total: totalScore.toFixed(1)
  });
  
  return totalScore;
}

// PHASE 4: Enhanced confidence with volume confirmation
export function calculateConfidence(
  fvg: FVGZone, 
  candle: Candle, 
  candles: Candle[],
  touches50Percent: boolean,
  qualityScore: number
): number {
  let confidence = 30;
  
  // Add quality score (up to 50 points)
  confidence += Math.min(50, qualityScore * 0.5);
  
  // PHASE 6: Bonus for 50% mitigation
  if (touches50Percent) {
    confidence += 15;
    console.log('[FVG-CONFIDENCE] +15 for 50% mitigation');
  }
  
  // Volume confirmation (up to 20 points)
  const recentCandles = candles.slice(-20);
  const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
  const volumeRatio = candle.volume / avgVolume;
  
  if (volumeRatio > 1.5) confidence += 20;
  else if (volumeRatio > 1.2) confidence += 10;
  else if (volumeRatio < 0.9) confidence -= 10;
  
  // Engulfment strength
  const bodySize = Math.abs(candle.close - candle.open);
  const candleRange = candle.high - candle.low;
  const bodyRatio = bodySize / candleRange;
  
  if (bodyRatio > 0.7) confidence += 10;
  else if (bodyRatio > 0.5) confidence += 5;
  
  return Math.min(100, Math.max(0, confidence));
}

// PHASE 1: RSI Momentum Filter
function checkRSIMomentum(rsi: number[], fvgType: 'bullish' | 'bearish'): { passes: boolean; rsiChange: number } {
  if (rsi.length < 4) return { passes: false, rsiChange: 0 };
  
  const currentRSI = rsi[rsi.length - 1];
  const prevRSI = rsi[rsi.length - 4];
  const rsiChange = currentRSI - prevRSI;
  
  if (fvgType === 'bullish') {
    // Bullish: RSI < 45 OR RSI rose >10 in last 3 candles
    const passes = currentRSI < 45 || rsiChange > 10;
    console.log('[FVG-RSI] Bullish check:', { currentRSI: currentRSI.toFixed(1), rsiChange: rsiChange.toFixed(1), passes });
    return { passes, rsiChange };
  } else {
    // Bearish: RSI > 55 OR RSI fell >10 in last 3 candles
    const passes = currentRSI > 55 || rsiChange < -10;
    console.log('[FVG-RSI] Bearish check:', { currentRSI: currentRSI.toFixed(1), rsiChange: rsiChange.toFixed(1), passes });
    return { passes, rsiChange };
  }
}

// PHASE 3: EMA Trend Filter
function checkTrendAlignment(candles: Candle[], fvgType: 'bullish' | 'bearish'): boolean {
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  
  const currentPrice = closes[closes.length - 1];
  const currentEMA20 = ema20[ema20.length - 1];
  const currentEMA50 = ema50[ema50.length - 1];
  
  if (isNaN(currentEMA20) || isNaN(currentEMA50)) return false;
  
  if (fvgType === 'bullish') {
    const aligned = currentPrice > currentEMA20 && currentEMA20 > currentEMA50;
    console.log('[FVG-TREND] Bullish check:', { price: currentPrice.toFixed(2), ema20: currentEMA20.toFixed(2), ema50: currentEMA50.toFixed(2), aligned });
    return aligned;
  } else {
    const aligned = currentPrice < currentEMA20 && currentEMA20 < currentEMA50;
    console.log('[FVG-TREND] Bearish check:', { price: currentPrice.toFixed(2), ema20: currentEMA20.toFixed(2), ema50: currentEMA50.toFixed(2), aligned });
    return aligned;
  }
}

// PHASE 7: Low Liquidity Hours Filter (for crypto)
function isLowLiquidityHour(timestamp: number, isCrypto: boolean, config: FVGConfig): boolean {
  if (!isCrypto || !config.avoid_low_liquidity_hours) return false;
  
  const date = new Date(timestamp);
  const hour = date.getUTCHours();
  
  // Avoid 00:00-04:00 UTC for crypto (low liquidity)
  const isLowLiquidity = hour >= 0 && hour < 4;
  
  if (isLowLiquidity) {
    console.log('[FVG-TIME] Low liquidity hour:', hour);
  }
  
  return isLowLiquidity;
}

export function evaluateFVGStrategy(
  candles: Candle[],
  config: FVGConfig,
  isBacktest: boolean = false,
  symbol?: string
): BaseSignal {
  console.log('[FVG-STRATEGY] Evaluating with', candles.length, 'candles');
  
  if (candles.length < 60) {
    return {
      signal_type: null,
      reason: 'Not enough candle data (need at least 60 candles for indicators)',
      confidence: 0
    };
  }

  const isFutures = symbol?.includes('ES') || symbol?.includes('NQ');
  const isCrypto = !!(symbol?.includes('BTC') || symbol?.includes('ETH') || symbol?.includes('USDT'));
  
  // PHASE 7: Check low liquidity hours
  const currentTimestamp = candles[candles.length - 1].timestamp || candles[candles.length - 1].open_time || Date.now();
  if (isLowLiquidityHour(currentTimestamp, isCrypto, config)) {
    return {
      signal_type: null,
      reason: 'Low liquidity hours (00:00-04:00 UTC)',
      confidence: 0
    };
  }
  
  if (!config.disableTimeWindow && !isBacktest && isFutures && !isCrypto) {
    const currentTime = new Date();
    if (!isWithinTradingWindow(currentTime, config)) {
      return {
        signal_type: null,
        reason: 'Outside trading window (9:30-9:35 AM EST for futures)',
        confidence: 0
      };
    }
  }

  // Step 1: Detect FVG in recent candles (PHASE 2: with size filter)
  const fvg = detectFairValueGapRelaxed(candles, config);
  
  if (!fvg) {
    return {
      signal_type: null,
      reason: 'No Fair Value Gap detected (or gap too small)',
      confidence: 0
    };
  }

  console.log('[FVG-STRATEGY] FVG detected:', fvg.type);

  // PHASE 1: Check RSI momentum
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const { passes: rsiPasses, rsiChange } = checkRSIMomentum(rsi, fvg.type);
  
  if (!rsiPasses) {
    return {
      signal_type: null,
      reason: `${fvg.type} FVG detected but RSI momentum insufficient`,
      confidence: 15
    };
  }

  // PHASE 3: Check trend alignment
  if (config.require_trend_alignment) {
    const trendAligned = checkTrendAlignment(candles, fvg.type);
    if (!trendAligned) {
      return {
        signal_type: null,
        reason: `${fvg.type} FVG detected but trend not aligned`,
        confidence: 25
      };
    }
  }

  // Step 2: Check for retest (PHASE 6: with 50% check)
  const currentCandle = candles[candles.length - 1];
  const { isRetest, touches50Percent } = detectRetestCandle(fvg, currentCandle, config);

  if (!isRetest) {
    return {
      signal_type: null,
      reason: `${fvg.type} FVG detected but no retest yet`,
      confidence: 30
    };
  }

  console.log('[FVG-STRATEGY] Retest detected', touches50Percent ? '(50% fill)' : '');

  // PHASE 4: Check volume confirmation
  const recentCandles = candles.slice(-20);
  const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
  const volumeRatio = currentCandle.volume / avgVolume;
  
  if (volumeRatio < config.min_volume_ratio * 0.6) {
    console.log('[FVG-VOLUME] Volume too low:', { ratio: volumeRatio.toFixed(2), required: (config.min_volume_ratio * 0.6).toFixed(2) });
    return {
      signal_type: null,
      reason: `${fvg.type} FVG retest but volume too low (${volumeRatio.toFixed(2)}x)`,
      confidence: 35
    };
  }

  // Step 3: Check for engulfment confirmation
  const hasEngulfment = checkEngulfment(currentCandle, fvg);

  if (!hasEngulfment) {
    return {
      signal_type: null,
      reason: `${fvg.type} FVG retest but no engulfment confirmation`,
      confidence: 45
    };
  }

  console.log('[FVG-STRATEGY] Engulfment confirmed');

  // PHASE 5: Calculate quality score
  const trendAligned = config.require_trend_alignment ? checkTrendAlignment(candles, fvg.type) : true;
  const qualityScore = calculateFVGQualityScore(fvg, currentCandle, volumeRatio, Math.abs(rsiChange), trendAligned);
  
  if (qualityScore < 65) {
    console.log('[FVG-QUALITY] Quality score too low:', qualityScore.toFixed(1));
    return {
      signal_type: null,
      reason: `${fvg.type} FVG quality score too low (${qualityScore.toFixed(1)}/100)`,
      confidence: 50
    };
  }

  // Step 4: Calculate entry, SL, TP
  const { entry, stopLoss, takeProfit } = calculateEntry(currentCandle, fvg, config);
  const confidence = calculateConfidence(fvg, currentCandle, candles, touches50Percent, qualityScore);

  // Generate signal
  const signal: BaseSignal = {
    signal_type: fvg.type === 'bullish' ? 'BUY' : 'SELL',
    reason: `${fvg.type.toUpperCase()} FVG (Q:${qualityScore.toFixed(0)}, V:${volumeRatio.toFixed(1)}x${touches50Percent ? ', 50%' : ''}). Entry: ${entry.toFixed(2)}, SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)}`,
    stop_loss: stopLoss,
    take_profit: takeProfit,
    confidence,
    time_to_expire: 30
  };

  console.log('[FVG-STRATEGY] ✅ High-quality signal generated:', signal);

  return signal;
}
