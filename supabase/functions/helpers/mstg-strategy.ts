import * as indicators from "../indicators/all-indicators.ts";

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface MSTGConfig {
  long_threshold: number;
  short_threshold: number;
  exit_threshold: number;
  extreme_threshold: number;
  weight_momentum: number;
  weight_trend: number;
  weight_volatility: number;
  weight_relative: number;
}

interface MSTGSignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  ts_score?: number;
}

/**
 * Evaluates MSTG (Market Sentiment Trend Gauge) strategy
 * Calculates composite TS score from 4 components: Momentum, Trend, Volatility, Relative Strength
 */
export function evaluateMSTG(
  assetCandles: Candle[],
  benchmarkCandles: Candle[],
  config: MSTGConfig,
  positionOpen: boolean
): MSTGSignal {
  console.log(`[MSTG] Starting evaluation for ${assetCandles.length} candles`);

  // Need at least 50 candles for all indicators
  if (assetCandles.length < 50) {
    return { 
      signal_type: null, 
      reason: 'Insufficient candle data (need at least 50 candles)' 
    };
  }

  const closes = assetCandles.map(c => c.close);

  try {
    // 1. Calculate Momentum Score (M) - Normalized RSI [-100, +100]
    console.log(`[MSTG] Calculating Momentum (RSI)...`);
    const rsi = indicators.calculateRSI(closes, 14);
    const momentum = indicators.normalizeRSI(rsi);
    const currentM = momentum[momentum.length - 1];
    console.log(`[MSTG] Momentum (M): ${currentM.toFixed(2)}`);

    // 2. Calculate Trend Score (T) - EMA10 vs EMA21 [-100, +100]
    console.log(`[MSTG] Calculating Trend Score (EMA10 vs EMA21)...`);
    const trendScore = indicators.calculateTrendScore(closes);
    const currentT = trendScore[trendScore.length - 1];
    console.log(`[MSTG] Trend (T): ${currentT.toFixed(2)}`);

    // 3. Calculate Volatility Position (V) - Bollinger Band position [-100, +100]
    console.log(`[MSTG] Calculating Volatility Position (BB)...`);
    const bbPosition = indicators.calculateBollingerPosition(assetCandles, 20);
    const currentV = bbPosition[bbPosition.length - 1];
    console.log(`[MSTG] Volatility (V): ${currentV.toFixed(2)}`);

    // 4. Calculate Relative Strength (R) - Asset vs Benchmark [-100, +100]
    console.log(`[MSTG] Calculating Relative Strength vs benchmark...`);
    const relativeStrength = indicators.calculateBenchmarkRelativeStrength(
      assetCandles,
      benchmarkCandles,
      14
    );
    const currentR = relativeStrength[relativeStrength.length - 1];
    console.log(`[MSTG] Relative Strength (R): ${currentR.toFixed(2)}`);

    // Validate all components
    if (isNaN(currentM) || isNaN(currentT) || isNaN(currentV) || isNaN(currentR)) {
      console.error(`[MSTG] Invalid indicator values: M=${currentM}, T=${currentT}, V=${currentV}, R=${currentR}`);
      return { 
        signal_type: null, 
        reason: 'Invalid indicator calculation results' 
      };
    }

    // 5. Calculate Composite TS Score
    const weights = {
      wM: config.weight_momentum,
      wT: config.weight_trend,
      wV: config.weight_volatility,
      wR: config.weight_relative,
    };

    console.log(`[MSTG] Weights: M=${weights.wM}, T=${weights.wT}, V=${weights.wV}, R=${weights.wR}`);

    const tsScore = indicators.calculateCompositeScore(
      momentum,
      trendScore,
      bbPosition,
      relativeStrength,
      weights
    );

    const currentTS = tsScore[tsScore.length - 1];
    const prevTS = tsScore.length > 1 ? tsScore[tsScore.length - 2] : NaN;

    if (isNaN(currentTS)) {
      console.error(`[MSTG] Invalid TS score calculated`);
      return { 
        signal_type: null, 
        reason: 'Invalid TS score calculation' 
      };
    }

    console.log(`[MSTG] Current TS Score: ${currentTS.toFixed(2)}`);
    console.log(`[MSTG] Components: M=${currentM.toFixed(2)}, T=${currentT.toFixed(2)}, V=${currentV.toFixed(2)}, R=${currentR.toFixed(2)}`);

    // 6. Evaluate signals based on TS score and thresholds
    const { long_threshold, short_threshold, exit_threshold, extreme_threshold } = config;

    console.log(`[MSTG] Thresholds: Long=${long_threshold}, Short=${short_threshold}, Exit=${exit_threshold}, Extreme=${extreme_threshold}`);
    console.log(`[MSTG] Position open: ${positionOpen}`);

    // Exit conditions (if position is open)
    if (positionOpen) {
      // Assume LONG position - exit if TS crosses below exit threshold
      if (!isNaN(prevTS) && prevTS >= exit_threshold && currentTS < exit_threshold) {
        console.log(`[MSTG] EXIT SIGNAL: TS crossed below ${exit_threshold} (prev: ${prevTS.toFixed(2)}, curr: ${currentTS.toFixed(2)})`);
        return {
          signal_type: 'SELL',
          reason: `MSTG Exit: TS score ${currentTS.toFixed(2)} crossed below exit threshold ${exit_threshold}`,
          ts_score: currentTS,
        };
      }

      // Check extreme zone warning
      if (Math.abs(currentTS) > extreme_threshold) {
        console.log(`[MSTG] WARNING: Extreme zone detected - TS=${currentTS.toFixed(2)}, threshold=${extreme_threshold}`);
      }

      console.log(`[MSTG] No exit signal: TS=${currentTS.toFixed(2)} still above ${exit_threshold}`);
      return { signal_type: null, reason: `Holding position, TS=${currentTS.toFixed(2)}`, ts_score: currentTS };
    }

    // Entry conditions (if no position)
    if (!positionOpen) {
      // LONG entry
      if (currentTS > long_threshold) {
        console.log(`[MSTG] LONG SIGNAL: TS=${currentTS.toFixed(2)} > ${long_threshold}`);
        return {
          signal_type: 'BUY',
          reason: `MSTG Long: TS score ${currentTS.toFixed(2)} above long threshold ${long_threshold}`,
          ts_score: currentTS,
        };
      }

      // SHORT entry (not typically used in spot trading)
      if (currentTS < short_threshold) {
        console.log(`[MSTG] SHORT SIGNAL: TS=${currentTS.toFixed(2)} < ${short_threshold}`);
        return {
          signal_type: 'SELL',
          reason: `MSTG Short: TS score ${currentTS.toFixed(2)} below short threshold ${short_threshold}`,
          ts_score: currentTS,
        };
      }

      console.log(`[MSTG] No entry signal: TS=${currentTS.toFixed(2)} between ${short_threshold} and ${long_threshold}`);
      return { 
        signal_type: null, 
        reason: `Waiting for threshold cross (TS=${currentTS.toFixed(2)}, need >${long_threshold} or <${short_threshold})`,
        ts_score: currentTS 
      };
    }

    return { signal_type: null, reason: 'No signal', ts_score: currentTS };

  } catch (error) {
    console.error(`[MSTG] Error during evaluation:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { 
      signal_type: null, 
      reason: `MSTG evaluation error: ${errorMessage}` 
    };
  }
}
