// FVG (Fair Value Gap) Scalping Strategy
// Detects fair value gaps and trades retests with 3:1 R:R
// Trading window: 9:30-9:35 AM EST only

import { Candle, BaseSignal } from './strategy-interfaces.ts';

export interface FVGConfig {
  keyTimeStart: string; // e.g., "09:30"
  keyTimeEnd: string;   // e.g., "09:35"
  keyTimeframe: string; // e.g., "5m"
  analysisTimeframe: string; // e.g., "1m"
  riskRewardRatio: number; // default 3.0
  tickSize: number; // default 0.01
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

// Detect Fair Value Gap between three consecutive candles
export function detectFairValueGap(candles: Candle[]): FVGZone | null {
  if (candles.length < 3) {
    return null;
  }

  // Check last 3 candles
  const prev = candles[candles.length - 3];
  const current = candles[candles.length - 2];
  const next = candles[candles.length - 1];

  // Bullish FVG: previous candle's high < next candle's low (gap between them)
  if (prev.high < next.low) {
    console.log('[FVG] Bullish FVG detected:', {
      prevHigh: prev.high,
      nextLow: next.low,
      gap: next.low - prev.high
    });
    return {
      type: 'bullish',
      top: next.low,
      bottom: prev.high,
      timestamp: next.timestamp || next.open_time || 0,
      detected: true
    };
  }

  // Bearish FVG: previous candle's low > next candle's high (gap between them)
  if (prev.low > next.high) {
    console.log('[FVG] Bearish FVG detected:', {
      prevLow: prev.low,
      nextHigh: next.high,
      gap: prev.low - next.high
    });
    return {
      type: 'bearish',
      top: prev.low,
      bottom: next.high,
      timestamp: next.timestamp || next.open_time || 0,
      detected: true
    };
  }

  return null;
}

// Check if candle retests the FVG zone
export function detectRetestCandle(fvg: FVGZone, candle: Candle): boolean {
  if (!fvg.detected) return false;

  if (fvg.type === 'bullish') {
    // For bullish FVG, check if price touches the gap zone
    return candle.low <= fvg.top && candle.low >= fvg.bottom;
  } else {
    // For bearish FVG, check if price touches the gap zone
    return candle.high >= fvg.bottom && candle.high <= fvg.top;
  }
}

// Check if retest candle engulfs the FVG zone
export function checkEngulfment(retestCandle: Candle, fvg: FVGZone): boolean {
  if (fvg.type === 'bullish') {
    // Bullish engulfment: candle closes above the FVG top
    return retestCandle.close > fvg.top;
  } else {
    // Bearish engulfment: candle closes below the FVG bottom
    return retestCandle.close < fvg.bottom;
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

// Calculate confidence score based on FVG quality
export function calculateConfidence(fvg: FVGZone, candle: Candle): number {
  let confidence = 50;
  
  // Larger gap = higher confidence
  const gapSize = fvg.top - fvg.bottom;
  const pricePercent = (gapSize / candle.close) * 100;
  
  if (pricePercent > 0.5) confidence += 15;
  else if (pricePercent > 0.3) confidence += 10;
  else if (pricePercent > 0.1) confidence += 5;
  
  // Volume confirmation
  if (candle.volume > 0) confidence += 10;
  
  // Engulfment strength
  const bodySize = Math.abs(candle.close - candle.open);
  const candleRange = candle.high - candle.low;
  const bodyRatio = bodySize / candleRange;
  
  if (bodyRatio > 0.7) confidence += 15;
  else if (bodyRatio > 0.5) confidence += 10;
  
  return Math.min(100, confidence);
}

// Main FVG strategy evaluation function
export function evaluateFVGStrategy(
  candles: Candle[],
  config: FVGConfig,
  isBacktest: boolean = false
): BaseSignal {
  console.log('[FVG-STRATEGY] Evaluating with', candles.length, 'candles');
  
  if (candles.length < 10) {
    return {
      signal_type: null,
      reason: 'Not enough candle data (need at least 10 candles)',
      confidence: 0
    };
  }

  // Check trading window (skip for backtest)
  if (!isBacktest) {
    const currentTime = new Date();
    if (!isWithinTradingWindow(currentTime, config)) {
      return {
        signal_type: null,
        reason: 'Outside trading window (9:30-9:35 AM EST)',
        confidence: 0
      };
    }
  }

  // Step 1: Detect FVG in recent candles
  const fvg = detectFairValueGap(candles);
  
  if (!fvg) {
    return {
      signal_type: null,
      reason: 'No Fair Value Gap detected',
      confidence: 0
    };
  }

  console.log('[FVG-STRATEGY] FVG detected:', fvg.type);

  // Step 2: Check for retest
  const currentCandle = candles[candles.length - 1];
  const isRetest = detectRetestCandle(fvg, currentCandle);

  if (!isRetest) {
    return {
      signal_type: null,
      reason: `${fvg.type} FVG detected but no retest yet`,
      confidence: 20
    };
  }

  console.log('[FVG-STRATEGY] Retest detected');

  // Step 3: Check for engulfment confirmation
  const hasEngulfment = checkEngulfment(currentCandle, fvg);

  if (!hasEngulfment) {
    return {
      signal_type: null,
      reason: `${fvg.type} FVG retest but no engulfment confirmation`,
      confidence: 40
    };
  }

  console.log('[FVG-STRATEGY] Engulfment confirmed');

  // Step 4: Calculate entry, SL, TP
  const { entry, stopLoss, takeProfit } = calculateEntry(currentCandle, fvg, config);
  const confidence = calculateConfidence(fvg, currentCandle);

  // Generate signal
  const signal: BaseSignal = {
    signal_type: fvg.type === 'bullish' ? 'BUY' : 'SELL',
    reason: `${fvg.type.toUpperCase()} FVG retest with engulfment. Gap: ${fvg.bottom.toFixed(2)}-${fvg.top.toFixed(2)}. Entry: ${entry.toFixed(2)}, SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)} (R:R ${config.riskRewardRatio}:1)`,
    stop_loss: stopLoss,
    take_profit: takeProfit,
    confidence,
    time_to_expire: 30 // 30 minutes max position time for scalping
  };

  console.log('[FVG-STRATEGY] Signal generated:', signal);

  return signal;
}
