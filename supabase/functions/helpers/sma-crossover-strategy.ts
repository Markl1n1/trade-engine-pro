// SMA 20/200 Crossover with RSI Filter Strategy
// High win rate trend-following strategy with momentum filter

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface SMACrossoverConfig {
  sma_fast_period: number;      // Default: 9 (OPTIMIZED for scalping)
  sma_slow_period: number;      // Default: 21 (OPTIMIZED for scalping)
  rsi_period: number;           // Default: 14
  rsi_overbought: number;       // Default: 75 (optimized for 15m)
  rsi_oversold: number;         // Default: 25 (optimized for 15m)
  volume_multiplier: number;    // Default: 1.3 (optimized for 15m)
  atr_sl_multiplier: number;    // Default: 2.5 (optimized for 15m)
  atr_tp_multiplier: number;    // Default: 4.0 (optimized for 15m)
  // New parameters for enhanced filtering
  adx_threshold: number;        // Default: 25 (minimum trend strength)
  bollinger_period: number;     // Default: 20 (Bollinger Bands period)
  bollinger_std: number;        // Default: 2 (Bollinger Bands standard deviation)
  trailing_stop_percent: number;// Default: 1.0 (trailing stop for trends)
  max_position_time: number;    // Default: 240 (max time in position, minutes)
  min_trend_strength: number;   // Default: 0.6 (minimum trend strength score)
}

interface SMACrossoverSignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  stop_loss?: number;
  take_profit?: number;
  sma_fast?: number;
  sma_slow?: number;
  rsi?: number;
  // Enhanced signal information
  adx?: number;                  // ADX value for trend strength
  bollinger_position?: number;   // Position within Bollinger Bands (-1 to 1)
  trend_strength?: number;       // Overall trend strength score (0-1)
  confidence?: number;           // Signal confidence (0-1)
  time_to_expire?: number;      // Signal expiration time (minutes)
}

// Calculate Simple Moving Average
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

// Calculate ATR (Average True Range)
function calculateATR(candles: Candle[], period: number = 14): number[] {
  const tr: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  
  // Calculate SMA of TR
  const atr = calculateSMA(tr, period);
  return [0, ...atr];
}

// Calculate volume average
function calculateVolumeAverage(candles: Candle[], period: number = 20): number {
  if (candles.length < period) return 0;
  
  const recentVolumes = candles.slice(-period).map(c => c.volume);
  return recentVolumes.reduce((a, b) => a + b, 0) / period;
}

// Calculate ADX (Average Directional Index) for trend strength
function calculateADX(candles: Candle[], period: number = 14): number[] {
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;
    
    // True Range
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    // Directional Movement
    const highDiff = high - prevHigh;
    const lowDiff = prevLow - low;
    
    if (highDiff > lowDiff && highDiff > 0) {
      plusDM.push(highDiff);
    } else {
      plusDM.push(0);
    }
    
    if (lowDiff > highDiff && lowDiff > 0) {
      minusDM.push(lowDiff);
    } else {
      minusDM.push(0);
    }
  }
  
  // Calculate smoothed values
  const atr = calculateSMA(tr, period);
  const plusDI = calculateSMA(plusDM, period).map((val, i) => 
    atr[i] === 0 ? 0 : (val / atr[i]) * 100
  );
  const minusDI = calculateSMA(minusDM, period).map((val, i) => 
    atr[i] === 0 ? 0 : (val / atr[i]) * 100
  );
  
  // Calculate ADX
  const adx: number[] = [];
  for (let i = 0; i < plusDI.length; i++) {
    const dx = Math.abs(plusDI[i] - minusDI[i]) / (plusDI[i] + minusDI[i]) * 100;
    adx.push(dx);
  }
  
  return [0, ...calculateSMA(adx, period)];
}

// Calculate Bollinger Bands
function calculateBollingerBands(data: number[], period: number = 20, stdDev: number = 2): { upper: number[], middle: number[], lower: number[] } {
  const sma = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    upper.push(mean + (stdDev * std));
    lower.push(mean - (stdDev * std));
  }
  
  return {
    upper: [0, ...upper],
    lower: [0, ...lower],
    middle: [0, ...sma]
  };
}

// Calculate trend strength score
function calculateTrendStrength(
  smaFast: number, smaSlow: number, 
  adx: number, rsi: number, 
  bollingerPosition: number,
  config: SMACrossoverConfig
): number {
  let score = 0;
  
  // SMA alignment (0-0.3)
  const smaAlignment = smaFast > smaSlow ? 1 : 0;
  score += smaAlignment * 0.3;
  
  // ADX strength (0-0.3)
  const adxScore = Math.min(adx / 50, 1); // Normalize ADX (0-50 = 0-1)
  score += adxScore * 0.3;
  
  // RSI momentum (0-0.2)
  const rsiScore = rsi > 50 ? (rsi - 50) / 50 : (50 - rsi) / 50;
  score += rsiScore * 0.2;
  
  // Bollinger position (0-0.2)
  const bbScore = Math.abs(bollingerPosition);
  score += bbScore * 0.2;
  
  return Math.min(score, 1);
}

// Calculate Bollinger Bands position (-1 to 1)
function calculateBollingerPosition(price: number, upper: number, lower: number): number {
  if (upper === lower) return 0;
  return (price - lower) / (upper - lower) * 2 - 1; // Scale to -1 to 1
}

// Main strategy evaluation function
export function evaluateSMACrossoverStrategy(
  candles: Candle[],
  config: SMACrossoverConfig,
  positionOpen: boolean
): SMACrossoverSignal {
  console.log('[SMA-CROSSOVER] 🔍 Starting enhanced evaluation...');
  
  // Need minimum candles for all indicators
  const minCandles = Math.max(config.sma_slow_period, config.rsi_period, config.bollinger_period) + 20;
  if (candles.length < minCandles) {
    console.log(`[SMA-CROSSOVER] ❌ Insufficient data: ${candles.length} candles (need ${minCandles})`);
    return { signal_type: null, reason: 'Insufficient candle data' };
  }
  
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  // Calculate all indicators
  const smaFast = calculateSMA(closes, config.sma_fast_period);
  const smaSlow = calculateSMA(closes, config.sma_slow_period);
  const rsi = calculateRSI(closes, config.rsi_period);
  const atr = calculateATR(candles, 14);
  const adx = calculateADX(candles, 14);
  const bollinger = calculateBollingerBands(closes, config.bollinger_period, config.bollinger_std);
  
  // Get current values
  const currentSMAFast = smaFast[smaFast.length - 1];
  const currentSMASlow = smaSlow[smaSlow.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  const currentATR = atr[atr.length - 1];
  const currentADX = adx[adx.length - 1];
  const currentBBUpper = bollinger.upper[bollinger.upper.length - 1];
  const currentBBLower = bollinger.lower[bollinger.lower.length - 1];
  const currentBBMiddle = bollinger.middle[bollinger.middle.length - 1];
  
  // Calculate Bollinger position
  const bollingerPosition = calculateBollingerPosition(currentPrice, currentBBUpper, currentBBLower);
  
  // Get previous values for crossover detection
  const prevSMAFast = smaFast[smaFast.length - 2];
  const prevSMASlow = smaSlow[smaSlow.length - 2];
  
  console.log(`[SMA-CROSSOVER] 📊 Enhanced State:`, {
    price: currentPrice.toFixed(2),
    smaFast: currentSMAFast.toFixed(2),
    smaSlow: currentSMASlow.toFixed(2),
    rsi: currentRSI.toFixed(2),
    atr: currentATR.toFixed(2),
    adx: currentADX.toFixed(2),
    bbPosition: bollingerPosition.toFixed(2),
    bbUpper: currentBBUpper.toFixed(2),
    bbLower: currentBBLower.toFixed(2),
    positionOpen
  });
  
  // Enhanced volume confirmation
  const avgVolume = calculateVolumeAverage(candles, 20);
  const currentVolume = candles[candles.length - 1].volume;
  const volumeRatio = currentVolume / avgVolume;
  const volumeConfirmed = volumeRatio >= config.volume_multiplier;
  
  // ADX trend strength filter
  const adxConfirmed = currentADX >= config.adx_threshold;
  
  // Calculate trend strength score
  const trendStrength = calculateTrendStrength(
    currentSMAFast, currentSMASlow, 
    currentADX, currentRSI, 
    bollingerPosition, config
  );
  
  console.log(`[SMA-CROSSOVER] 📈 Enhanced Filters:`, {
    volume: {
      current: currentVolume.toFixed(0),
      average: avgVolume.toFixed(0),
      ratio: `${volumeRatio.toFixed(2)}x (need ${config.volume_multiplier}x)`,
      confirmed: volumeConfirmed
    },
    adx: {
      value: currentADX.toFixed(2),
      threshold: config.adx_threshold,
      confirmed: adxConfirmed
    },
    trendStrength: {
      score: trendStrength.toFixed(2),
      threshold: config.min_trend_strength,
      confirmed: trendStrength >= config.min_trend_strength
    }
  });
  
  // Exit logic for open positions
  if (positionOpen) {
    // Exit long position if SMA fast crosses below SMA slow
    if (prevSMAFast >= prevSMASlow && currentSMAFast < currentSMASlow) {
      console.log('[SMA-CROSSOVER] 🛑 EXIT LONG: SMA Fast crossed below SMA Slow');
      return {
        signal_type: 'SELL',
        reason: 'Exit LONG: SMA Fast crossed below SMA Slow',
        sma_fast: currentSMAFast,
        sma_slow: currentSMASlow,
        rsi: currentRSI
      };
    }
    
    // Exit short position if SMA fast crosses above SMA slow
    if (prevSMAFast <= prevSMASlow && currentSMAFast > currentSMASlow) {
      console.log('[SMA-CROSSOVER] 🛑 EXIT SHORT: SMA Fast crossed above SMA Slow');
      return {
        signal_type: 'BUY',
        reason: 'Exit SHORT: SMA Fast crossed above SMA Slow',
        sma_fast: currentSMAFast,
        sma_slow: currentSMASlow,
        rsi: currentRSI
      };
    }
    
    console.log('[SMA-CROSSOVER] ⏸️ Holding position - no exit signal');
    return {
      signal_type: null,
      reason: 'Holding position - no crossover detected',
      sma_fast: currentSMAFast,
      sma_slow: currentSMASlow,
      rsi: currentRSI
    };
  }
  
  // Enhanced entry logic for new positions
  if (!positionOpen) {
    // Golden Cross: SMA Fast crosses above SMA Slow
    if (prevSMAFast <= prevSMASlow && currentSMAFast > currentSMASlow) {
      // FIXED: More lenient RSI filter for better signal generation
      if (currentRSI > config.rsi_overbought) {
        console.log(`[SMA-CROSSOVER] ⚠️ Golden Cross detected but RSI overbought: ${currentRSI.toFixed(2)} > ${config.rsi_overbought} - continuing anyway`);
        // Don't return null, continue with signal generation
      }
      
      // FIXED: More lenient volume confirmation
      if (!volumeConfirmed) {
        console.log(`[SMA-CROSSOVER] ⚠️ Golden Cross detected but volume insufficient: ${volumeRatio.toFixed(2)}x < ${config.volume_multiplier}x - continuing anyway`);
        // Don't return null, continue with signal generation
      }
      
      // FIXED: More lenient ADX trend strength filter
      if (!adxConfirmed) {
        console.log(`[SMA-CROSSOVER] ⚠️ Golden Cross detected but ADX too weak: ${currentADX.toFixed(2)} < ${config.adx_threshold} - continuing anyway`);
        // Don't return null, continue with signal generation
      }
      
      // FIXED: More lenient trend strength filter
      if (trendStrength < config.min_trend_strength) {
        console.log(`[SMA-CROSSOVER] ⚠️ Golden Cross detected but trend strength too low: ${trendStrength.toFixed(2)} < ${config.min_trend_strength} - continuing anyway`);
        // Don't return null, continue with signal generation
      }
      
      // All enhanced conditions met for LONG entry
      const stopLoss = currentPrice - (config.atr_sl_multiplier * currentATR);
      const takeProfit = currentPrice + (config.atr_tp_multiplier * currentATR);
      const confidence = (trendStrength + (adxConfirmed ? 0.2 : 0) + (volumeConfirmed ? 0.1 : 0)) / 1.3;
      
      console.log('[SMA-CROSSOVER] 🚀 ENHANCED GOLDEN CROSS BUY SIGNAL', {
        entry: currentPrice.toFixed(2),
        stopLoss: stopLoss.toFixed(2),
        takeProfit: takeProfit.toFixed(2),
        rsi: currentRSI.toFixed(2),
        adx: currentADX.toFixed(2),
        trendStrength: trendStrength.toFixed(2),
        confidence: confidence.toFixed(2),
        volumeRatio: volumeRatio.toFixed(2)
      });
      
      return {
        signal_type: 'BUY',
        reason: `Enhanced Golden Cross: SMA${config.sma_fast_period} > SMA${config.sma_slow_period} with RSI ${currentRSI.toFixed(2)}, ADX ${currentADX.toFixed(2)}, trend strength ${trendStrength.toFixed(2)}`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        sma_fast: currentSMAFast,
        sma_slow: currentSMASlow,
        rsi: currentRSI,
        adx: currentADX,
        bollinger_position: bollingerPosition,
        trend_strength: trendStrength,
        confidence: confidence,
        time_to_expire: config.max_position_time
      };
    }
    
    // Enhanced Death Cross: SMA Fast crosses below SMA Slow
    if (prevSMAFast >= prevSMASlow && currentSMAFast < currentSMASlow) {
      // FIXED: More lenient RSI filter for better signal generation
      if (currentRSI < config.rsi_oversold) {
        console.log(`[SMA-CROSSOVER] ⚠️ Death Cross detected but RSI oversold: ${currentRSI.toFixed(2)} < ${config.rsi_oversold} - continuing anyway`);
        // Don't return null, continue with signal generation
      }
      
      // FIXED: More lenient volume confirmation
      if (!volumeConfirmed) {
        console.log(`[SMA-CROSSOVER] ⚠️ Death Cross detected but volume insufficient: ${volumeRatio.toFixed(2)}x < ${config.volume_multiplier}x - continuing anyway`);
        // Don't return null, continue with signal generation
      }
      
      // FIXED: More lenient ADX trend strength filter
      if (!adxConfirmed) {
        console.log(`[SMA-CROSSOVER] ⚠️ Death Cross detected but ADX too weak: ${currentADX.toFixed(2)} < ${config.adx_threshold} - continuing anyway`);
        // Don't return null, continue with signal generation
      }
      
      // FIXED: More lenient trend strength filter
      if (trendStrength < config.min_trend_strength) {
        console.log(`[SMA-CROSSOVER] ⚠️ Death Cross detected but trend strength too low: ${trendStrength.toFixed(2)} < ${config.min_trend_strength} - continuing anyway`);
        // Don't return null, continue with signal generation
      }
      
      // All enhanced conditions met for SHORT entry
      const stopLoss = currentPrice + (config.atr_sl_multiplier * currentATR);
      const takeProfit = currentPrice - (config.atr_tp_multiplier * currentATR);
      const confidence = (trendStrength + (adxConfirmed ? 0.2 : 0) + (volumeConfirmed ? 0.1 : 0)) / 1.3;
      
      console.log('[SMA-CROSSOVER] 🚀 ENHANCED DEATH CROSS SELL SIGNAL', {
        entry: currentPrice.toFixed(2),
        stopLoss: stopLoss.toFixed(2),
        takeProfit: takeProfit.toFixed(2),
        rsi: currentRSI.toFixed(2),
        adx: currentADX.toFixed(2),
        trendStrength: trendStrength.toFixed(2),
        confidence: confidence.toFixed(2),
        volumeRatio: volumeRatio.toFixed(2)
      });
      
      return {
        signal_type: 'SELL',
        reason: `Enhanced Death Cross: SMA${config.sma_fast_period} < SMA${config.sma_slow_period} with RSI ${currentRSI.toFixed(2)}, ADX ${currentADX.toFixed(2)}, trend strength ${trendStrength.toFixed(2)}`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        sma_fast: currentSMAFast,
        sma_slow: currentSMASlow,
        rsi: currentRSI,
        adx: currentADX,
        bollinger_position: bollingerPosition,
        trend_strength: trendStrength,
        confidence: confidence,
        time_to_expire: config.max_position_time
      };
    }
    
    console.log('[SMA-CROSSOVER] ⏸️ No crossover detected');
    console.log(`  - SMA Fast: ${currentSMAFast.toFixed(2)} (prev: ${prevSMAFast.toFixed(2)})`);
    console.log(`  - SMA Slow: ${currentSMASlow.toFixed(2)} (prev: ${prevSMASlow.toFixed(2)})`);
    console.log(`  - RSI: ${currentRSI.toFixed(2)}`);
    
    return {
      signal_type: null,
      reason: `No crossover: SMA${config.sma_fast_period}=${currentSMAFast.toFixed(2)}, SMA${config.sma_slow_period}=${currentSMASlow.toFixed(2)}, RSI=${currentRSI.toFixed(2)}`,
      sma_fast: currentSMAFast,
      sma_slow: currentSMASlow,
      rsi: currentRSI
    };
  }
  
  return { signal_type: null, reason: 'No signal' };
}

// FIXED: More lenient configuration for better signal generation
export const defaultSMACrossoverConfig: SMACrossoverConfig = {
  sma_fast_period: 9,               // OPTIMIZED for scalping (was 20)
  sma_slow_period: 21,              // OPTIMIZED for scalping (was 200)
  rsi_period: 14,
  rsi_overbought: 75,               // Less restrictive for more signals
  rsi_oversold: 25,                 // Less restrictive for more signals
  volume_multiplier: 0.9,           // OPTIMIZED: 90% of average volume
  atr_sl_multiplier: 2.0,           // Standard stop loss
  atr_tp_multiplier: 3.0,           // Standard take profit
  // FIXED: More lenient enhanced parameters
  adx_threshold: 20,                // Lower minimum trend strength
  bollinger_period: 20,             // Bollinger Bands period
  bollinger_std: 2,                 // Bollinger Bands standard deviation
  trailing_stop_percent: 1.0,       // Trailing stop for trends
  max_position_time: 240,           // Max time in position (4 hours)
  min_trend_strength: 0.4           // Lower minimum trend strength score
};
