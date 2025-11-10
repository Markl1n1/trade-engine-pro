// 4H Reentry Strategy Helper
// This strategy trades reentries after breakouts of the 4h session range (NY 00:00-03:59)

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
  open_time?: number;
  close_time?: number;
}

interface LiveState {
  range_high?: number;
  range_low?: number;
  position_open: boolean;
  entry_price?: number;
  entry_time?: string;
  last_processed_candle_time?: number;
}

interface ReentrySignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  range_high?: number;
  range_low?: number;
  stop_loss?: number;
  take_profit?: number;
  // Новые поля для улучшенной стратегии
  adx?: number;
  bollinger_position?: number;
  momentum_score?: number;
  volume_confirmation?: boolean;
  session_strength?: number;
  confidence?: number;
  time_to_expire?: number;
}

// Timezone conversion utility for NY time with DST handling
function convertToNYTime(timestamp: number): Date {
  const date = new Date(timestamp);
  
  // Determine if date is in DST (second Sunday in March to first Sunday in November)
  const year = date.getUTCFullYear();
  
  // Second Sunday in March
  const marchSecondSunday = new Date(Date.UTC(year, 2, 1)); // March 1
  marchSecondSunday.setUTCDate(1 + (7 - marchSecondSunday.getUTCDay()) + 7);
  
  // First Sunday in November
  const novFirstSunday = new Date(Date.UTC(year, 10, 1)); // November 1
  novFirstSunday.setUTCDate(1 + (7 - novFirstSunday.getUTCDay()));
  
  // DST begins at 2:00 AM on second Sunday in March, ends at 2:00 AM on first Sunday in November
  const isDST = date >= marchSecondSunday && date < novFirstSunday;
  
  // NY is UTC-4 (EDT) during DST, UTC-5 (EST) otherwise
  const offset = isDST ? -4 : -5;
  
  const utcTime = date.getTime();
  const nyTime = new Date(utcTime + (offset * 60 * 60 * 1000));
  
  return nyTime;
}

function isInNYSession(timestamp: number, sessionStart: string, sessionEnd: string): boolean {
  const nyTime = convertToNYTime(timestamp);
  const hours = nyTime.getUTCHours();
  const minutes = nyTime.getUTCMinutes();
  const currentMinutes = hours * 60 + minutes;
  
  const [startHours, startMins] = sessionStart.split(':').map(Number);
  const [endHours, endMins] = sessionEnd.split(':').map(Number);
  const startMinutes = startHours * 60 + startMins;
  const endMinutes = endHours * 60 + endMins;
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
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
  
  if (gains.length < period) {
    return new Array(data.length).fill(50);
  }
  
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < period; i++) {
    result.push(50);
  }
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    result.push(rsi);
  }
  
  return [50, ...result];
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

// Calculate Volume Confirmation
function calculateVolumeConfirmation(candles: Candle[], lookback: number = 20): boolean {
  if (candles.length < lookback + 1) return false;
  
  const currentVolume = candles[candles.length - 1].volume;
  const avgVolume = candles.slice(-lookback - 1, -1).reduce((sum, c) => sum + c.volume, 0) / lookback;
  
  return currentVolume >= avgVolume * 1.2; // 20% above average
}

// Calculate Session Strength
function calculateSessionStrength(candles: Candle[], sessionStart: string, sessionEnd: string): number {
  const sessionCandles = candles.filter(candle => {
    const timestamp = candle.timestamp || candle.open_time || 0;
    return isInNYSession(timestamp, sessionStart, sessionEnd);
  });
  
  if (sessionCandles.length < 2) return 0;
  
  const sessionHigh = Math.max(...sessionCandles.map(c => c.high));
  const sessionLow = Math.min(...sessionCandles.map(c => c.low));
  const sessionRange = sessionHigh - sessionLow;
  
  const currentPrice = candles[candles.length - 1].close;
  const rangePosition = (currentPrice - sessionLow) / sessionRange;
  
  return Math.max(0, Math.min(1, rangePosition));
}

// Calculate Momentum Score
function calculateMomentumScore(candles: Candle[], rsi: number[]): number {
  const currentPrice = candles[candles.length - 1].close;
  const prevPrice = candles[candles.length - 2].close;
  const priceChange = ((currentPrice - prevPrice) / prevPrice) * 100;
  
  const rsiScore = rsi[rsi.length - 1] > 50 ? 1 : -1;
  const momentumScore = (priceChange * 0.7) + (rsiScore * 0.3);
  
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
  sessionStrength: number
): number {
  let confidence = 0;
  
  // RSI contribution (0-20 points)
  if (rsi > 40 && rsi < 60) confidence += 20;
  else if (rsi > 30 && rsi < 70) confidence += 15;
  else if (rsi > 20 && rsi < 80) confidence += 10;
  else confidence += 5;
  
  // ADX contribution (0-25 points)
  if (adx > 25) confidence += 25;
  else if (adx > 20) confidence += 20;
  else if (adx > 15) confidence += 15;
  else confidence += 5;
  
  // Momentum contribution (0-20 points)
  if (Math.abs(momentumScore) > 15) confidence += 20;
  else if (Math.abs(momentumScore) > 10) confidence += 15;
  else if (Math.abs(momentumScore) > 5) confidence += 10;
  else confidence += 5;
  
  // Bollinger position contribution (0-15 points)
  if (bollingerPosition > 0.2 && bollingerPosition < 0.8) confidence += 15;
  else if (bollingerPosition > 0.1 && bollingerPosition < 0.9) confidence += 10;
  else confidence += 5;
  
  // Volume confirmation (0-10 points)
  if (volumeConfirmed) confidence += 10;
  
  // Session strength (0-10 points)
  if (sessionStrength > 0.7) confidence += 10;
  else if (sessionStrength > 0.5) confidence += 5;
  
  return Math.min(100, Math.max(0, confidence));
}

export function evaluate4hReentry(
  candles: Candle[],
  liveState: LiveState | null,
  strategy: any,
  stopLossPercent?: number,
  takeProfitPercent?: number
): ReentrySignal {
  console.log('[4H-REENTRY] Starting enhanced evaluation...');
  
  // Need minimum candles for new indicators
  const minCandles = 200;
  if (!candles || candles.length < minCandles) {
    console.log(`[4H-REENTRY] Insufficient candle data (need at least ${minCandles} candles, got ${candles?.length || 0})`);
    return { signal_type: null, reason: 'Insufficient candle data' };
  }

  const currentCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  
  // Get timestamp from either timestamp or open_time field
  const currentTimestamp = currentCandle.timestamp || currentCandle.open_time || 0;
  const previousTimestamp = previousCandle.timestamp || previousCandle.open_time || 0;
  
  if (!currentTimestamp) {
    console.log('[4H-REENTRY] No timestamp available for current candle');
    return { signal_type: null, reason: 'No timestamp available' };
  }

  // Calculate new indicators
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const adx = calculateADX(candles, 14);
  const bollinger = calculateBollingerBands(closes, 20, 2.0);
  const atr = calculateATR(candles, 14);
  
  // Current indicator values
  const currentRSI = rsi[rsi.length - 1];
  const currentADX = adx[adx.length - 1];
  const currentBollingerUpper = bollinger.upper[bollinger.upper.length - 1];
  const currentBollingerMiddle = bollinger.middle[bollinger.middle.length - 1];
  const currentBollingerLower = bollinger.lower[bollinger.lower.length - 1];
  const currentATR = atr[atr.length - 1];
  
  const bollingerPosition = calculateBollingerPosition(
    currentCandle.close, 
    currentBollingerUpper, 
    currentBollingerMiddle, 
    currentBollingerLower
  );
  
  // Calculate enhanced metrics
  const volumeConfirmed = calculateVolumeConfirmation(candles, 20);
  const momentumScore = calculateMomentumScore(candles, rsi);
  
  // Calculate 4h EMA for trend filtering
  const ema20 = calculateEMA(closes, 20);
  const currentEMA20 = ema20[ema20.length - 1];
  const isBullishTrend = currentCandle.close > currentEMA20;
  const isBearishTrend = currentCandle.close < currentEMA20;
  
  console.log('[4H-REENTRY] Enhanced indicators calculated:', {
    rsi: currentRSI.toFixed(2),
    adx: currentADX.toFixed(2),
    bollingerPosition: bollingerPosition.toFixed(3),
    volumeConfirmed,
    momentumScore: momentumScore.toFixed(2),
    ema20: currentEMA20.toFixed(2),
    trend: isBullishTrend ? 'BULLISH' : isBearishTrend ? 'BEARISH' : 'NEUTRAL'
  });

  // Get strategy config with defaults
  const sessionStart = strategy.reentry_session_start || "00:00";
  const sessionEnd = strategy.reentry_session_end || "03:59";
  const riskRewardRatio = strategy.reentry_risk_reward || 3;
  
  // Use UI parameters or fallback to improved strategy defaults (3:1 R:R)
  const slPercent = stopLossPercent || strategy.stop_loss_percent || 2.5;
  const tpPercent = takeProfitPercent || strategy.take_profit_percent || 7.5;

  console.log('[4H-REENTRY] Strategy config:', { sessionStart, sessionEnd, riskRewardRatio, slPercent, tpPercent });

  const nyTime = convertToNYTime(currentTimestamp);
  const currentDate = nyTime.toISOString().split('T')[0];
  const nyTimeStr = `${nyTime.getUTCHours().toString().padStart(2, '0')}:${nyTime.getUTCMinutes().toString().padStart(2, '0')}`;

  console.log(`[4H-REENTRY] Current time: ${nyTimeStr} NY (${currentDate})`);
  console.log(`[4H-REENTRY] Current candle: open=${currentCandle.open}, high=${currentCandle.high}, low=${currentCandle.low}, close=${currentCandle.close}`);
  console.log(`[4H-REENTRY] Previous candle: open=${previousCandle.open}, high=${previousCandle.high}, low=${previousCandle.low}, close=${previousCandle.close}`);

  // Step 1: Update or initialize 4h range during NY session
  let rangeHigh = liveState?.range_high;
  let rangeLow = liveState?.range_low;
  
  if (isInNYSession(currentTimestamp, sessionStart, sessionEnd)) {
    console.log(`[4H-REENTRY] ✅ Inside NY session (${sessionStart}-${sessionEnd})`);
    
    // Check if this is a new day (reset range)
    const prevNyTime = previousTimestamp ? convertToNYTime(previousTimestamp) : null;
    const prevDate = prevNyTime ? prevNyTime.toISOString().split('T')[0] : null;
    const isNewDay = currentDate !== prevDate;
    
    if (isNewDay || !rangeHigh || !rangeLow) {
      // Start new day range
      rangeHigh = currentCandle.high;
      rangeLow = currentCandle.low;
      console.log(`[4H-REENTRY] 🆕 New day range initialized: H_4h=${rangeHigh.toFixed(2)}, L_4h=${rangeLow.toFixed(2)}`);
    } else {
      // Update existing range
      const prevHigh = rangeHigh;
      const prevLow = rangeLow;
      rangeHigh = Math.max(rangeHigh, currentCandle.high);
      rangeLow = Math.min(rangeLow, currentCandle.low);
      
      if (rangeHigh !== prevHigh || rangeLow !== prevLow) {
        console.log(`[4H-REENTRY] 📊 Range updated: H_4h=${prevHigh.toFixed(2)}->${rangeHigh.toFixed(2)}, L_4h=${prevLow.toFixed(2)}->${rangeLow.toFixed(2)}`);
      } else {
        console.log(`[4H-REENTRY] Range unchanged: H_4h=${rangeHigh.toFixed(2)}, L_4h=${rangeLow.toFixed(2)}`);
      }
    }
  } else {
    console.log(`[4H-REENTRY] ⏸️ Outside NY session (current time: ${nyTimeStr})`);
    
    // If range is missing and we're outside the session, try to reconstruct from history
    if ((!rangeHigh || !rangeLow) && candles.length >= 4) {
      console.log(`[4H-REENTRY] 🔍 Attempting to reconstruct range from historical candles...`);
      
      // Find candles from today's NY session (00:00-03:59)
      const sessionCandles = candles.filter(c => {
        const candleTimestamp = c.timestamp || c.open_time || 0;
        if (!candleTimestamp) return false;
        
        const candleNyTime = convertToNYTime(candleTimestamp);
        const candleDate = candleNyTime.toISOString().split('T')[0];
        
        // Only use candles from today
        if (candleDate !== currentDate) return false;
        
        // Check if candle is within session hours
        return isInNYSession(candleTimestamp, sessionStart, sessionEnd);
      });
      
      if (sessionCandles.length > 0) {
        rangeHigh = Math.max(...sessionCandles.map(c => c.high));
        rangeLow = Math.min(...sessionCandles.map(c => c.low));
        console.log(`[4H-REENTRY] ✅ Reconstructed range from ${sessionCandles.length} historical candles: H_4h=${rangeHigh.toFixed(2)}, L_4h=${rangeLow.toFixed(2)}`);
      } else {
        console.log(`[4H-REENTRY] ⚠️ No session candles found for today to reconstruct range`);
      }
    }
  }

  // Need established range to generate signals
  if (!rangeHigh || !rangeLow) {
    console.log('[4H-REENTRY] ⚠️ No established range yet');
    return { 
      signal_type: null, 
      reason: 'Waiting for range to be established during NY session',
      range_high: rangeHigh,
      range_low: rangeLow
    };
  }

  console.log(`[4H-REENTRY] Current range: H_4h=${rangeHigh.toFixed(2)}, L_4h=${rangeLow.toFixed(2)}`);

  // Step 2: Check for exit signals if position is open
  if (liveState?.position_open && liveState.entry_price) {
    console.log(`[4H-REENTRY] 📍 Position open at ${liveState.entry_price.toFixed(2)}`);
    
    // Calculate SL/TP based on entry
    // Note: In live trading, we should store SL/TP when position opens
    // For now, we'll recalculate based on the entry candle logic
    // This is a simplification - ideally we'd store these values
    
    console.log('[4H-REENTRY] Exit logic should be handled by position management');
    return {
      signal_type: null,
      reason: 'Position already open - monitoring for exit',
      range_high: rangeHigh,
      range_low: rangeLow
    };
  }

  // Step 3: Check for re-entry signals (no open position)
  const C_prev = previousCandle.close;
  const C_curr = currentCandle.close;
  const H_prev = previousCandle.high;
  const L_prev = previousCandle.low;

  console.log(`[4H-REENTRY] Checking reentry conditions:`);
  console.log(`  - C_prev=${C_prev.toFixed(2)}, C_curr=${C_curr.toFixed(2)}`);
  console.log(`  - H_prev=${H_prev.toFixed(2)}, L_prev=${L_prev.toFixed(2)}`);
  console.log(`  - Range: H_4h=${rangeHigh.toFixed(2)}, L_4h=${rangeLow.toFixed(2)}`);

  // LONG setup: C_{t-1} < L_4h AND C_t >= L_4h
  if (C_prev < rangeLow && C_curr >= rangeLow) {
    // Enhanced confirmation filters with trend
    const adxConfirmed = currentADX >= 20;
    const rsiConfirmed = currentRSI > 30 && currentRSI < 70;
    const momentumConfirmed = Math.abs(momentumScore) >= 10;
    const bollingerConfirmed = bollingerPosition > 0.1 && bollingerPosition < 0.9;
    const trendConfirmed = isBullishTrend; // Only LONG if above EMA20
    
    console.log('[4H-REENTRY] 🔍 LONG reentry filters:', {
      adx: `${currentADX.toFixed(2)} (need ≥20): ${adxConfirmed ? '✅' : '❌'}`,
      rsi: `${currentRSI.toFixed(2)} (need 30-70): ${rsiConfirmed ? '✅' : '❌'}`,
      momentum: `${momentumScore.toFixed(2)} (need ≥10): ${momentumConfirmed ? '✅' : '❌'}`,
      bollinger: `${bollingerPosition.toFixed(3)} (need 0.1-0.9): ${bollingerConfirmed ? '✅' : '❌'}`,
      volume: volumeConfirmed ? '✅' : '❌',
      trend: `Close ${currentCandle.close.toFixed(2)} > EMA20 ${currentEMA20.toFixed(2)}: ${trendConfirmed ? '✅' : '❌'}`
    });
    
    if (!adxConfirmed || !rsiConfirmed || !momentumConfirmed || !bollingerConfirmed || !volumeConfirmed || !trendConfirmed) {
      console.log('[4H-REENTRY] ❌ LONG reentry filters not met');
      return { signal_type: null, reason: 'LONG reentry filters not met (trend or indicators)' };
    }
    
    const entryPrice = C_curr;
    const stopLoss = entryPrice * (1 - slPercent / 100);
    const takeProfit = entryPrice * (1 + tpPercent / 100);
    
    // Calculate session strength and confidence
    const sessionStrength = calculateSessionStrength(candles, sessionStart, sessionEnd);
    const confidence = calculateSignalConfidence(
      currentRSI, 
      currentADX, 
      momentumScore, 
      bollingerPosition, 
      volumeConfirmed, 
      sessionStrength
    );
    
    console.log(`[4H-REENTRY] 🟢 ENHANCED LONG reentry detected!`);
    console.log(`  - Previous close (${C_prev.toFixed(2)}) < L_4h (${rangeLow.toFixed(2)})`);
    console.log(`  - Current close (${C_curr.toFixed(2)}) >= L_4h (${rangeLow.toFixed(2)})`);
    console.log(`  - Entry: ${entryPrice.toFixed(2)}, SL: ${stopLoss.toFixed(2)} (-${slPercent}%), TP: ${takeProfit.toFixed(2)} (+${tpPercent}%)`);
    console.log(`  - Confidence: ${confidence.toFixed(1)}%, Session Strength: ${sessionStrength.toFixed(3)}`);
    
    return {
      signal_type: 'BUY',
      reason: `ENHANCED LONG reentry: Previous close ${C_prev.toFixed(2)} < L_4h ${rangeLow.toFixed(2)}, Current close ${C_curr.toFixed(2)} >= L_4h`,
      range_high: rangeHigh,
      range_low: rangeLow,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      adx: currentADX,
      bollinger_position: bollingerPosition,
      momentum_score: momentumScore,
      volume_confirmation: volumeConfirmed,
      session_strength: sessionStrength,
      confidence: confidence,
      time_to_expire: 240 // 4 hours for 4h reentry
    };
  }

  // Enhanced SHORT setup with additional filters
  if (C_prev > rangeHigh && C_curr <= rangeHigh) {
    // Enhanced confirmation filters with trend
    const adxConfirmed = currentADX >= 20;
    const rsiConfirmed = currentRSI > 30 && currentRSI < 70;
    const momentumConfirmed = Math.abs(momentumScore) >= 10;
    const bollingerConfirmed = bollingerPosition > 0.1 && bollingerPosition < 0.9;
    const trendConfirmed = isBearishTrend; // Only SHORT if below EMA20
    
    console.log('[4H-REENTRY] 🔍 SHORT reentry filters:', {
      adx: `${currentADX.toFixed(2)} (need ≥20): ${adxConfirmed ? '✅' : '❌'}`,
      rsi: `${currentRSI.toFixed(2)} (need 30-70): ${rsiConfirmed ? '✅' : '❌'}`,
      momentum: `${momentumScore.toFixed(2)} (need ≥10): ${momentumConfirmed ? '✅' : '❌'}`,
      bollinger: `${bollingerPosition.toFixed(3)} (need 0.1-0.9): ${bollingerConfirmed ? '✅' : '❌'}`,
      volume: volumeConfirmed ? '✅' : '❌',
      trend: `Close ${currentCandle.close.toFixed(2)} < EMA20 ${currentEMA20.toFixed(2)}: ${trendConfirmed ? '✅' : '❌'}`
    });
    
    if (!adxConfirmed || !rsiConfirmed || !momentumConfirmed || !bollingerConfirmed || !volumeConfirmed || !trendConfirmed) {
      console.log('[4H-REENTRY] ❌ SHORT reentry filters not met');
      return { signal_type: null, reason: 'SHORT reentry filters not met (trend or indicators)' };
    }
    
    const entryPrice = C_curr;
    const stopLoss = entryPrice * (1 + slPercent / 100);
    const takeProfit = entryPrice * (1 - tpPercent / 100);
    
    // Calculate session strength and confidence
    const sessionStrength = calculateSessionStrength(candles, sessionStart, sessionEnd);
    const confidence = calculateSignalConfidence(
      currentRSI, 
      currentADX, 
      momentumScore, 
      bollingerPosition, 
      volumeConfirmed, 
      sessionStrength
    );
    
    console.log(`[4H-REENTRY] 🔴 ENHANCED SHORT reentry detected!`);
    console.log(`  - Previous close (${C_prev.toFixed(2)}) > H_4h (${rangeHigh.toFixed(2)})`);
    console.log(`  - Current close (${C_curr.toFixed(2)}) <= H_4h (${rangeHigh.toFixed(2)})`);
    console.log(`  - Entry: ${entryPrice.toFixed(2)}, SL: ${stopLoss.toFixed(2)} (+${slPercent}%), TP: ${takeProfit.toFixed(2)} (-${tpPercent}%)`);
    console.log(`  - Confidence: ${confidence.toFixed(1)}%, Session Strength: ${sessionStrength.toFixed(3)}`);
    
    return {
      signal_type: 'SELL',
      reason: `ENHANCED SHORT reentry: Previous close ${C_prev.toFixed(2)} > H_4h ${rangeHigh.toFixed(2)}, Current close ${C_curr.toFixed(2)} <= H_4h`,
      range_high: rangeHigh,
      range_low: rangeLow,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      adx: currentADX,
      bollinger_position: bollingerPosition,
      momentum_score: momentumScore,
      volume_confirmation: volumeConfirmed,
      session_strength: sessionStrength,
      confidence: confidence,
      time_to_expire: 240 // 4 hours for 4h reentry
    };
  }

  // No signal conditions met
  console.log('[4H-REENTRY] ⏸️ No reentry conditions met');
  console.log(`  - LONG would need: C_prev < ${rangeLow.toFixed(2)} AND C_curr >= ${rangeLow.toFixed(2)}`);
  console.log(`  - SHORT would need: C_prev > ${rangeHigh.toFixed(2)} AND C_curr <= ${rangeHigh.toFixed(2)}`);
  console.log(`  - Current: C_prev=${C_prev.toFixed(2)}, C_curr=${C_curr.toFixed(2)}`);
  
  return {
    signal_type: null,
    reason: `No reentry conditions met. C_prev=${C_prev.toFixed(2)}, C_curr=${C_curr.toFixed(2)}, Range=[${rangeLow.toFixed(2)}, ${rangeHigh.toFixed(2)}]`,
    range_high: rangeHigh,
    range_low: rangeLow
  };
}
