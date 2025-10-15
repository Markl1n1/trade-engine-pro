// Strategy Validation Function
// Validates trading strategies and runs comprehensive tests

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { strategyValidator } from '../helpers/strategy-validator.ts';
import { strategyTestSuite } from '../helpers/strategy-tests.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  strategyId?: string;
  strategy?: any;
  runTests?: boolean;
  testSuite?: string;
}

interface ValidationResponse {
  success: boolean;
  validation?: any;
  tests?: any;
  report?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const request: ValidationRequest = await req.json();
    console.log(`[VALIDATE-STRATEGY] Starting validation for strategy: ${request.strategyId || 'custom'}`);

    let strategy: any;
    let marketData: any = {};

    // Get strategy data
    if (request.strategyId) {
      // Fetch strategy from database
      const { data: strategyData, error: strategyError } = await supabase
        .from('strategies')
        .select('*')
        .eq('id', request.strategyId)
        .eq('user_id', user.id)
        .single();

      if (strategyError) {
        throw new Error(`Failed to fetch strategy: ${strategyError.message}`);
      }

      strategy = strategyData;

      // Fetch market data for validation
      const { data: marketDataResult } = await supabase
        .from('market_data')
        .select('*')
        .eq('symbol', strategy.symbol)
        .eq('timeframe', strategy.timeframe)
        .order('open_time', { ascending: false })
        .limit(200);

      if (marketDataResult && marketDataResult.length > 0) {
        // Convert to indicator format for validation
        const closes = marketDataResult.map(c => c.close);
        const highs = marketDataResult.map(c => c.high);
        const lows = marketDataResult.map(c => c.low);
        const volumes = marketDataResult.map(c => c.volume);

        // Calculate basic indicators for validation
        marketData = {
          indicators: {
            rsi: calculateRSI(closes, 14),
            ema10: calculateEMA(closes, 10),
            ema21: calculateEMA(closes, 21),
            ema50: calculateEMA(closes, 50),
            macd: calculateMACD(closes),
            bollinger_upper: calculateBollingerBands(closes, 20, 2).upper,
            bollinger_lower: calculateBollingerBands(closes, 20, 2).lower,
            atr: calculateATR(marketDataResult, 14),
            volume: volumes
          }
        };
      }
    } else if (request.strategy) {
      // Use provided strategy
      strategy = request.strategy;
    } else {
      throw new Error('Either strategyId or strategy must be provided');
    }

    // Run validation
    const validation = strategyValidator.validateStrategy(strategy, marketData);
    console.log(`[VALIDATE-STRATEGY] Validation completed - Score: ${validation.score}/100`);

    let tests = null;
    let report = '';

    // Run tests if requested
    if (request.runTests) {
      console.log(`[VALIDATE-STRATEGY] Running test suite: ${request.testSuite || 'all'}`);
      
      if (request.testSuite) {
        // Run specific test suite
        const testResults = await strategyTestSuite.runTestSuite(request.testSuite);
        tests = testResults;
      } else {
        // Run all tests
        const allTestResults = await strategyTestSuite.runAllTests();
        tests = allTestResults;
      }
      
      report = strategyTestSuite.getTestReport(tests);
      console.log(`[VALIDATE-STRATEGY] Tests completed - ${tests.passed || 0}/${tests.total || 0} passed`);
    }

    // Generate validation report
    const validationReport = strategyValidator.getValidationReport(validation);
    
    // Combine reports
    const fullReport = `${validationReport}\n\n${report}`;

    // Save validation results to database
    if (request.strategyId) {
      await supabase
        .from('strategy_validations')
        .insert({
          strategy_id: request.strategyId,
          user_id: user.id,
          validation_score: validation.score,
          is_valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          recommendations: validation.recommendations,
          test_results: tests,
          report: fullReport
        });
    }

    const response: ValidationResponse = {
      success: true,
      validation,
      tests,
      report: fullReport
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[VALIDATE-STRATEGY] Error:', error);
    
    const errorResponse: ValidationResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };

    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper functions for indicator calculations
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
      result.push(NaN);
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

function calculateMACD(data: number[]): { macd: number[], signal: number[], histogram: number[] } {
  const fastEMA = calculateEMA(data, 12);
  const slowEMA = calculateEMA(data, 26);
  const macd = fastEMA.map((v, i) => v - slowEMA[i]);
  const signal = calculateEMA(macd.slice(26), 9);
  const paddedSignal = new Array(26).fill(0).concat(signal);
  const histogram = macd.map((v, i) => v - paddedSignal[i]);
  return { macd, signal: paddedSignal, histogram };
}

function calculateBollingerBands(data: number[], period: number, deviation: number): { upper: number[], middle: number[], lower: number[] } {
  const sma = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      upper.push(mean + (deviation * stdDev));
      lower.push(mean - (deviation * stdDev));
    }
  }
  
  return { upper, middle: sma, lower };
}

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

function calculateATR(candles: any[], period: number = 14): number[] {
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return [0, ...calculateEMA(tr, period)];
}
