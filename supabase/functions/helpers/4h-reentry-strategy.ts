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

export function evaluate4hReentry(
  candles: Candle[],
  liveState: LiveState | null,
  strategy: any,
  stopLossPercent?: number,
  takeProfitPercent?: number
): ReentrySignal {
  console.log('[4H-REENTRY] Starting evaluation...');
  
  if (!candles || candles.length < 2) {
    console.log('[4H-REENTRY] Insufficient candle data (need at least 2 candles)');
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

  // Get strategy config with defaults
  const sessionStart = strategy.reentry_session_start || "00:00";
  const sessionEnd = strategy.reentry_session_end || "03:59";
  const riskRewardRatio = strategy.reentry_risk_reward || 2;
  
  // Use UI parameters or fallback to strategy defaults
  const slPercent = stopLossPercent || strategy.stop_loss_percent || 1.0;
  const tpPercent = takeProfitPercent || strategy.take_profit_percent || 2.0;

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
    const entryPrice = C_curr;
    // Use UI parameters for SL/TP
    const stopLoss = entryPrice * (1 - slPercent / 100);  // Use UI SL%
    const takeProfit = entryPrice * (1 + tpPercent / 100);  // Use UI TP%
    
    console.log(`[4H-REENTRY] 🟢 LONG reentry detected!`);
    console.log(`  - Previous close (${C_prev.toFixed(2)}) < L_4h (${rangeLow.toFixed(2)})`);
    console.log(`  - Current close (${C_curr.toFixed(2)}) >= L_4h (${rangeLow.toFixed(2)})`);
    console.log(`  - Entry: ${entryPrice.toFixed(2)}, SL: ${stopLoss.toFixed(2)} (-${slPercent}%), TP: ${takeProfit.toFixed(2)} (+${tpPercent}%)`);
    
    return {
      signal_type: 'BUY',
      reason: `LONG reentry: Previous close ${C_prev.toFixed(2)} < L_4h ${rangeLow.toFixed(2)}, Current close ${C_curr.toFixed(2)} >= L_4h`,
      range_high: rangeHigh,
      range_low: rangeLow,
      stop_loss: stopLoss,
      take_profit: takeProfit
    };
  }

  // SHORT setup: C_{t-1} > H_4h AND C_t <= H_4h
  if (C_prev > rangeHigh && C_curr <= rangeHigh) {
    const entryPrice = C_curr;
    // Use UI parameters for SL/TP
    const stopLoss = entryPrice * (1 + slPercent / 100);  // Use UI SL% (higher price for SHORT)
    const takeProfit = entryPrice * (1 - tpPercent / 100);  // Use UI TP% (lower price for SHORT)
    
    console.log(`[4H-REENTRY] 🔴 SHORT reentry detected!`);
    console.log(`  - Previous close (${C_prev.toFixed(2)}) > H_4h (${rangeHigh.toFixed(2)})`);
    console.log(`  - Current close (${C_curr.toFixed(2)}) <= H_4h (${rangeHigh.toFixed(2)})`);
    console.log(`  - Entry: ${entryPrice.toFixed(2)}, SL: ${stopLoss.toFixed(2)} (+${slPercent}%), TP: ${takeProfit.toFixed(2)} (-${tpPercent}%)`);
    
    return {
      signal_type: 'SELL',
      reason: `SHORT reentry: Previous close ${C_prev.toFixed(2)} > H_4h ${rangeHigh.toFixed(2)}, Current close ${C_curr.toFixed(2)} <= H_4h`,
      range_high: rangeHigh,
      range_low: rangeLow,
      stop_loss: stopLoss,
      take_profit: takeProfit
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
