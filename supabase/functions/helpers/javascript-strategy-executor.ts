// JavaScript Strategy Executor
// Safe execution environment for custom JavaScript strategies

interface StrategyContext {
  candles: any[];
  indicators: Record<string, any>;
  config: Record<string, any>;
  position: {
    open: boolean;
    entryPrice: number;
    entryTime: number;
    type: 'LONG' | 'SHORT';
  };
}

interface StrategyResult {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  metadata?: Record<string, any>;
}

interface StrategyError {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export class JavaScriptStrategyExecutor {
  private sandbox: any;
  private allowedFunctions: string[];
  private maxExecutionTime: number;
  
  constructor() {
    this.allowedFunctions = [
      'calculateRSI',
      'calculateEMA',
      'calculateSMA',
      'calculateMACD',
      'calculateBollingerBands',
      'calculateATR',
      'calculateStochastic',
      'calculateVWAP',
      'calculateParabolicSAR',
      'calculateCCI',
      'calculateWPR',
      'calculateMFI',
      'calculateStochRSI',
      'Math',
      'Date',
      'Array',
      'Object',
      'JSON'
    ];
    
    this.maxExecutionTime = 5000; // 5 seconds
    this.initializeSandbox();
  }
  
  private initializeSandbox(): void {
    // Create a safe execution environment
    this.sandbox = {
      // Math functions
      Math: Math,
      
      // Date functions
      Date: Date,
      
      // Array functions
      Array: Array,
      Object: Object,
      JSON: JSON,
      
      // Console for debugging (limited)
      console: {
        log: (...args: any[]) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[STRATEGY]', ...args);
          }
        },
        error: (...args: any[]) => {
          if (process.env.NODE_ENV === 'development') {
            console.error('[STRATEGY]', ...args);
          }
        }
      },
      
      // Indicator functions (will be injected)
      calculateRSI: null,
      calculateEMA: null,
      calculateSMA: null,
      calculateMACD: null,
      calculateBollingerBands: null,
      calculateATR: null,
      calculateStochastic: null,
      calculateVWAP: null,
      calculateParabolicSAR: null,
      calculateCCI: null,
      calculateWPR: null,
      calculateMFI: null,
      calculateStochRSI: null
    };
  }
  
  // Inject indicator functions into sandbox
  private injectIndicatorFunctions(): void {
    // Import indicator functions
    const indicators = require('../indicators/all-indicators.ts');
    
    this.sandbox.calculateRSI = indicators.calculateRSI;
    this.sandbox.calculateEMA = indicators.calculateEMA;
    this.sandbox.calculateSMA = indicators.calculateSMA;
    this.sandbox.calculateMACD = indicators.calculateMACD;
    this.sandbox.calculateBollingerBands = indicators.calculateBollingerBands;
    this.sandbox.calculateATR = indicators.calculateATR;
    this.sandbox.calculateStochastic = indicators.calculateStochastic;
    this.sandbox.calculateVWAP = indicators.calculateVWAP;
    this.sandbox.calculateParabolicSAR = indicators.calculateParabolicSAR;
    this.sandbox.calculateCCI = indicators.calculateCCI;
    this.sandbox.calculateWPR = indicators.calculateWPR;
    this.sandbox.calculateMFI = indicators.calculateMFI;
    this.sandbox.calculateStochRSI = indicators.calculateStochRSI;
  }
  
  // Validate JavaScript code for security
  private validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      /require\s*\(/,
      /import\s+/,
      /eval\s*\(/,
      /Function\s*\(/,
      /setTimeout\s*\(/,
      /setInterval\s*\(/,
      /process\./,
      /global\./,
      /window\./,
      /document\./,
      /localStorage/,
      /sessionStorage/,
      /fetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /fs\./,
      /path\./,
      /os\./,
      /child_process/,
      /exec\s*\(/,
      /spawn\s*\(/
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }
    
    // Check for infinite loops
    const loopPatterns = [
      /while\s*\(\s*true\s*\)/,
      /for\s*\(\s*;\s*;\s*\)/,
      /for\s*\(\s*.*\s*;\s*.*\s*;\s*\)\s*{[\s\S]*for\s*\(\s*.*\s*;\s*.*\s*;\s*\)\s*{/
    ];
    
    for (const pattern of loopPatterns) {
      if (pattern.test(code)) {
        errors.push(`Potential infinite loop detected: ${pattern.source}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Execute JavaScript strategy
  async executeStrategy(
    code: string, 
    context: StrategyContext
  ): Promise<{ result?: StrategyResult; error?: StrategyError }> {
    try {
      // Validate code security
      const validation = this.validateCode(code);
      if (!validation.valid) {
        return {
          error: {
            message: `Code validation failed: ${validation.errors.join(', ')}`
          }
        };
      }
      
      // Inject indicator functions
      this.injectIndicatorFunctions();
      
      // Prepare execution context
      const executionContext = {
        ...this.sandbox,
        candles: context.candles,
        indicators: context.indicators,
        config: context.config,
        position: context.position
      };
      
      // Wrap code in a function to prevent global scope pollution
      const wrappedCode = `
        (function() {
          ${code}
          
          // Ensure the strategy function exists
          if (typeof evaluateStrategy === 'function') {
            return evaluateStrategy(candles, config);
          } else if (typeof evaluateMomentum === 'function') {
            return evaluateMomentum(candles, config);
          } else if (typeof evaluateTrend === 'function') {
            return evaluateTrend(candles, config);
          } else if (typeof evaluateMeanReversion === 'function') {
            return evaluateMeanReversion(candles, config);
          } else {
            throw new Error('No valid strategy function found. Expected: evaluateStrategy, evaluateMomentum, evaluateTrend, or evaluateMeanReversion');
          }
        })();
      `;
      
      // Execute with timeout
      const result = await this.executeWithTimeout(wrappedCode, executionContext);
      
      // Validate result
      if (!result || typeof result !== 'object') {
        throw new Error('Strategy must return an object');
      }
      
      if (!['BUY', 'SELL', 'HOLD'].includes(result.signal)) {
        throw new Error('Strategy must return a valid signal: BUY, SELL, or HOLD');
      }
      
      if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
        throw new Error('Strategy must return a confidence value between 0 and 1');
      }
      
      if (!result.reason || typeof result.reason !== 'string') {
        throw new Error('Strategy must return a reason string');
      }
      
      return { result };
      
    } catch (error) {
      console.error('[STRATEGY-EXECUTOR] Error:', error);
      
      return {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }
  
  // Execute code with timeout
  private async executeWithTimeout(code: string, context: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Strategy execution timeout (${this.maxExecutionTime}ms)`));
      }, this.maxExecutionTime);
      
      try {
        // Create a function with the context
        const func = new Function(...Object.keys(context), code);
        const result = func(...Object.values(context));
        
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  // Test strategy with sample data
  async testStrategy(
    code: string, 
    sampleData: any
  ): Promise<{ 
    success: boolean; 
    result?: StrategyResult; 
    error?: StrategyError;
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      const result = await this.executeStrategy(code, sampleData);
      const executionTime = Date.now() - startTime;
      
      if (result.error) {
        return {
          success: false,
          error: result.error,
          executionTime
        };
      }
      
      return {
        success: true,
        result: result.result,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        },
        executionTime
      };
    }
  }
  
  // Get available functions for strategy development
  getAvailableFunctions(): string[] {
    return this.allowedFunctions;
  }
  
  // Get function documentation
  getFunctionDocumentation(): Record<string, string> {
    return {
      calculateRSI: 'Calculate RSI (Relative Strength Index) - returns array of values',
      calculateEMA: 'Calculate EMA (Exponential Moving Average) - returns array of values',
      calculateSMA: 'Calculate SMA (Simple Moving Average) - returns array of values',
      calculateMACD: 'Calculate MACD - returns object with {macd, signal, histogram}',
      calculateBollingerBands: 'Calculate Bollinger Bands - returns object with {upper, middle, lower}',
      calculateATR: 'Calculate ATR (Average True Range) - returns array of values',
      calculateStochastic: 'Calculate Stochastic Oscillator - returns object with {k, d}',
      calculateVWAP: 'Calculate VWAP (Volume Weighted Average Price) - returns array of values',
      calculateParabolicSAR: 'Calculate Parabolic SAR - returns array of values',
      calculateCCI: 'Calculate CCI (Commodity Channel Index) - returns array of values',
      calculateWPR: 'Calculate WPR (Williams %R) - returns array of values',
      calculateMFI: 'Calculate MFI (Money Flow Index) - returns array of values',
      calculateStochRSI: 'Calculate Stochastic RSI - returns array of values'
    };
  }
}

// Export singleton instance
export const strategyExecutor = new JavaScriptStrategyExecutor();
