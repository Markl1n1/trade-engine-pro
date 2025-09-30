import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_time: number;
}

// Simple Moving Average
function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// Exponential Moving Average
function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(...Array(period - 1).fill(NaN));
  result.push(ema);
  
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }
  
  return result;
}

// Relative Strength Index
function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const changes: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1]);
  }
  
  result.push(NaN);
  
  for (let i = 0; i < changes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const recentChanges = changes.slice(i - period + 1, i + 1);
      const gains = recentChanges.filter(c => c > 0);
      const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));
      
      const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
      
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        result.push(rsi);
      }
    }
  }
  
  return result;
}

// MACD (Moving Average Convergence Divergence)
function calculateMACD(data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
  const emaFast = calculateEMA(data, fastPeriod);
  const emaSlow = calculateEMA(data, slowPeriod);
  
  const macdLine: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
  }
  
  const signalLine = calculateEMA(macdLine.filter(v => !isNaN(v)), signalPeriod);
  const fullSignalLine: number[] = [];
  let signalIndex = 0;
  
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i])) {
      fullSignalLine.push(NaN);
    } else {
      fullSignalLine.push(signalLine[signalIndex] || NaN);
      signalIndex++;
    }
  }
  
  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(fullSignalLine[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - fullSignalLine[i]);
    }
  }
  
  return { macd: macdLine, signal: fullSignalLine, histogram };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candles, indicators } = await req.json() as { 
      candles: Candle[], 
      indicators: Array<{ type: string, params?: any }> 
    };

    console.log(`Calculating indicators for ${candles.length} candles`);

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const results: any = {};

    for (const indicator of indicators) {
      switch (indicator.type) {
        case 'sma':
          const smaPeriod = indicator.params?.period || 20;
          results[`sma_${smaPeriod}`] = calculateSMA(closes, smaPeriod);
          break;
          
        case 'ema':
          const emaPeriod = indicator.params?.period || 20;
          results[`ema_${emaPeriod}`] = calculateEMA(closes, emaPeriod);
          break;
          
        case 'rsi':
          const rsiPeriod = indicator.params?.period || 14;
          results.rsi = calculateRSI(closes, rsiPeriod);
          break;
          
        case 'macd':
          const macdResult = calculateMACD(
            closes,
            indicator.params?.fast || 12,
            indicator.params?.slow || 26,
            indicator.params?.signal || 9
          );
          results.macd = macdResult;
          break;
      }
    }

    return new Response(
      JSON.stringify({ success: true, indicators: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error calculating indicators:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
