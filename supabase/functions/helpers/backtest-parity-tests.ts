// Backtest Parity Tests
// Small test cases to verify backtest engine behavior matches expected Bybit execution

import { Candle } from './strategy-interfaces.ts';
import { UnifiedBacktestEngine } from './unified-backtest-engine.ts';

export interface ParityTestResult {
  testName: string;
  passed: boolean;
  expected: any;
  actual: any;
  details?: string;
}

// Test 1: MinNotional Bump
export function testMinNotionalBump(): ParityTestResult {
  const testName = 'MinNotional Bump Test';
  
  // Create synthetic candles with very small price movement
  const candles: Candle[] = [
    { open: 100, high: 100.01, low: 99.99, close: 100, volume: 1000, timestamp: 1000 },
    { open: 100, high: 100.01, low: 99.99, close: 100, volume: 1000, timestamp: 2000 },
    { open: 100, high: 100.01, low: 99.99, close: 100, volume: 1000, timestamp: 3000 }
  ];
  
  // Test with very small position size that should trigger minNotional bump
  const config = {
    symbol: 'BTCUSDT',
    timeframe: '1m',
    initialBalance: 1000,
    positionSizePercent: 0.1, // 0.1% = $1 exposure
    leverage: 20,
    makerFee: 0.01,
    takerFee: 0.06,
    slippage: 0.01,
    exchangeType: 'bybit' as const
  };
  
  try {
    const engine = new UnifiedBacktestEngine(config);
    // This should trigger minNotional bump from $1 to $10 (minNotional for BTCUSDT)
    const result = engine.runBacktest(candles, () => ({ signal_type: 'BUY', confidence: 80 }));
    
    return {
      testName,
      passed: result.total_trades > 0, // Should have at least one trade after bump
      expected: 'At least 1 trade after minNotional bump',
      actual: `${result.total_trades} trades`,
      details: `Initial exposure: $1, MinNotional: $10, Should bump and execute`
    };
  } catch (error) {
    return {
      testName,
      passed: false,
      expected: 'Successful execution',
      actual: `Error: ${error}`,
      details: 'Test execution failed'
    };
  }
}

// Test 2: SL/TP Order (SL first)
export function testSLBeforeTP(): ParityTestResult {
  const testName = 'SL Before TP Test';
  
  // Create candles where price hits SL before TP
  const candles: Candle[] = [
    { open: 100, high: 100.5, low: 99.5, close: 100, volume: 1000, timestamp: 1000 },
    { open: 100, high: 100.2, low: 99.0, close: 99.0, volume: 1000, timestamp: 2000 }, // Hits SL at 99.0
    { open: 99.0, high: 101.0, low: 98.5, close: 101.0, volume: 1000, timestamp: 3000 } // Would hit TP at 101.0
  ];
  
  const config = {
    symbol: 'BTCUSDT',
    timeframe: '1m',
    initialBalance: 1000,
    positionSizePercent: 1,
    leverage: 1,
    makerFee: 0.01,
    takerFee: 0.06,
    slippage: 0.01,
    exchangeType: 'bybit' as const
  };
  
  try {
    const engine = new UnifiedBacktestEngine(config);
    const result = engine.runBacktest(candles, () => ({ 
      signal_type: 'BUY', 
      confidence: 80,
      stop_loss: 99.0,  // SL at 99.0
      take_profit: 101.0 // TP at 101.0
    }));
    
    const hasTrade = result.total_trades > 0;
    const exitReason = hasTrade ? result.trades[0]?.exit_reason : 'No trades';
    
    return {
      testName,
      passed: hasTrade && exitReason?.includes('SL'),
      expected: 'Trade closed by SL (not TP)',
      actual: `${result.total_trades} trades, exit reason: ${exitReason}`,
      details: 'Price hit SL at 99.0 before reaching TP at 101.0'
    };
  } catch (error) {
    return {
      testName,
      passed: false,
      expected: 'Successful execution',
      actual: `Error: ${error}`,
      details: 'Test execution failed'
    };
  }
}

// Test 3: Exchange Constraints
export function testExchangeConstraints(): ParityTestResult {
  const testName = 'Exchange Constraints Test';
  
  const candles: Candle[] = [
    { open: 100, high: 100.01, low: 99.99, close: 100, volume: 1000, timestamp: 1000 },
    { open: 100, high: 100.01, low: 99.99, close: 100, volume: 1000, timestamp: 2000 },
    { open: 100, high: 100.01, low: 99.99, close: 100, volume: 1000, timestamp: 3000 }
  ];
  
  const config = {
    symbol: 'BTCUSDT',
    timeframe: '1m',
    initialBalance: 1000,
    positionSizePercent: 0.001, // Very small position
    leverage: 1,
    makerFee: 0.01,
    takerFee: 0.06,
    slippage: 0.01,
    exchangeType: 'bybit' as const
  };
  
  try {
    const engine = new UnifiedBacktestEngine(config);
    const result = engine.runBacktest(candles, () => ({ signal_type: 'BUY', confidence: 80 }));
    
    // Should have 0 trades due to minNotional constraint
    return {
      testName,
      passed: result.total_trades === 0,
      expected: '0 trades (below minNotional)',
      actual: `${result.total_trades} trades`,
      details: 'Position too small for minNotional, should be rejected'
    };
  } catch (error) {
    return {
      testName,
      passed: false,
      expected: 'Successful execution',
      actual: `Error: ${error}`,
      details: 'Test execution failed'
    };
  }
}

// Run all parity tests
export function runAllParityTests(): ParityTestResult[] {
  return [
    testMinNotionalBump(),
    testSLBeforeTP(),
    testExchangeConstraints()
  ];
}

// Helper to format test results
export function formatTestResults(results: ParityTestResult[]): string {
  let output = '=== BACKTEST PARITY TESTS ===\n\n';
  
  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    output += `${status} ${result.testName}\n`;
    output += `  Expected: ${result.expected}\n`;
    output += `  Actual: ${result.actual}\n`;
    if (result.details) {
      output += `  Details: ${result.details}\n`;
    }
    output += '\n';
  });
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  output += `Summary: ${passed}/${total} tests passed\n`;
  
  return output;
}
