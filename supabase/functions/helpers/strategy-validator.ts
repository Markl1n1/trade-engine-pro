// Strategy Validator
// Comprehensive validation system for trading strategies

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100
  recommendations: string[];
}

interface StrategyTest {
  name: string;
  description: string;
  test: (strategy: any, data: any) => boolean;
  severity: 'error' | 'warning' | 'info';
  category: 'mathematical' | 'logical' | 'performance' | 'safety';
}

interface IndicatorValidation {
  name: string;
  values: number[];
  expectedRange: [number, number];
  hasNaN: boolean;
  hasInfinite: boolean;
  isStable: boolean;
  correlation: number;
}

export class StrategyValidator {
  private tests: StrategyTest[] = [];
  
  constructor() {
    this.initializeTests();
  }
  
  // Initialize all validation tests
  private initializeTests(): void {
    this.tests = [
      // Mathematical validation tests
      {
        name: 'indicator_nan_check',
        description: 'Check for NaN values in indicators',
        test: (strategy, data) => this.checkIndicatorNaN(data.indicators),
        severity: 'error',
        category: 'mathematical'
      },
      {
        name: 'indicator_infinite_check',
        description: 'Check for infinite values in indicators',
        test: (strategy, data) => this.checkIndicatorInfinite(data.indicators),
        severity: 'error',
        category: 'mathematical'
      },
      {
        name: 'indicator_range_check',
        description: 'Check indicator values are within expected ranges',
        test: (strategy, data) => this.checkIndicatorRanges(data.indicators),
        severity: 'warning',
        category: 'mathematical'
      },
      {
        name: 'indicator_stability_check',
        description: 'Check for indicator stability and consistency',
        test: (strategy, data) => this.checkIndicatorStability(data.indicators),
        severity: 'warning',
        category: 'mathematical'
      },
      
      // Logical validation tests
      {
        name: 'strategy_logic_check',
        description: 'Validate strategy logic and conditions',
        test: (strategy, data) => this.checkStrategyLogic(strategy),
        severity: 'error',
        category: 'logical'
      },
      {
        name: 'condition_conflicts_check',
        description: 'Check for conflicting conditions',
        test: (strategy, data) => this.checkConditionConflicts(strategy),
        severity: 'warning',
        category: 'logical'
      },
      {
        name: 'threshold_validation_check',
        description: 'Validate threshold values are reasonable',
        test: (strategy, data) => this.checkThresholds(strategy),
        severity: 'warning',
        category: 'logical'
      },
      
      // Performance validation tests
      {
        name: 'indicator_performance_check',
        description: 'Check indicator calculation performance',
        test: (strategy, data) => this.checkIndicatorPerformance(data.indicators),
        severity: 'info',
        category: 'performance'
      },
      {
        name: 'memory_usage_check',
        description: 'Check memory usage for large datasets',
        test: (strategy, data) => this.checkMemoryUsage(data),
        severity: 'warning',
        category: 'performance'
      },
      
      // Safety validation tests
      {
        name: 'risk_management_check',
        description: 'Validate risk management parameters',
        test: (strategy, data) => this.checkRiskManagement(strategy),
        severity: 'error',
        category: 'safety'
      },
      {
        name: 'position_size_check',
        description: 'Check position sizing logic',
        test: (strategy, data) => this.checkPositionSizing(strategy),
        severity: 'warning',
        category: 'safety'
      }
    ];
  }
  
  // Main validation method
  validateStrategy(strategy: any, marketData: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let score = 100;
    
    console.log(`[VALIDATOR] Starting validation for strategy: ${strategy.name || 'Unknown'}`);
    
    // Run all tests
    for (const test of this.tests) {
      try {
        const passed = test.test(strategy, marketData);
        
        if (!passed) {
          const message = `${test.name}: ${test.description}`;
          
          if (test.severity === 'error') {
            errors.push(message);
            score -= 20;
          } else if (test.severity === 'warning') {
            warnings.push(message);
            score -= 10;
          } else {
            recommendations.push(message);
            score -= 5;
          }
        }
      } catch (error) {
        const message = `${test.name}: Test failed with error - ${error}`;
        errors.push(message);
        score -= 25;
      }
    }
    
    // Generate recommendations based on results
    this.generateRecommendations(strategy, errors, warnings, recommendations);
    
    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, score),
      recommendations
    };
    
    console.log(`[VALIDATOR] Validation complete - Score: ${result.score}/100, Errors: ${errors.length}, Warnings: ${warnings.length}`);
    
    return result;
  }
  
  // Mathematical validation methods
  private checkIndicatorNaN(indicators: any): boolean {
    for (const [name, values] of Object.entries(indicators)) {
      if (Array.isArray(values)) {
        const nanCount = values.filter(v => isNaN(v)).length;
        if (nanCount > 0) {
          console.warn(`[VALIDATOR] ${name} has ${nanCount} NaN values`);
          return false;
        }
      }
    }
    return true;
  }
  
  private checkIndicatorInfinite(indicators: any): boolean {
    for (const [name, values] of Object.entries(indicators)) {
      if (Array.isArray(values)) {
        const infiniteCount = values.filter(v => !isFinite(v)).length;
        if (infiniteCount > 0) {
          console.warn(`[VALIDATOR] ${name} has ${infiniteCount} infinite values`);
          return false;
        }
      }
    }
    return true;
  }
  
  private checkIndicatorRanges(indicators: any): boolean {
    const expectedRanges: Record<string, [number, number]> = {
      'rsi': [0, 100],
      'macd': [-1000, 1000],
      'bollinger_upper': [0, Infinity],
      'bollinger_lower': [0, Infinity],
      'ema': [0, Infinity],
      'sma': [0, Infinity]
    };
    
    for (const [name, values] of Object.entries(indicators)) {
      if (Array.isArray(values) && expectedRanges[name]) {
        const [min, max] = expectedRanges[name];
        const validValues = values.filter(v => !isNaN(v) && isFinite(v));
        
        if (validValues.length > 0) {
          const actualMin = Math.min(...validValues);
          const actualMax = Math.max(...validValues);
          
          if (actualMin < min || actualMax > max) {
            console.warn(`[VALIDATOR] ${name} values out of range: [${actualMin}, ${actualMax}] expected [${min}, ${max}]`);
            return false;
          }
        }
      }
    }
    return true;
  }
  
  private checkIndicatorStability(indicators: any): boolean {
    for (const [name, values] of Object.entries(indicators)) {
      if (Array.isArray(values)) {
        const validValues = values.filter(v => !isNaN(v) && isFinite(v));
        
        if (validValues.length > 10) {
          // Check for extreme volatility
          const changes = validValues.slice(1).map((v, i) => Math.abs(v - validValues[i]));
          const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
          const maxChange = Math.max(...changes);
          
          if (maxChange > avgChange * 10) {
            console.warn(`[VALIDATOR] ${name} shows extreme volatility`);
            return false;
          }
        }
      }
    }
    return true;
  }
  
  // Logical validation methods
  private checkStrategyLogic(strategy: any): boolean {
    // Check if strategy has required fields
    const requiredFields = ['name', 'symbol', 'timeframe'];
    for (const field of requiredFields) {
      if (!strategy[field]) {
        console.error(`[VALIDATOR] Missing required field: ${field}`);
        return false;
      }
    }
    
    // Check strategy type specific logic
    if (strategy.strategy_type === 'market_sentiment_trend_gauge') {
      return this.validateMSTGStrategy(strategy);
    } else if (strategy.strategy_type === 'ath_guard_scalping') {
      return this.validateATHGuardStrategy(strategy);
    } else if (strategy.strategy_type === '4h_reentry') {
      return this.validate4hReentryStrategy(strategy);
    }
    
    return true;
  }
  
  private validateMSTGStrategy(strategy: any): boolean {
    const requiredWeights = ['weight_momentum', 'weight_trend', 'weight_volatility', 'weight_relative'];
    const requiredThresholds = ['long_threshold', 'short_threshold', 'exit_threshold'];
    
    // Check weights sum to 1
    const totalWeight = requiredWeights.reduce((sum, field) => sum + (strategy[field] || 0), 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      console.error(`[VALIDATOR] MSTG weights must sum to 1, got ${totalWeight}`);
      return false;
    }
    
    // Check thresholds are reasonable
    for (const threshold of requiredThresholds) {
      const value = strategy[threshold];
      if (value < -100 || value > 100) {
        console.error(`[VALIDATOR] MSTG threshold ${threshold} out of range: ${value}`);
        return false;
      }
    }
    
    return true;
  }
  
  private validateATHGuardStrategy(strategy: any): boolean {
    const requiredParams = [
      'ema_slope_threshold', 'pullback_tolerance', 'volume_multiplier',
      'stoch_oversold', 'stoch_overbought', 'rsi_oversold', 'rsi_overbought'
    ];
    
    for (const param of requiredParams) {
      if (strategy[param] === undefined || strategy[param] === null) {
        console.error(`[VALIDATOR] ATH Guard missing parameter: ${param}`);
        return false;
      }
    }
    
    // Check parameter ranges
    if (strategy.ema_slope_threshold < 0 || strategy.ema_slope_threshold > 10) {
      console.error(`[VALIDATOR] ATH Guard EMA slope threshold out of range: ${strategy.ema_slope_threshold}`);
      return false;
    }
    
    if (strategy.volume_multiplier < 1 || strategy.volume_multiplier > 10) {
      console.error(`[VALIDATOR] ATH Guard volume multiplier out of range: ${strategy.volume_multiplier}`);
      return false;
    }
    
    return true;
  }
  
  private validate4hReentryStrategy(strategy: any): boolean {
    // Check time-based parameters
    if (strategy.session_start && strategy.session_end) {
      const startTime = new Date(`2000-01-01T${strategy.session_start}`);
      const endTime = new Date(`2000-01-01T${strategy.session_end}`);
      
      if (startTime >= endTime) {
        console.error(`[VALIDATOR] 4h Reentry session times invalid: ${strategy.session_start} >= ${strategy.session_end}`);
        return false;
      }
    }
    
    return true;
  }
  
  private checkConditionConflicts(strategy: any): boolean {
    // Check for conflicting buy/sell conditions
    if (strategy.entry_conditions && strategy.exit_conditions) {
      const entryConditions = strategy.entry_conditions;
      const exitConditions = strategy.exit_conditions;
      
      // Look for contradictory conditions
      for (const entry of entryConditions) {
        for (const exit of exitConditions) {
          if (entry.indicator_type === exit.indicator_type && 
              entry.operator === exit.operator && 
              entry.value === exit.value) {
            console.warn(`[VALIDATOR] Potential conflicting conditions: entry and exit use same ${entry.indicator_type} condition`);
            return false;
          }
        }
      }
    }
    
    return true;
  }
  
  private checkThresholds(strategy: any): boolean {
    const thresholdFields = [
      'long_threshold', 'short_threshold', 'exit_threshold', 'extreme_threshold',
      'stop_loss_percent', 'take_profit_percent'
    ];
    
    for (const field of thresholdFields) {
      if (strategy[field] !== undefined) {
        const value = strategy[field];
        
        // Check for reasonable ranges
        if (field.includes('threshold') && (value < -100 || value > 100)) {
          console.warn(`[VALIDATOR] Threshold ${field} out of reasonable range: ${value}`);
          return false;
        }
        
        if (field.includes('percent') && (value < 0 || value > 100)) {
          console.warn(`[VALIDATOR] Percentage ${field} out of range: ${value}`);
          return false;
        }
      }
    }
    
    return true;
  }
  
  // Performance validation methods
  private checkIndicatorPerformance(indicators: any): boolean {
    // Check if indicators are calculated efficiently
    const startTime = performance.now();
    
    // Simulate indicator calculation
    for (const [name, values] of Object.entries(indicators)) {
      if (Array.isArray(values)) {
        // Simple performance check
        const validValues = values.filter(v => !isNaN(v) && isFinite(v));
        if (validValues.length > 10000) {
          console.warn(`[VALIDATOR] Large dataset for ${name}: ${validValues.length} values`);
        }
      }
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    if (duration > 100) { // 100ms threshold
      console.warn(`[VALIDATOR] Indicator calculation took ${duration.toFixed(2)}ms`);
      return false;
    }
    
    return true;
  }
  
  private checkMemoryUsage(data: any): boolean {
    // Simple memory usage check
    const dataSize = JSON.stringify(data).length;
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (dataSize > maxSize) {
      console.warn(`[VALIDATOR] Large data size: ${(dataSize / 1024 / 1024).toFixed(2)}MB`);
      return false;
    }
    
    return true;
  }
  
  // Safety validation methods
  private checkRiskManagement(strategy: any): boolean {
    // Check stop loss and take profit
    if (strategy.stop_loss_percent && strategy.take_profit_percent) {
      if (strategy.stop_loss_percent >= strategy.take_profit_percent) {
        console.error(`[VALIDATOR] Stop loss (${strategy.stop_loss_percent}%) should be less than take profit (${strategy.take_profit_percent}%)`);
        return false;
      }
    }
    
    // Check position size
    if (strategy.position_size_percent && strategy.position_size_percent > 100) {
      console.error(`[VALIDATOR] Position size cannot exceed 100%: ${strategy.position_size_percent}%`);
      return false;
    }
    
    return true;
  }
  
  private checkPositionSizing(strategy: any): boolean {
    // Check for reasonable position sizing
    if (strategy.position_size_percent) {
      if (strategy.position_size_percent < 1) {
        console.warn(`[VALIDATOR] Very small position size: ${strategy.position_size_percent}%`);
        return false;
      }
      
      if (strategy.position_size_percent > 50) {
        console.warn(`[VALIDATOR] Large position size: ${strategy.position_size_percent}% - consider risk management`);
        return false;
      }
    }
    
    return true;
  }
  
  // Generate recommendations
  private generateRecommendations(strategy: any, errors: string[], warnings: string[], recommendations: string[]): void {
    // Add specific recommendations based on strategy type
    if (strategy.strategy_type === 'market_sentiment_trend_gauge') {
      if (errors.length === 0 && warnings.length === 0) {
        recommendations.push('MSTG strategy validation passed - consider backtesting on historical data');
      }
    }
    
    if (strategy.strategy_type === 'ath_guard_scalping') {
      if (strategy.volume_multiplier < 2) {
        recommendations.push('Consider increasing volume multiplier for better signal quality');
      }
    }
    
    // General recommendations
    if (errors.length === 0) {
      recommendations.push('Strategy passed all validation tests');
    }
    
    if (warnings.length > 0) {
      recommendations.push('Review warnings before deploying strategy');
    }
  }
  
  // Get validation report
  getValidationReport(result: ValidationResult): string {
    let report = `# Strategy Validation Report\n\n`;
    report += `**Score: ${result.score}/100**\n\n`;
    
    if (result.valid) {
      report += `✅ **Strategy is valid and ready for deployment**\n\n`;
    } else {
      report += `❌ **Strategy has validation errors**\n\n`;
    }
    
    if (result.errors.length > 0) {
      report += `## Errors (${result.errors.length})\n`;
      result.errors.forEach(error => report += `- ❌ ${error}\n`);
      report += `\n`;
    }
    
    if (result.warnings.length > 0) {
      report += `## Warnings (${result.warnings.length})\n`;
      result.warnings.forEach(warning => report += `- ⚠️ ${warning}\n`);
      report += `\n`;
    }
    
    if (result.recommendations.length > 0) {
      report += `## Recommendations\n`;
      result.recommendations.forEach(rec => report += `- 💡 ${rec}\n`);
      report += `\n`;
    }
    
    return report;
  }
}

// Export validator instance
export const strategyValidator = new StrategyValidator();
