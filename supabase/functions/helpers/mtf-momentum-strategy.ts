// Multi-Timeframe Momentum Strategy (1m/5m/15m) for scalping

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface MTFMomentumConfig {
  rsi_period?: number;           // default 14
  rsi_entry_threshold?: number;  // e.g., > 50 for longs, < 50 for shorts (optimized for ETH)
  macd_fast?: number;            // default 8 (optimized for scalping)
  macd_slow?: number;            // default 21 (optimized for scalping)
  macd_signal?: number;          // default 5 (optimized for scalping)
  supertrend_atr_period?: number;// default 10
  supertrend_multiplier?: number;// default 3
  volume_multiplier?: number;    // default 1.1 (optimized for ETH)
  // New parameters for enhanced scalping
  atr_sl_multiplier?: number;   // default 1.5 (ATR-based stop loss)
  atr_tp_multiplier?: number;    // default 2.0 (ATR-based take profit)
  trailing_stop_percent?: number;// default 0.5 (fast trailing stop)
  max_position_time?: number;    // default 30 (max time in position, minutes)
  min_profit_percent?: number;   // default 0.2 (min profit to activate trailing)
}

export interface MTFMomentumSignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  // Enhanced signal information for scalping
  stop_loss?: number;
  take_profit?: number;
  confidence?: number;        // Signal confidence (0-1)
  time_to_expire?: number;    // Signal expiration time (minutes)
}

function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) { out.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function rsi(values: number[], period: number = 14): number[] {
  const out: number[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      out.push(NaN);
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
      }
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / (avgLoss === 0 ? 1e-8 : avgLoss);
    const rsiVal = 100 - 100 / (1 + rs);
    out.push(rsiVal);
  }
  return [NaN, ...out];
}

function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const ema = (period: number) => {
    const k = 2 / (period + 1);
    const out: number[] = [];
    let prev: number | undefined;
    for (let i = 0; i < values.length; i++) {
      const val = prev === undefined ? values[i] : values[i] * k + prev * (1 - k);
      out.push(val);
      prev = val;
    }
    return out;
  };
  const emaFast = ema(fast);
  const emaSlow = ema(slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = (() => {
    const k = 2 / (signal + 1);
    const out: number[] = [];
    let prev: number | undefined;
    for (let i = 0; i < macdLine.length; i++) {
      const val = prev === undefined ? macdLine[i] : macdLine[i] * k + prev * (1 - k);
      out.push(val);
      prev = val;
    }
    return out;
  })();
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function volumeSMA(candles: Candle[], period = 20): number {
  if (candles.length < period) return NaN;
  const vols = candles.slice(-period).map(c => c.volume);
  return vols.reduce((a, b) => a + b, 0) / period;
}

// Calculate ATR for risk management
function calculateATR(candles: Candle[], period = 14): number[] {
  const tr: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  
  // Calculate ATR using EMA
  const atr: number[] = [];
  if (tr.length < period) return atr;
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  atr.push(sum / period);
  
  for (let i = period; i < tr.length; i++) {
    const ema = (atr[atr.length - 1] * (period - 1) + tr[i]) / period;
    atr.push(ema);
  }
  
  return [0, ...atr]; // Pad with 0 for first candle
}

// Calculate signal confidence based on confluence
function calculateSignalConfidence(
  rsi1: number, rsi5: number, rsi15: number,
  macd1: number, macd5: number, macd15: number,
  volumeRatio: number,
  config: MTFMomentumConfig
): number {
  let confidence = 0;
  
  // RSI confluence (0-0.4)
  const rsiScore = (
    (rsi1 > config.rsi_entry_threshold! ? 1 : 0) +
    (rsi5 > 50 ? 0.5 : 0) +
    (rsi15 > 50 ? 0.5 : 0)
  ) / 2;
  confidence += rsiScore * 0.4;
  
  // MACD confluence (0-0.4)
  const macdScore = (
    (macd1 > 0 ? 1 : 0) +
    (macd5 > 0 ? 0.5 : 0) +
    (macd15 > 0 ? 0.5 : 0)
  ) / 2;
  confidence += macdScore * 0.4;
  
  // Volume confirmation (0-0.2)
  const volumeScore = Math.min(volumeRatio / config.volume_multiplier!, 1);
  confidence += volumeScore * 0.2;
  
  return Math.min(confidence, 1);
}

export function evaluateMTFMomentum(
  candles1m: Candle[],
  candles5m: Candle[],
  candles15m: Candle[],
  config: MTFMomentumConfig,
  positionOpen: boolean
): MTFMomentumSignal {
  // Optimized configuration for ETH scalping
  const cfg = {
    rsi_period: config.rsi_period ?? 14,
    rsi_entry_threshold: config.rsi_entry_threshold ?? 45,  // Reduced from 50 for more signals
    macd_fast: config.macd_fast ?? 8,                       // Faster for scalping
    macd_slow: config.macd_slow ?? 21,                      // Faster for scalping
    macd_signal: config.macd_signal ?? 5,                    // Faster for scalping
    supertrend_atr_period: config.supertrend_atr_period ?? 10,
    supertrend_multiplier: config.supertrend_multiplier ?? 3,
    volume_multiplier: config.volume_multiplier ?? 0.9,     // OPTIMIZED: 90% of average volume
    atr_sl_multiplier: config.atr_sl_multiplier ?? 1.5,     // New: ATR-based stop loss
    atr_tp_multiplier: config.atr_tp_multiplier ?? 2.0,      // New: ATR-based take profit
    trailing_stop_percent: config.trailing_stop_percent ?? 0.5, // New: Fast trailing stop
    max_position_time: config.max_position_time ?? 30,       // New: Max time in position
    min_profit_percent: config.min_profit_percent ?? 0.2    // New: Min profit for trailing
  };

  if (candles1m.length < 100 || candles5m.length < 100 || candles15m.length < 100) {
    return { signal_type: null, reason: 'Insufficient candles for MTF evaluation' };
  }

  const c1 = candles1m.map(c => c.close);
  const c5 = candles5m.map(c => c.close);
  const c15 = candles15m.map(c => c.close);

  const rsi1 = rsi(c1, cfg.rsi_period);
  const rsi5 = rsi(c5, cfg.rsi_period);
  const rsi15 = rsi(c15, cfg.rsi_period);

  const macd1 = macd(c1, cfg.macd_fast, cfg.macd_slow, cfg.macd_signal);
  const macd5 = macd(c5, cfg.macd_fast, cfg.macd_slow, cfg.macd_signal);
  const macd15 = macd(c15, cfg.macd_fast, cfg.macd_slow, cfg.macd_signal);

  // Calculate ATR for risk management
  const atr1m = calculateATR(candles1m, 14);
  const currentATR = atr1m[atr1m.length - 1] || 0;

  // Enhanced volume analysis
  const currentVolume = candles1m[candles1m.length - 1].volume;
  const avgVolume = volumeSMA(candles1m, 20);
  const volumeRatio = currentVolume / avgVolume;
  const volOk = volumeRatio >= cfg.volume_multiplier;

  const last = (arr: number[]) => arr[arr.length - 1];
  const currentRSI1 = last(rsi1);
  const currentRSI5 = last(rsi5);
  const currentRSI15 = last(rsi15);
  const currentMACD1 = last(macd1.histogram);
  const currentMACD5 = last(macd5.histogram);
  const currentMACD15 = last(macd15.histogram);

  // OPTIMIZED: Allow 2/3 timeframe confirmation instead of requiring all 3
  // This allows more entries while maintaining quality
  const rsi1Long = currentRSI1 > cfg.rsi_entry_threshold;
  const rsi5Long = currentRSI5 > 50;
  const rsi15Long = currentRSI15 > 50;
  const macd1Long = currentMACD1 > 0;
  const macd5Long = currentMACD5 > 0;
  const macd15Long = currentMACD15 > 0;
  
  // Count confirmations: need at least 2/3 RSI and 2/3 MACD
  const rsiLongCount = (rsi1Long ? 1 : 0) + (rsi5Long ? 1 : 0) + (rsi15Long ? 1 : 0);
  const macdLongCount = (macd1Long ? 1 : 0) + (macd5Long ? 1 : 0) + (macd15Long ? 1 : 0);
  const mtfConvergenceLong = rsiLongCount >= 2 && macdLongCount >= 2;

  const condLong = !positionOpen && mtfConvergenceLong && volOk;

  // SHORT: Allow 2/3 timeframe confirmation
  const rsi1Short = currentRSI1 < (100 - cfg.rsi_entry_threshold);
  const rsi5Short = currentRSI5 < 50;
  const rsi15Short = currentRSI15 < 50;
  const macd1Short = currentMACD1 < 0;
  const macd5Short = currentMACD5 < 0;
  const macd15Short = currentMACD15 < 0;
  
  const rsiShortCount = (rsi1Short ? 1 : 0) + (rsi5Short ? 1 : 0) + (rsi15Short ? 1 : 0);
  const macdShortCount = (macd1Short ? 1 : 0) + (macd5Short ? 1 : 0) + (macd15Short ? 1 : 0);
  const mtfConvergenceShort = rsiShortCount >= 2 && macdShortCount >= 2;

  const condShort = !positionOpen && mtfConvergenceShort && volOk;
  
  // Check if we have any convergence
  if (!positionOpen && !mtfConvergenceLong && !mtfConvergenceShort) {
    return { 
      signal_type: null, 
      reason: `No MTF convergence (RSI: ${rsiLongCount}/3 long, ${rsiShortCount}/3 short; MACD: ${macdLongCount}/3 long, ${macdShortCount}/3 short)`,
      confidence: 0,
      time_to_expire: 5
    };
  }

  if (positionOpen) {
    return { signal_type: null, reason: 'Position open - exits managed elsewhere' };
  }

  if (condLong) {
    const currentPrice = candles1m[candles1m.length - 1].close;
    const stopLoss = currentPrice - (cfg.atr_sl_multiplier * currentATR);
    const takeProfit = currentPrice + (cfg.atr_tp_multiplier * currentATR);
    const confidence = calculateSignalConfidence(
      currentRSI1, currentRSI5, currentRSI15,
      currentMACD1, currentMACD5, currentMACD15,
      volumeRatio,
      cfg
    );

    return { 
      signal_type: 'BUY', 
      reason: `MTF BUY: RSI(${currentRSI1.toFixed(1)}/${currentRSI5.toFixed(1)}/${currentRSI15.toFixed(1)}), MACD+, Vol✓`,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      confidence: confidence,
      time_to_expire: cfg.max_position_time
    };
  }
  
  if (condShort) {
    const currentPrice = candles1m[candles1m.length - 1].close;
    const stopLoss = currentPrice + (cfg.atr_sl_multiplier * currentATR);
    const takeProfit = currentPrice - (cfg.atr_tp_multiplier * currentATR);
    const confidence = calculateSignalConfidence(
      currentRSI1, currentRSI5, currentRSI15,
      currentMACD1, currentMACD5, currentMACD15,
      volumeRatio,
      cfg
    );

    return { 
      signal_type: 'SELL', 
      reason: `MTF SELL: RSI(${currentRSI1.toFixed(1)}/${currentRSI5.toFixed(1)}/${currentRSI15.toFixed(1)}), MACD-, Vol✓`,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      confidence: confidence,
      time_to_expire: cfg.max_position_time
    };
  }
  
  return { signal_type: null, reason: 'No MTF confluence' };
}

export const defaultMTFMomentumConfig: MTFMomentumConfig = {
  rsi_period: 14,
  rsi_entry_threshold: 55,        // OPTIMIZED: Stricter threshold (55) for stronger momentum
  macd_fast: 8,                   // Faster for scalping
  macd_slow: 21,                  // Faster for scalping
  macd_signal: 5,                 // Faster for scalping
  supertrend_atr_period: 10,
  supertrend_multiplier: 3,
  volume_multiplier: 1.3,         // OPTIMIZED: Stricter volume (1.3) for volume confirmation
  atr_sl_multiplier: 1.2,         // OPTIMIZED: Tighter stop loss
  atr_tp_multiplier: 1.8,         // OPTIMIZED: Adjusted take profit
  trailing_stop_percent: 0.5,     // Fast trailing stop
  max_position_time: 20,          // OPTIMIZED: Shorter position time (20 min)
  min_profit_percent: 0.2         // Min profit for trailing activation
};


