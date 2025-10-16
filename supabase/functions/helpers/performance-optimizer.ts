// Performance Optimizer
// Advanced caching and optimization for backtesting and monitoring

interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  strategy: 'lru' | 'fifo' | 'ttl';
}

interface IndicatorCache {
  [key: string]: {
    data: number[];
    timestamp: number;
    ttl: number;
  };
}

interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  cacheHits: number;
  cacheMisses: number;
  indicatorsCalculated: number;
  candlesProcessed: number;
}

export class PerformanceOptimizer {
  private indicatorCache: IndicatorCache = {};
  private config: CacheConfig;
  private metrics: PerformanceMetrics;
  
  constructor(config: CacheConfig = {
    maxSize: 1000,
    ttl: 300000, // 5 minutes
    strategy: 'lru'
  }) {
    this.config = config;
    this.metrics = {
      executionTime: 0,
      memoryUsage: 0,
      cacheHits: 0,
      cacheMisses: 0,
      indicatorsCalculated: 0,
      candlesProcessed: 0
    };
  }
  
  // Optimized indicator calculation with caching
  async calculateIndicator(
    type: string,
    candles: Candle[],
    params: any,
    forceRecalculate: boolean = false
  ): Promise<number[]> {
    const cacheKey = this.buildCacheKey(type, candles.length, params);
    const startTime = performance.now();
    
    // Check cache first
    if (!forceRecalculate && this.indicatorCache[cacheKey]) {
      const cached = this.indicatorCache[cacheKey];
      if (Date.now() - cached.timestamp < cached.ttl) {
        this.metrics.cacheHits++;
        return cached.data;
      } else {
        // Cache expired, remove it
        delete this.indicatorCache[cacheKey];
      }
    }
    
    this.metrics.cacheMisses++;
    
    // Calculate indicator
    let result: number[];
    
    switch (type) {
      case 'rsi':
        result = this.calculateRSIOptimized(candles, params.period || 14);
        break;
      case 'ema':
        result = this.calculateEMAOptimized(candles, params.period || 20);
        break;
      case 'sma':
        result = this.calculateSMAOptimized(candles, params.period || 20);
        break;
      case 'macd':
        const macdResult = this.calculateMACDOptimized(candles, params);
        result = macdResult.macd;
        break;
      case 'bollinger':
        const bbResult = this.calculateBollingerOptimized(candles, params);
        result = bbResult.upper;
        break;
      case 'atr':
        result = this.calculateATROptimized(candles, params.period || 14);
        break;
      case 'stochastic':
        const stochResult = this.calculateStochasticOptimized(candles, params);
        result = stochResult.k;
        break;
      default:
        throw new Error(`Unknown indicator type: ${type}`);
    }
    
    // Cache the result
    this.indicatorCache[cacheKey] = {
      data: result,
      timestamp: Date.now(),
      ttl: this.config.ttl
    };
    
    // Clean cache if it's too large
    this.cleanCache();
    
    this.metrics.indicatorsCalculated++;
    this.metrics.executionTime += performance.now() - startTime;
    
    return result;
  }
  
  // Optimized RSI calculation
  private calculateRSIOptimized(candles: Candle[], period: number): number[] {
    const closes = candles.map(c => c.close);
    const result: number[] = [];
    
    if (closes.length < period + 1) {
      return new Array(closes.length).fill(NaN);
    }
    
    // Calculate price changes
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }
    
    // Calculate gains and losses
    const gains: number[] = changes.map(c => c > 0 ? c : 0);
    const losses: number[] = changes.map(c => c < 0 ? -c : 0);
    
    // Calculate initial averages
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // First RSI value
    const firstRSI = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    result.push(firstRSI);
    
    // Calculate remaining RSI values using Wilder's smoothing
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      
      const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
      result.push(rsi);
    }
    
    return result;
  }
  
  // Optimized EMA calculation
  private calculateEMAOptimized(candles: Candle[], period: number): number[] {
    const closes = candles.map(c => c.close);
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    
    if (closes.length < period) {
      return new Array(closes.length).fill(NaN);
    }
    
    // Calculate initial SMA
    let sma = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(sma);
    
    // Calculate EMA values
    for (let i = period; i < closes.length; i++) {
      sma = (closes[i] - sma) * multiplier + sma;
      result.push(sma);
    }
    
    return result;
  }
  
  // Optimized SMA calculation
  private calculateSMAOptimized(candles: Candle[], period: number): number[] {
    const closes = candles.map(c => c.close);
    const result: number[] = [];
    
    if (closes.length < period) {
      return new Array(closes.length).fill(NaN);
    }
    
    // Calculate first SMA
    let sum = closes.slice(0, period).reduce((a, b) => a + b, 0);
    result.push(sum / period);
    
    // Calculate remaining SMAs using sliding window
    for (let i = period; i < closes.length; i++) {
      sum = sum - closes[i - period] + closes[i];
      result.push(sum / period);
    }
    
    return result;
  }
  
  // Optimized MACD calculation
  private calculateMACDOptimized(candles: Candle[], params: any): { macd: number[], signal: number[], histogram: number[] } {
    const closes = candles.map(c => c.close);
    const fastPeriod = params.fastPeriod || 12;
    const slowPeriod = params.slowPeriod || 26;
    const signalPeriod = params.signalPeriod || 9;
    
    const fastEMA = this.calculateEMAOptimized(candles, fastPeriod);
    const slowEMA = this.calculateEMAOptimized(candles, slowPeriod);
    
    const macd: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i >= slowPeriod - 1) {
        macd.push(fastEMA[i] - slowEMA[i]);
      } else {
        macd.push(NaN);
      }
    }
    
    // Calculate signal line (EMA of MACD)
    const signal = this.calculateEMAOptimized(
      { map: () => macd } as any, 
      signalPeriod
    );
    
    // Calculate histogram
    const histogram: number[] = [];
    for (let i = 0; i < macd.length; i++) {
      if (i >= slowPeriod + signalPeriod - 2) {
        histogram.push(macd[i] - signal[i]);
      } else {
        histogram.push(NaN);
      }
    }
    
    return { macd, signal, histogram };
  }
  
  // Optimized Bollinger Bands calculation
  private calculateBollingerOptimized(candles: Candle[], params: any): { upper: number[], middle: number[], lower: number[] } {
    const closes = candles.map(c => c.close);
    const period = params.period || 20;
    const deviation = params.deviation || 2;
    
    const sma = this.calculateSMAOptimized(candles, period);
    const upper: number[] = [];
    const lower: number[] = [];
    
    for (let i = 0; i < closes.length; i++) {
      if (i >= period - 1) {
        // Calculate standard deviation
        const slice = closes.slice(i - period + 1, i + 1);
        const mean = sma[i];
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        
        upper.push(mean + (deviation * stdDev));
        lower.push(mean - (deviation * stdDev));
      } else {
        upper.push(NaN);
        lower.push(NaN);
      }
    }
    
    return { upper, middle: sma, lower };
  }
  
  // Optimized ATR calculation
  private calculateATROptimized(candles: Candle[], period: number): number[] {
    const result: number[] = [];
    
    if (candles.length < period + 1) {
      return new Array(candles.length).fill(NaN);
    }
    
    // Calculate True Range
    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      tr.push(Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      ));
    }
    
    // Calculate ATR using EMA
    const atr = this.calculateEMAOptimized(
      { map: () => tr } as any,
      period
    );
    
    return [NaN, ...atr]; // First value is NaN
  }
  
  // Optimized Stochastic calculation
  private calculateStochasticOptimized(candles: Candle[], params: any): { k: number[], d: number[] } {
    const period = params.period || 14;
    const kSmoothing = params.kSmoothing || 3;
    const dSmoothing = params.dSmoothing || 3;
    
    const k: number[] = [];
    const d: number[] = [];
    
    for (let i = period - 1; i < candles.length; i++) {
      const slice = candles.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const close = candles[i].close;
      
      const kValue = ((close - low) / (high - low)) * 100;
      k.push(kValue);
    }
    
    // Calculate %D (SMA of %K)
    for (let i = dSmoothing - 1; i < k.length; i++) {
      const slice = k.slice(i - dSmoothing + 1, i + 1);
      const dValue = slice.reduce((a, b) => a + b, 0) / dSmoothing;
      d.push(dValue);
    }
    
    return { k, d };
  }
  
  // Build cache key
  private buildCacheKey(type: string, length: number, params: any): string {
    const paramStr = JSON.stringify(params);
    return `${type}_${length}_${paramStr}`;
  }
  
  // Clean cache based on strategy
  private cleanCache(): void {
    const keys = Object.keys(this.indicatorCache);
    
    if (keys.length <= this.config.maxSize) {
      return;
    }
    
    switch (this.config.strategy) {
      case 'lru':
        // Remove least recently used
        const sortedKeys = keys.sort((a, b) => 
          this.indicatorCache[a].timestamp - this.indicatorCache[b].timestamp
        );
        const toRemove = sortedKeys.slice(0, keys.length - this.config.maxSize);
        toRemove.forEach(key => delete this.indicatorCache[key]);
        break;
        
      case 'fifo':
        // Remove oldest
        const oldestKey = keys.reduce((oldest, key) => 
          this.indicatorCache[key].timestamp < this.indicatorCache[oldest].timestamp ? key : oldest
        );
        delete this.indicatorCache[oldestKey];
        break;
        
      case 'ttl':
        // Remove expired
        const now = Date.now();
        keys.forEach(key => {
          if (now - this.indicatorCache[key].timestamp > this.indicatorCache[key].ttl) {
            delete this.indicatorCache[key];
          }
        });
        break;
    }
  }
  
  // Batch process indicators for multiple strategies
  async batchCalculateIndicators(
    strategies: any[],
    candles: Candle[]
  ): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const startTime = performance.now();
    
    // Collect all unique indicator requirements
    const indicatorRequirements = new Set<string>();
    strategies.forEach(strategy => {
      if (strategy.conditions) {
        strategy.conditions.forEach((condition: any) => {
          indicatorRequirements.add(condition.indicator_type);
        });
      }
    });
    
    // Calculate all required indicators in parallel
    const promises = Array.from(indicatorRequirements).map(async (indicatorType) => {
      const result = await this.calculateIndicator(indicatorType, candles, {});
      return { type: indicatorType, data: result };
    });
    
    const indicatorResults = await Promise.all(promises);
    
    // Store results
    indicatorResults.forEach(({ type, data }) => {
      results.set(type, data);
    });
    
    this.metrics.executionTime = performance.now() - startTime;
    this.metrics.candlesProcessed = candles.length;
    
    return results;
  }
  
  // Get performance metrics
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
  
  // Reset metrics
  resetMetrics(): void {
    this.metrics = {
      executionTime: 0,
      memoryUsage: 0,
      cacheHits: 0,
      cacheMisses: 0,
      indicatorsCalculated: 0,
      candlesProcessed: 0
    };
  }
  
  // Get cache statistics
  getCacheStats(): {
    size: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = totalRequests > 0 ? this.metrics.cacheHits / totalRequests : 0;
    
    return {
      size: Object.keys(this.indicatorCache).length,
      hitRate,
      memoryUsage: this.metrics.memoryUsage
    };
  }
  
  // Clear cache
  clearCache(): void {
    this.indicatorCache = {};
  }
}

// Export singleton instance
export const performanceOptimizer = new PerformanceOptimizer();
