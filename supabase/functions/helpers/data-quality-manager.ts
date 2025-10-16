// Data Quality Manager
// Comprehensive data validation, cleaning, and error handling

interface DataQualityConfig {
  validation: {
    priceRange: { min: number; max: number };
    volumeRange: { min: number; max: number };
    timeRange: { maxGap: number; maxAge: number };
    outliers: { enabled: boolean; threshold: number };
  };
  cleaning: {
    removeDuplicates: boolean;
    fillGaps: boolean;
    smoothSpikes: boolean;
    normalizeVolume: boolean;
  };
  monitoring: {
    realTimeValidation: boolean;
    alertThresholds: {
      errorRate: number;
      dataGaps: number;
      outliers: number;
    };
  };
}

interface DataQualityReport {
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  score: number; // 0-100
  issues: DataIssue[];
  recommendations: string[];
  metrics: {
    completeness: number;
    accuracy: number;
    consistency: number;
    timeliness: number;
  };
}

interface DataIssue {
  type: 'missing' | 'duplicate' | 'outlier' | 'invalid' | 'gap' | 'delay';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  count: number;
  affectedData: any[];
  suggestions: string[];
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_time: number;
  close_time: number;
}

export class DataQualityManager {
  private config: DataQualityConfig;
  private validationRules: Map<string, Function> = new Map();
  
  constructor(config: DataQualityConfig) {
    this.config = config;
    this.initializeValidationRules();
  }
  
  private initializeValidationRules(): void {
    // Price validation rules
    this.validationRules.set('price_range', (candle: Candle) => {
      const { open, high, low, close } = candle;
      const { min, max } = this.config.validation.priceRange;
      
      return {
        valid: open >= min && open <= max && 
               high >= min && high <= max && 
               low >= min && low <= max && 
               close >= min && close <= max,
        issue: 'Price out of range'
      };
    });
    
    // Volume validation rules
    this.validationRules.set('volume_range', (candle: Candle) => {
      const { volume } = candle;
      const { min, max } = this.config.validation.volumeRange;
      
      return {
        valid: volume >= min && volume <= max,
        issue: 'Volume out of range'
      };
    });
    
    // OHLC consistency rules
    this.validationRules.set('ohlc_consistency', (candle: Candle) => {
      const { open, high, low, close } = candle;
      
      return {
        valid: high >= Math.max(open, close) && low <= Math.min(open, close),
        issue: 'OHLC inconsistency'
      };
    });
    
    // Time validation rules
    this.validationRules.set('time_consistency', (candle: Candle, prevCandle?: Candle) => {
      if (!prevCandle) return { valid: true, issue: '' };
      
      const timeGap = candle.open_time - prevCandle.close_time;
      const maxGap = this.config.validation.timeRange.maxGap;
      
      return {
        valid: timeGap >= 0 && timeGap <= maxGap,
        issue: 'Time gap too large'
      };
    });
    
    // Outlier detection
    this.validationRules.set('outlier_detection', (candle: Candle, candles: Candle[]) => {
      if (!this.config.validation.outliers.enabled || candles.length < 10) {
        return { valid: true, issue: '' };
      }
      
      const recentCandles = candles.slice(-20);
      const prices = recentCandles.map(c => c.close);
      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      const stdDev = Math.sqrt(prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length);
      const threshold = this.config.validation.outliers.threshold;
      
      const zScore = Math.abs(candle.close - mean) / stdDev;
      
      return {
        valid: zScore <= threshold,
        issue: 'Outlier detected'
      };
    });
  }
  
  // Validate single candle
  validateCandle(candle: Candle, prevCandle?: Candle, candles?: Candle[]): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    for (const [ruleName, rule] of this.validationRules) {
      const result = rule(candle, prevCandle, candles);
      if (!result.valid) {
        issues.push(`${ruleName}: ${result.issue}`);
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  // Validate dataset
  validateDataset(candles: Candle[]): DataQualityReport {
    const issues: DataIssue[] = [];
    let validCandles = 0;
    let totalCandles = candles.length;
    
    // Check for missing data
    const missingData = this.detectMissingData(candles);
    if (missingData.length > 0) {
      issues.push({
        type: 'missing',
        severity: 'high',
        description: `Missing ${missingData.length} data points`,
        count: missingData.length,
        affectedData: missingData,
        suggestions: ['Implement data gap filling', 'Check data source connectivity']
      });
    }
    
    // Check for duplicates
    const duplicates = this.detectDuplicates(candles);
    if (duplicates.length > 0) {
      issues.push({
        type: 'duplicate',
        severity: 'medium',
        description: `Found ${duplicates.length} duplicate entries`,
        count: duplicates.length,
        affectedData: duplicates,
        suggestions: ['Remove duplicate entries', 'Check data source for duplicates']
      });
    }
    
    // Check for outliers
    const outliers = this.detectOutliers(candles);
    if (outliers.length > 0) {
      issues.push({
        type: 'outlier',
        severity: 'medium',
        description: `Found ${outliers.length} outliers`,
        count: outliers.length,
        affectedData: outliers,
        suggestions: ['Review outlier data', 'Consider smoothing or removal']
      });
    }
    
    // Check for time gaps
    const gaps = this.detectTimeGaps(candles);
    if (gaps.length > 0) {
      issues.push({
        type: 'gap',
        severity: 'high',
        description: `Found ${gaps.length} time gaps`,
        count: gaps.length,
        affectedData: gaps,
        suggestions: ['Fill time gaps', 'Check data source for missing periods']
      });
    }
    
    // Validate each candle
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const prevCandle = i > 0 ? candles[i - 1] : undefined;
      const validation = this.validateCandle(candle, prevCandle, candles);
      
      if (validation.valid) {
        validCandles++;
      } else {
        issues.push({
          type: 'invalid',
          severity: 'high',
          description: `Invalid candle at index ${i}: ${validation.issues.join(', ')}`,
          count: 1,
          affectedData: [candle],
          suggestions: ['Review data source', 'Implement data cleaning']
        });
      }
    }
    
    // Calculate quality score
    const completeness = this.calculateCompleteness(candles);
    const accuracy = validCandles / totalCandles;
    const consistency = this.calculateConsistency(candles);
    const timeliness = this.calculateTimeliness(candles);
    
    const overallScore = (completeness + accuracy + consistency + timeliness) / 4;
    
    let overall: 'excellent' | 'good' | 'fair' | 'poor';
    if (overallScore >= 90) overall = 'excellent';
    else if (overallScore >= 75) overall = 'good';
    else if (overallScore >= 60) overall = 'fair';
    else overall = 'poor';
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, overallScore);
    
    return {
      overall,
      score: overallScore,
      issues,
      recommendations,
      metrics: {
        completeness,
        accuracy,
        consistency,
        timeliness
      }
    };
  }
  
  // Clean dataset
  cleanDataset(candles: Candle[]): {
    cleaned: Candle[];
    removed: Candle[];
    filled: Candle[];
  } {
    let cleaned = [...candles];
    const removed: Candle[] = [];
    const filled: Candle[] = [];
    
    // Remove duplicates if enabled
    if (this.config.cleaning.removeDuplicates) {
      const { cleaned: deduplicated, removed: duplicates } = this.removeDuplicates(cleaned);
      cleaned = deduplicated;
      removed.push(...duplicates);
    }
    
    // Remove outliers if enabled
    if (this.config.validation.outliers.enabled) {
      const { cleaned: withoutOutliers, removed: outliers } = this.removeOutliers(cleaned);
      cleaned = withoutOutliers;
      removed.push(...outliers);
    }
    
    // Fill gaps if enabled
    if (this.config.cleaning.fillGaps) {
      const { cleaned: withGapsFilled, filled: gapFills } = this.fillGaps(cleaned);
      cleaned = withGapsFilled;
      filled.push(...gapFills);
    }
    
    // Smooth spikes if enabled
    if (this.config.cleaning.smoothSpikes) {
      cleaned = this.smoothSpikes(cleaned);
    }
    
    // Normalize volume if enabled
    if (this.config.cleaning.normalizeVolume) {
      cleaned = this.normalizeVolume(cleaned);
    }
    
    return { cleaned, removed, filled };
  }
  
  // Detect missing data
  private detectMissingData(candles: Candle[]): Candle[] {
    const missing: Candle[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];
      
      // Check for missing candles based on expected timeframe
      const expectedGap = this.getExpectedTimeGap(candles);
      const actualGap = current.open_time - previous.close_time;
      
      if (actualGap > expectedGap * 1.5) {
        // Potential missing data
        const missingCount = Math.floor(actualGap / expectedGap) - 1;
        for (let j = 1; j <= missingCount; j++) {
          const missingTime = previous.close_time + (expectedGap * j);
          missing.push({
            open: previous.close,
            high: previous.close,
            low: previous.close,
            close: previous.close,
            volume: 0,
            open_time: missingTime,
            close_time: missingTime + expectedGap
          });
        }
      }
    }
    
    return missing;
  }
  
  // Detect duplicates
  private detectDuplicates(candles: Candle[]): Candle[] {
    const duplicates: Candle[] = [];
    const seen = new Set<number>();
    
    for (const candle of candles) {
      const key = candle.open_time;
      if (seen.has(key)) {
        duplicates.push(candle);
      } else {
        seen.add(key);
      }
    }
    
    return duplicates;
  }
  
  // Detect outliers
  private detectOutliers(candles: Candle[]): Candle[] {
    const outliers: Candle[] = [];
    
    if (candles.length < 10) return outliers;
    
    const prices = candles.map(c => c.close);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev = Math.sqrt(prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length);
    const threshold = this.config.validation.outliers.threshold;
    
    for (const candle of candles) {
      const zScore = Math.abs(candle.close - mean) / stdDev;
      if (zScore > threshold) {
        outliers.push(candle);
      }
    }
    
    return outliers;
  }
  
  // Detect time gaps
  private detectTimeGaps(candles: Candle[]): Candle[] {
    const gaps: Candle[] = [];
    
    if (candles.length < 2) return gaps;
    
    const expectedGap = this.getExpectedTimeGap(candles);
    
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];
      const actualGap = current.open_time - previous.close_time;
      
      if (actualGap > expectedGap * 2) {
        gaps.push(current);
      }
    }
    
    return gaps;
  }
  
  // Calculate completeness
  private calculateCompleteness(candles: Candle[]): number {
    if (candles.length === 0) return 0;
    
    const expectedGap = this.getExpectedTimeGap(candles);
    const totalExpectedTime = (candles[candles.length - 1].close_time - candles[0].open_time);
    const expectedCandles = Math.floor(totalExpectedTime / expectedGap);
    
    return Math.min(100, (candles.length / expectedCandles) * 100);
  }
  
  // Calculate consistency
  private calculateConsistency(candles: Candle[]): number {
    if (candles.length < 2) return 100;
    
    let consistentCandles = 0;
    
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];
      
      // Check OHLC consistency
      const ohlcValid = current.high >= Math.max(current.open, current.close) && 
                       current.low <= Math.min(current.open, current.close);
      
      // Check time consistency
      const timeValid = current.open_time > previous.close_time;
      
      if (ohlcValid && timeValid) {
        consistentCandles++;
      }
    }
    
    return (consistentCandles / (candles.length - 1)) * 100;
  }
  
  // Calculate timeliness
  private calculateTimeliness(candles: Candle[]): number {
    if (candles.length === 0) return 0;
    
    const now = Date.now();
    const latestCandle = candles[candles.length - 1];
    const age = now - latestCandle.close_time;
    
    // Consider data timely if it's less than 1 hour old
    const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds
    
    return Math.max(0, 100 - (age / maxAge) * 100);
  }
  
  // Generate recommendations
  private generateRecommendations(issues: DataIssue[], score: number): string[] {
    const recommendations: string[] = [];
    
    if (score < 60) {
      recommendations.push('Data quality is poor - immediate attention required');
    }
    
    const issueTypes = new Set(issues.map(i => i.type));
    
    if (issueTypes.has('missing')) {
      recommendations.push('Implement data gap filling strategy');
    }
    
    if (issueTypes.has('duplicate')) {
      recommendations.push('Set up duplicate detection and removal');
    }
    
    if (issueTypes.has('outlier')) {
      recommendations.push('Review outlier detection thresholds');
    }
    
    if (issueTypes.has('gap')) {
      recommendations.push('Check data source connectivity and reliability');
    }
    
    if (issueTypes.has('invalid')) {
      recommendations.push('Implement data validation pipeline');
    }
    
    return recommendations;
  }
  
  // Get expected time gap
  private getExpectedTimeGap(candles: Candle[]): number {
    if (candles.length < 2) return 60000; // Default 1 minute
    
    const gaps = [];
    for (let i = 1; i < Math.min(candles.length, 10); i++) {
      gaps.push(candles[i].open_time - candles[i - 1].close_time);
    }
    
    return gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }
  
  // Remove duplicates
  private removeDuplicates(candles: Candle[]): { cleaned: Candle[]; removed: Candle[] } {
    const seen = new Set<number>();
    const cleaned: Candle[] = [];
    const removed: Candle[] = [];
    
    for (const candle of candles) {
      const key = candle.open_time;
      if (seen.has(key)) {
        removed.push(candle);
      } else {
        seen.add(key);
        cleaned.push(candle);
      }
    }
    
    return { cleaned, removed };
  }
  
  // Remove outliers
  private removeOutliers(candles: Candle[]): { cleaned: Candle[]; removed: Candle[] } {
    const outliers = this.detectOutliers(candles);
    const cleaned = candles.filter(candle => !outliers.includes(candle));
    
    return { cleaned, removed: outliers };
  }
  
  // Fill gaps
  private fillGaps(candles: Candle[]): { cleaned: Candle[]; filled: Candle[] } {
    const filled: Candle[] = [];
    const cleaned: Candle[] = [];
    
    for (let i = 0; i < candles.length; i++) {
      cleaned.push(candles[i]);
      
      if (i < candles.length - 1) {
        const current = candles[i];
        const next = candles[i + 1];
        const expectedGap = this.getExpectedTimeGap(candles);
        const actualGap = next.open_time - current.close_time;
        
        if (actualGap > expectedGap * 1.5) {
          // Fill gap with interpolated data
          const missingCount = Math.floor(actualGap / expectedGap) - 1;
          for (let j = 1; j <= missingCount; j++) {
            const interpolatedTime = current.close_time + (expectedGap * j);
            const interpolatedPrice = current.close + (next.open - current.close) * (j / (missingCount + 1));
            
            const filledCandle: Candle = {
              open: interpolatedPrice,
              high: interpolatedPrice,
              low: interpolatedPrice,
              close: interpolatedPrice,
              volume: 0,
              open_time: interpolatedTime,
              close_time: interpolatedTime + expectedGap
            };
            
            filled.push(filledCandle);
            cleaned.push(filledCandle);
          }
        }
      }
    }
    
    return { cleaned, filled };
  }
  
  // Smooth spikes
  private smoothSpikes(candles: Candle[]): Candle[] {
    return candles.map((candle, index) => {
      if (index === 0 || index === candles.length - 1) return candle;
      
      const prev = candles[index - 1];
      const next = candles[index + 1];
      
      // Simple moving average smoothing
      const smoothedClose = (prev.close + candle.close + next.close) / 3;
      
      return {
        ...candle,
        close: smoothedClose,
        high: Math.max(candle.high, smoothedClose),
        low: Math.min(candle.low, smoothedClose)
      };
    });
  }
  
  // Normalize volume
  private normalizeVolume(candles: Candle[]): Candle[] {
    const volumes = candles.map(c => c.volume);
    const meanVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    return candles.map(candle => ({
      ...candle,
      volume: candle.volume / meanVolume
    }));
  }
}

// Export data quality manager factory
export function createDataQualityManager(config: DataQualityConfig): DataQualityManager {
  return new DataQualityManager(config);
}

// Default data quality configuration
export const defaultDataQualityConfig: DataQualityConfig = {
  validation: {
    priceRange: { min: 0.01, max: 1000000 },
    volumeRange: { min: 0, max: 1000000000 },
    timeRange: { maxGap: 3600000, maxAge: 86400000 }, // 1 hour gap, 1 day age
    outliers: { enabled: true, threshold: 3 }
  },
  cleaning: {
    removeDuplicates: true,
    fillGaps: true,
    smoothSpikes: false,
    normalizeVolume: false
  },
  monitoring: {
    realTimeValidation: true,
    alertThresholds: {
      errorRate: 0.05, // 5%
      dataGaps: 0.1, // 10%
      outliers: 0.02 // 2%
    }
  }
};
