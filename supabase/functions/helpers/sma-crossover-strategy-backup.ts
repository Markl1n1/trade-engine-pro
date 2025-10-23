// SMA 20/200 Crossover with RSI Filter Strategy
// BACKUP VERSION - Created before optimization

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface SMACrossoverConfig {
  sma_fast_period: number;      // Default: 20
  sma_slow_period: number;      // Default: 200
  rsi_period: number;           // Default: 14
  rsi_overbought: number;       // Default: 70
  rsi_oversold: number;         // Default: 30
  volume_multiplier: number;    // Default: 1.2
  atr_sl_multiplier: number;    // Default: 2.0
  atr_tp_multiplier: number;   // Default: 3.0
}

interface SMACrossoverSignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  stop_loss?: number;
  take_profit?: number;
  sma_fast?: number;
  sma_slow?: number;
  rsi?: number;
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

// Main strategy evaluation function
export function evaluateSMACrossoverStrategy(
  candles: Candle[],
  config: SMACrossoverConfig,
  positionOpen: boolean
): SMACrossoverSignal {
  console.log('[SMA-CROSSOVER] 🔍 Starting evaluation...');
  
  // Need minimum candles for all indicators
  if (candles.length < Math.max(config.sma_slow_period, config.rsi_period) + 10) {
    console.log(`[SMA-CROSSOVER] ❌ Insufficient data: ${candles.length} candles (need ${Math.max(config.sma_slow_period, config.rsi_period) + 10})`);
    return { signal_type: null, reason: 'Insufficient candle data' };
  }
  
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  // Calculate indicators
  const smaFast = calculateSMA(closes, config.sma_fast_period);
  const smaSlow = calculateSMA(closes, config.sma_slow_period);
  const rsi = calculateRSI(closes, config.rsi_period);
  const atr = calculateATR(candles, 14);
  
  // Get current values
  const currentSMAFast = smaFast[smaFast.length - 1];
  const currentSMASlow = smaSlow[smaSlow.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  const currentATR = atr[atr.length - 1];
  
  // Get previous values for crossover detection
  const prevSMAFast = smaFast[smaFast.length - 2];
  const prevSMASlow = smaSlow[smaSlow.length - 2];
  
  console.log(`[SMA-CROSSOVER] 📊 Current State:`, {
    price: currentPrice.toFixed(2),
    smaFast: currentSMAFast.toFixed(2),
    smaSlow: currentSMASlow.toFixed(2),
    rsi: currentRSI.toFixed(2),
    atr: currentATR.toFixed(2),
    positionOpen
  });
  
  // Check volume confirmation
  const avgVolume = calculateVolumeAverage(candles, 20);
  const currentVolume = candles[candles.length - 1].volume;
  const volumeConfirmed = currentVolume >= avgVolume * config.volume_multiplier;
  
  console.log(`[SMA-CROSSOVER] 📈 Volume Check:`, {
    currentVolume: currentVolume.toFixed(0),
    avgVolume: avgVolume.toFixed(0),
    ratio: `${(currentVolume / avgVolume).toFixed(2)}x (need ${config.volume_multiplier}x)`,
    confirmed: volumeConfirmed
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
  
  // Entry logic for new positions
  if (!positionOpen) {
    // Golden Cross: SMA Fast crosses above SMA Slow
    if (prevSMAFast <= prevSMASlow && currentSMAFast > currentSMASlow) {
      // RSI filter: Don't buy if RSI is overbought
      if (currentRSI > config.rsi_overbought) {
        console.log(`[SMA-CROSSOVER] ❌ Golden Cross detected but RSI overbought: ${currentRSI.toFixed(2)} > ${config.rsi_overbought}`);
        return {
          signal_type: null,
          reason: `Golden Cross but RSI overbought (${currentRSI.toFixed(2)} > ${config.rsi_overbought})`,
          sma_fast: currentSMAFast,
          sma_slow: currentSMASlow,
          rsi: currentRSI
        };
      }
      
      // Volume confirmation
      if (!volumeConfirmed) {
        console.log(`[SMA-CROSSOVER] ❌ Golden Cross detected but volume insufficient: ${(currentVolume / avgVolume).toFixed(2)}x < ${config.volume_multiplier}x`);
        return {
          signal_type: null,
          reason: `Golden Cross but volume insufficient (${(currentVolume / avgVolume).toFixed(2)}x < ${config.volume_multiplier}x)`,
          sma_fast: currentSMAFast,
          sma_slow: currentSMASlow,
          rsi: currentRSI
        };
      }
      
      // All conditions met for LONG entry
      const stopLoss = currentPrice - (config.atr_sl_multiplier * currentATR);
      const takeProfit = currentPrice + (config.atr_tp_multiplier * currentATR);
      
      console.log('[SMA-CROSSOVER] 🚀 GOLDEN CROSS BUY SIGNAL', {
        entry: currentPrice.toFixed(2),
        stopLoss: stopLoss.toFixed(2),
        takeProfit: takeProfit.toFixed(2),
        rsi: currentRSI.toFixed(2),
        volumeRatio: (currentVolume / avgVolume).toFixed(2)
      });
      
      return {
        signal_type: 'BUY',
        reason: `Golden Cross: SMA${config.sma_fast_period} > SMA${config.sma_slow_period} with RSI ${currentRSI.toFixed(2)} and volume ${(currentVolume / avgVolume).toFixed(2)}x`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        sma_fast: currentSMAFast,
        sma_slow: currentSMASlow,
        rsi: currentRSI
      };
    }
    
    // Death Cross: SMA Fast crosses below SMA Slow
    if (prevSMAFast >= prevSMASlow && currentSMAFast < currentSMASlow) {
      // RSI filter: Don't sell if RSI is oversold
      if (currentRSI < config.rsi_oversold) {
        console.log(`[SMA-CROSSOVER] ❌ Death Cross detected but RSI oversold: ${currentRSI.toFixed(2)} < ${config.rsi_oversold}`);
        return {
          signal_type: null,
          reason: `Death Cross but RSI oversold (${currentRSI.toFixed(2)} < ${config.rsi_oversold})`,
          sma_fast: currentSMAFast,
          sma_slow: currentSMASlow,
          rsi: currentRSI
        };
      }
      
      // Volume confirmation
      if (!volumeConfirmed) {
        console.log(`[SMA-CROSSOVER] ❌ Death Cross detected but volume insufficient: ${(currentVolume / avgVolume).toFixed(2)}x < ${config.volume_multiplier}x`);
        return {
          signal_type: null,
          reason: `Death Cross but volume insufficient (${(currentVolume / avgVolume).toFixed(2)}x < ${config.volume_multiplier}x)`,
          sma_fast: currentSMAFast,
          sma_slow: currentSMASlow,
          rsi: currentRSI
        };
      }
      
      // All conditions met for SHORT entry
      const stopLoss = currentPrice + (config.atr_sl_multiplier * currentATR);
      const takeProfit = currentPrice - (config.atr_tp_multiplier * currentATR);
      
      console.log('[SMA-CROSSOVER] 🚀 DEATH CROSS SELL SIGNAL', {
        entry: currentPrice.toFixed(2),
        stopLoss: stopLoss.toFixed(2),
        takeProfit: takeProfit.toFixed(2),
        rsi: currentRSI.toFixed(2),
        volumeRatio: (currentVolume / avgVolume).toFixed(2)
      });
      
      return {
        signal_type: 'SELL',
        reason: `Death Cross: SMA${config.sma_fast_period} < SMA${config.sma_slow_period} with RSI ${currentRSI.toFixed(2)} and volume ${(currentVolume / avgVolume).toFixed(2)}x`,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        sma_fast: currentSMAFast,
        sma_slow: currentSMASlow,
        rsi: currentRSI
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

// Default configuration
export const defaultSMACrossoverConfig: SMACrossoverConfig = {
  sma_fast_period: 20,
  sma_slow_period: 200,
  rsi_period: 14,
  rsi_overbought: 70,
  rsi_oversold: 30,
  volume_multiplier: 1.2,
  atr_sl_multiplier: 2.0,
  atr_tp_multiplier: 3.0
};
