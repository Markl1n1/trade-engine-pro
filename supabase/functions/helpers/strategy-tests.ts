// Strategy Unit Tests
// Comprehensive test suite for trading strategies

import { strategyValidator } from './strategy-validator.ts';

interface TestCase {
  name: string;
  description: string;
  setup: () => any;
  test: (data: any) => boolean;
  expectedResult: boolean;
  category: 'unit' | 'integration' | 'performance' | 'edge-case';
}

interface TestSuite {
  name: string;
  tests: TestCase[];
  run: () => Promise<TestResults>;
}

interface TestResults {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  results: TestResult[];
}

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  category: string;
}

export class StrategyTestSuite {
  private testSuites: TestSuite[] = [];
  
  constructor() {
    this.initializeTestSuites();
  }
  
  // Initialize all test suites
  private initializeTestSuites(): void {
    this.testSuites = [
      this.createMSTGTests(),
      this.createATHGuardTests(),
      this.create4hReentryTests(),
      this.createIndicatorTests(),
      this.createEdgeCaseTests()
    ];
  }
  
  // MSTG Strategy Tests
  private createMSTGTests(): TestSuite {
    return {
      name: 'MSTG Strategy Tests',
      tests: [
        {
          name: 'mstg_basic_calculation',
          description: 'Test basic MSTG score calculation',
          setup: () => ({
            strategy: {
              strategy_type: 'market_sentiment_trend_gauge',
              weight_momentum: 0.3,
              weight_trend: 0.3,
              weight_volatility: 0.2,
              weight_relative: 0.2,
              long_threshold: 50,
              short_threshold: -50,
              exit_threshold: 0
            },
            marketData: {
              indicators: {
                rsi: Array(100).fill(0).map(() => Math.random() * 100),
                ema10: Array(100).fill(0).map(() => Math.random() * 50000 + 20000),
                ema21: Array(100).fill(0).map(() => Math.random() * 50000 + 20000),
                bollinger_upper: Array(100).fill(0).map(() => Math.random() * 50000 + 20000),
                bollinger_lower: Array(100).fill(0).map(() => Math.random() * 50000 + 20000)
              }
            }
          }),
          test: (data) => {
            // Test that MSTG calculation doesn't throw errors
            try {
              const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
              return validation.valid;
            } catch (error) {
              return false;
            }
          },
          expectedResult: true,
          category: 'unit'
        },
        {
          name: 'mstg_weight_validation',
          description: 'Test MSTG weight validation',
          setup: () => ({
            strategy: {
              strategy_type: 'market_sentiment_trend_gauge',
              weight_momentum: 0.4,
              weight_trend: 0.4,
              weight_volatility: 0.1,
              weight_relative: 0.1
            },
            marketData: { indicators: {} }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return validation.valid;
          },
          expectedResult: true,
          category: 'unit'
        },
        {
          name: 'mstg_invalid_weights',
          description: 'Test MSTG with invalid weights',
          setup: () => ({
            strategy: {
              strategy_type: 'market_sentiment_trend_gauge',
              weight_momentum: 0.5,
              weight_trend: 0.5,
              weight_volatility: 0.5,
              weight_relative: 0.5
            },
            marketData: { indicators: {} }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return !validation.valid; // Should be invalid
          },
          expectedResult: true,
          category: 'unit'
        }
      ],
      run: async () => this.runTestSuite('MSTG Strategy Tests')
    };
  }
  
  // ATH Guard Strategy Tests
  private createATHGuardTests(): TestSuite {
    return {
      name: 'ATH Guard Strategy Tests',
      tests: [
        {
          name: 'ath_guard_basic_validation',
          description: 'Test ATH Guard basic validation',
          setup: () => ({
            strategy: {
              strategy_type: 'ath_guard_scalping',
              ema_slope_threshold: 0.5,
              pullback_tolerance: 2.0,
              volume_multiplier: 1.5,
              stoch_oversold: 20,
              stoch_overbought: 80,
              rsi_oversold: 30,
              rsi_overbought: 70
            },
            marketData: {
              indicators: {
                ema50: Array(200).fill(0).map(() => Math.random() * 50000 + 20000),
                ema100: Array(200).fill(0).map(() => Math.random() * 50000 + 20000),
                ema150: Array(200).fill(0).map(() => Math.random() * 50000 + 20000),
                vwap: Array(200).fill(0).map(() => Math.random() * 50000 + 20000),
                macd: Array(200).fill(0).map(() => Math.random() * 1000 - 500),
                stoch_k: Array(200).fill(0).map(() => Math.random() * 100),
                stoch_d: Array(200).fill(0).map(() => Math.random() * 100),
                rsi: Array(200).fill(0).map(() => Math.random() * 100)
              }
            }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return validation.valid;
          },
          expectedResult: true,
          category: 'unit'
        },
        {
          name: 'ath_guard_invalid_parameters',
          description: 'Test ATH Guard with invalid parameters',
          setup: () => ({
            strategy: {
              strategy_type: 'ath_guard_scalping',
              ema_slope_threshold: -1, // Invalid
              pullback_tolerance: 2.0,
              volume_multiplier: 15, // Too high
              stoch_oversold: 20,
              stoch_overbought: 80,
              rsi_oversold: 30,
              rsi_overbought: 70
            },
            marketData: { indicators: {} }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return !validation.valid; // Should be invalid
          },
          expectedResult: true,
          category: 'unit'
        }
      ],
      run: async () => this.runTestSuite('ATH Guard Strategy Tests')
    };
  }
  
  // 4h Reentry Strategy Tests
  private create4hReentryTests(): TestSuite {
    return {
      name: '4h Reentry Strategy Tests',
      tests: [
        {
          name: '4h_reentry_session_validation',
          description: 'Test 4h Reentry session time validation',
          setup: () => ({
            strategy: {
              strategy_type: '4h_reentry',
              session_start: '09:30',
              session_end: '16:00',
              breakout_threshold: 0.5,
              pullback_threshold: 0.3
            },
            marketData: { indicators: {} }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return validation.valid;
          },
          expectedResult: true,
          category: 'unit'
        },
        {
          name: '4h_reentry_invalid_session',
          description: 'Test 4h Reentry with invalid session times',
          setup: () => ({
            strategy: {
              strategy_type: '4h_reentry',
              session_start: '16:00', // After end time
              session_end: '09:30',
              breakout_threshold: 0.5,
              pullback_threshold: 0.3
            },
            marketData: { indicators: {} }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return !validation.valid; // Should be invalid
          },
          expectedResult: true,
          category: 'unit'
        }
      ],
      run: async () => this.runTestSuite('4h Reentry Strategy Tests')
    };
  }
  
  // Indicator Tests
  private createIndicatorTests(): TestSuite {
    return {
      name: 'Indicator Tests',
      tests: [
        {
          name: 'rsi_calculation',
          description: 'Test RSI calculation',
          setup: () => ({
            strategy: { strategy_type: 'standard' },
            marketData: {
              indicators: {
                rsi: Array(100).fill(0).map((_, i) => 50 + Math.sin(i * 0.1) * 30)
              }
            }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return validation.valid;
          },
          expectedResult: true,
          category: 'unit'
        },
        {
          name: 'macd_calculation',
          description: 'Test MACD calculation',
          setup: () => ({
            strategy: { strategy_type: 'standard' },
            marketData: {
              indicators: {
                macd: Array(100).fill(0).map((_, i) => Math.sin(i * 0.1) * 100)
              }
            }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return validation.valid;
          },
          expectedResult: true,
          category: 'unit'
        },
        {
          name: 'bollinger_bands_calculation',
          description: 'Test Bollinger Bands calculation',
          setup: () => ({
            strategy: { strategy_type: 'standard' },
            marketData: {
              indicators: {
                bollinger_upper: Array(100).fill(0).map(() => Math.random() * 50000 + 20000),
                bollinger_lower: Array(100).fill(0).map(() => Math.random() * 50000 + 20000)
              }
            }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return validation.valid;
          },
          expectedResult: true,
          category: 'unit'
        }
      ],
      run: async () => this.runTestSuite('Indicator Tests')
    };
  }
  
  // Edge Case Tests
  private createEdgeCaseTests(): TestSuite {
    return {
      name: 'Edge Case Tests',
      tests: [
        {
          name: 'empty_data_handling',
          description: 'Test handling of empty data',
          setup: () => ({
            strategy: { strategy_type: 'standard' },
            marketData: { indicators: {} }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return validation.valid;
          },
          expectedResult: true,
          category: 'edge-case'
        },
        {
          name: 'nan_values_handling',
          description: 'Test handling of NaN values',
          setup: () => ({
            strategy: { strategy_type: 'standard' },
            marketData: {
              indicators: {
                rsi: [NaN, NaN, 50, 60, 70, NaN, 80]
              }
            }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return !validation.valid; // Should detect NaN values
          },
          expectedResult: true,
          category: 'edge-case'
        },
        {
          name: 'infinite_values_handling',
          description: 'Test handling of infinite values',
          setup: () => ({
            strategy: { strategy_type: 'standard' },
            marketData: {
              indicators: {
                rsi: [50, 60, Infinity, 80, 90]
              }
            }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return !validation.valid; // Should detect infinite values
          },
          expectedResult: true,
          category: 'edge-case'
        },
        {
          name: 'extreme_values_handling',
          description: 'Test handling of extreme values',
          setup: () => ({
            strategy: { strategy_type: 'standard' },
            marketData: {
              indicators: {
                rsi: Array(100).fill(0).map(() => Math.random() * 1000000) // Extreme values
              }
            }
          }),
          test: (data) => {
            const validation = strategyValidator.validateStrategy(data.strategy, data.marketData);
            return !validation.valid; // Should detect extreme values
          },
          expectedResult: true,
          category: 'edge-case'
        }
      ],
      run: async () => this.runTestSuite('Edge Case Tests')
    };
  }
  
  // Run a specific test suite
  private async runTestSuite(suiteName: string): Promise<TestResults> {
    const suite = this.testSuites.find(s => s.name === suiteName);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteName}`);
    }
    
    const startTime = performance.now();
    const results: TestResult[] = [];
    
    console.log(`[TEST-SUITE] Running ${suiteName}...`);
    
    for (const testCase of suite.tests) {
      const testStartTime = performance.now();
      
      try {
        const data = testCase.setup();
        const result = testCase.test(data);
        const testDuration = performance.now() - testStartTime;
        
        const passed = result === testCase.expectedResult;
        
        results.push({
          name: testCase.name,
          passed,
          duration: testDuration,
          category: testCase.category
        });
        
        console.log(`[TEST] ${testCase.name}: ${passed ? 'PASS' : 'FAIL'} (${testDuration.toFixed(2)}ms)`);
        
      } catch (error) {
        const testDuration = performance.now() - testStartTime;
        
        results.push({
          name: testCase.name,
          passed: false,
          duration: testDuration,
          error: error instanceof Error ? error.message : 'Unknown error',
          category: testCase.category
        });
        
        console.error(`[TEST] ${testCase.name}: ERROR - ${error}`);
      }
    }
    
    const totalDuration = performance.now() - startTime;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    console.log(`[TEST-SUITE] ${suiteName} completed: ${passed}/${results.length} passed (${totalDuration.toFixed(2)}ms)`);
    
    return {
      passed,
      failed,
      total: results.length,
      duration: totalDuration,
      results
    };
  }
  
  // Run all test suites
  async runAllTests(): Promise<TestResults[]> {
    const allResults: TestResults[] = [];
    
    console.log('[TEST-SUITE] Running all strategy tests...');
    
    for (const suite of this.testSuites) {
      try {
        const results = await suite.run();
        allResults.push(results);
      } catch (error) {
        console.error(`[TEST-SUITE] Error running ${suite.name}:`, error);
      }
    }
    
    const totalPassed = allResults.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = allResults.reduce((sum, r) => sum + r.failed, 0);
    const totalTests = allResults.reduce((sum, r) => sum + r.total, 0);
    
    console.log(`[TEST-SUITE] All tests completed: ${totalPassed}/${totalTests} passed, ${totalFailed} failed`);
    
    return allResults;
  }
  
  // Get test report
  getTestReport(results: TestResults[]): string {
    let report = `# Strategy Test Report\n\n`;
    
    const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
    const totalTests = results.reduce((sum, r) => sum + r.total, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    
    report += `**Overall Results: ${totalPassed}/${totalTests} passed (${((totalPassed/totalTests)*100).toFixed(1)}%)**\n\n`;
    report += `**Total Duration: ${totalDuration.toFixed(2)}ms**\n\n`;
    
    for (const result of results) {
      report += `## ${result.passed + result.failed > 0 ? '✅' : '❌'} Test Suite\n\n`;
      report += `- **Passed:** ${result.passed}\n`;
      report += `- **Failed:** ${result.failed}\n`;
      report += `- **Total:** ${result.total}\n`;
      report += `- **Duration:** ${result.duration.toFixed(2)}ms\n\n`;
      
      if (result.failed > 0) {
        const failedTests = result.results.filter(r => !r.passed);
        report += `### Failed Tests:\n`;
        failedTests.forEach(test => {
          report += `- ❌ **${test.name}**: ${test.error || 'Unexpected result'}\n`;
        });
        report += `\n`;
      }
    }
    
    return report;
  }
}

// Export test suite instance
export const strategyTestSuite = new StrategyTestSuite();
