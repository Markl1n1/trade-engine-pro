// Strategy Validation Function
// Validates trading strategies and runs comprehensive tests

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Run basic validation
    const validation = validateStrategyBasic(strategy, marketData);
    console.log(`[VALIDATE-STRATEGY] Validation completed - Score: ${validation.score}/100`);

    let tests = null;
    let report = '';

    // Run tests if requested
    if (request.runTests) {
      console.log(`[VALIDATE-STRATEGY] Running basic tests`);
      tests = runBasicTests(strategy, marketData);
      report = generateTestReport(tests);
      console.log(`[VALIDATE-STRATEGY] Tests completed - ${tests.passed || 0}/${tests.total || 0} passed`);
    }

    // Generate validation report
    const validationReport = generateValidationReport(validation);
    
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

// Basic validation functions
function validateStrategyBasic(strategy: any, marketData: any): any {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  console.log(`[VALIDATE-STRATEGY] Validating strategy: ${strategy.name || 'Unknown'}`);

  // Basic validation checks
  if (!strategy.name || strategy.name.trim() === '') {
    errors.push('Strategy name is required');
    score -= 20;
  }

  if (!strategy.symbol || strategy.symbol.trim() === '') {
    errors.push('Symbol is required');
    score -= 20;
  }

  if (!strategy.timeframe || strategy.timeframe.trim() === '') {
    errors.push('Timeframe is required');
    score -= 15;
  }

  if (!strategy.initial_capital || strategy.initial_capital <= 0) {
    errors.push('Initial capital must be greater than 0');
    score -= 15;
  }

  if (!strategy.position_size || strategy.position_size <= 0) {
    errors.push('Position size must be greater than 0');
    score -= 10;
  }

  // Check for stop loss and take profit
  if (!strategy.stop_loss || strategy.stop_loss <= 0) {
    warnings.push('Stop loss is recommended for risk management');
    score -= 5;
  }

  if (!strategy.take_profit || strategy.take_profit <= 0) {
    warnings.push('Take profit is recommended for profit taking');
    score -= 5;
  }

  // Check strategy type specific validations
  if (strategy.type === 'market_sentiment_trend_gauge' && !strategy.benchmark_symbol) {
    errors.push('Benchmark symbol is required for MSTG strategy');
    score -= 20;
  }

  if (strategy.type === '4h_reentry' && !strategy.breakout_threshold) {
    warnings.push('Breakout threshold is recommended for 4h reentry strategy');
    score -= 5;
  }

  // Check for market data availability
  if (marketData && marketData.indicators) {
    const indicators = marketData.indicators;
    
    // Check for NaN values in indicators
    for (const [name, values] of Object.entries(indicators)) {
      if (Array.isArray(values)) {
        const nanCount = values.filter(v => isNaN(v)).length;
        if (nanCount > 0) {
          warnings.push(`${name} indicator has ${nanCount} NaN values`);
          score -= 2;
        }
      }
    }
  } else {
    warnings.push('No market data available for validation');
    score -= 10;
  }

  // Generate recommendations
  if (score < 80) {
    recommendations.push('Consider reviewing strategy parameters for better performance');
  }

  if (score < 60) {
    recommendations.push('Strategy needs significant improvements before deployment');
  }

  const result = {
    valid: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, score),
    recommendations
  };

  console.log(`[VALIDATE-STRATEGY] Validation result: Score ${result.score}/100, Errors: ${errors.length}, Warnings: ${warnings.length}`);
  
  return result;
}

function runBasicTests(strategy: any, marketData: any): any {
  const tests = [
    {
      name: 'strategy_name_test',
      passed: !!(strategy.name && strategy.name.trim() !== ''),
      description: 'Strategy has a valid name'
    },
    {
      name: 'symbol_test',
      passed: !!(strategy.symbol && strategy.symbol.trim() !== ''),
      description: 'Strategy has a valid symbol'
    },
    {
      name: 'timeframe_test',
      passed: !!(strategy.timeframe && strategy.timeframe.trim() !== ''),
      description: 'Strategy has a valid timeframe'
    },
    {
      name: 'capital_test',
      passed: !!(strategy.initial_capital && strategy.initial_capital > 0),
      description: 'Strategy has valid initial capital'
    },
    {
      name: 'position_size_test',
      passed: !!(strategy.position_size && strategy.position_size > 0),
      description: 'Strategy has valid position size'
    }
  ];

  const passed = tests.filter(t => t.passed).length;
  const total = tests.length;

  return {
    passed,
    failed: total - passed,
    total,
    duration: 0,
    results: tests
  };
}

function generateTestReport(tests: any): string {
  if (!tests) return '';
  
  let report = `Test Results: ${tests.passed}/${tests.total} passed\n`;
  report += `Duration: ${tests.duration}ms\n\n`;
  
  tests.results.forEach((test: any) => {
    report += `${test.passed ? '✅' : '❌'} ${test.name}: ${test.description}\n`;
  });
  
  return report;
}

function generateValidationReport(validation: any): string {
  let report = `Validation Report\n`;
  report += `Score: ${validation.score}/100\n`;
  report += `Valid: ${validation.valid ? 'Yes' : 'No'}\n\n`;
  
  if (validation.errors.length > 0) {
    report += `Errors:\n`;
    validation.errors.forEach((error: string) => {
      report += `❌ ${error}\n`;
    });
    report += `\n`;
  }
  
  if (validation.warnings.length > 0) {
    report += `Warnings:\n`;
    validation.warnings.forEach((warning: string) => {
      report += `⚠️ ${warning}\n`;
    });
    report += `\n`;
  }
  
  if (validation.recommendations.length > 0) {
    report += `Recommendations:\n`;
    validation.recommendations.forEach((rec: string) => {
      report += `💡 ${rec}\n`;
    });
  }
  
  return report;
}
