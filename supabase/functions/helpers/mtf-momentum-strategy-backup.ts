// Multi-Timeframe Momentum Strategy (1m/5m/15m) for scalping
// BACKUP VERSION - Created before optimization

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
  rsi_entry_threshold?: number;  // e.g., > 55 for longs, < 45 for shorts
  macd_fast?: number;            // default 12
  macd_slow?: number;            // default 26
  macd_signal?: number;          // default 9
  supertrend_atr_period?: number;// default 10
  supertrend_multiplier?: number;// default 3
  volume_multiplier?: number;    // default 1.2 (current volume vs 20 SMA volume)
}

export interface MTFMomentumSignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
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

export function evaluateMTFMomentum(
  candles1m: Candle[],
  candles5m: Candle[],
  candles15m: Candle[],
  config: MTFMomentumConfig,
  positionOpen: boolean
): MTFMomentumSignal {
  const cfg = {
    rsi_period: config.rsi_period ?? 14,
    rsi_entry_threshold: config.rsi_entry_threshold ?? 55,
    macd_fast: config.macd_fast ?? 12,
    macd_slow: config.macd_slow ?? 26,
    macd_signal: config.macd_signal ?? 9,
    supertrend_atr_period: config.supertrend_atr_period ?? 10,
    supertrend_multiplier: config.supertrend_multiplier ?? 3,
    volume_multiplier: config.volume_multiplier ?? 1.2
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

  const volOk = candles1m[candles1m.length - 1].volume >= volumeSMA(candles1m, 20) * cfg.volume_multiplier;

  const last = (arr: number[]) => arr[arr.length - 1];
  const condLong =
    last(rsi1) > cfg.rsi_entry_threshold &&
    last(rsi5) > cfg.rsi_entry_threshold &&
    last(rsi15) > cfg.rsi_entry_threshold &&
    last(macd1.histogram) > 0 && last(macd5.histogram) > 0 && last(macd15.histogram) > 0 &&
    volOk;

  const condShort =
    last(rsi1) < 100 - cfg.rsi_entry_threshold &&
    last(rsi5) < 100 - cfg.rsi_entry_threshold &&
    last(rsi15) < 100 - cfg.rsi_entry_threshold &&
    last(macd1.histogram) < 0 && last(macd5.histogram) < 0 && last(macd15.histogram) < 0 &&
    volOk;

  if (positionOpen) {
    return { signal_type: null, reason: 'Position open - exits managed elsewhere' };
  }

  if (condLong) {
    return { signal_type: 'BUY', reason: 'MTF confluence: RSI>threshold and MACD>0 on 1m/5m/15m with volume' };
  }
  if (condShort) {
    return { signal_type: 'SELL', reason: 'MTF confluence: RSI<threshold and MACD<0 on 1m/5m/15m with volume' };
  }
  return { signal_type: null, reason: 'No MTF confluence' };
}

export const defaultMTFMomentumConfig: MTFMomentumConfig = {
  rsi_period: 14,
  rsi_entry_threshold: 55,
  macd_fast: 12,
  macd_slow: 26,
  macd_signal: 9,
  supertrend_atr_period: 10,
  supertrend_multiplier: 3,
  volume_multiplier: 1.2
};
