// Performance Optimizer - Reduces API calls and improves speed
export class PerformanceOptimizer {
  private static cache = new Map<string, any>();
  private static cacheExpiry = new Map<string, number>();
  private static readonly CACHE_TTL = 30000; // 30 seconds

  // Cache market data to reduce API calls
  static async getCachedMarketData(symbol: string, timeframe: string) {
    const cacheKey = `market_${symbol}_${timeframe}`;
    const cached = this.cache.get(cacheKey);
    const expiry = this.cacheExpiry.get(cacheKey);
    
    if (cached && expiry && Date.now() < expiry) {
      console.log(`[CACHE HIT] Market data for ${symbol}`);
      return cached;
    }
    
    console.log(`[CACHE MISS] Fetching market data for ${symbol}`);
    return null;
  }

  // Set cached market data
  static setCachedMarketData(symbol: string, timeframe: string, data: any) {
    const cacheKey = `market_${symbol}_${timeframe}`;
    this.cache.set(cacheKey, data);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);
  }

  // Cache indicator calculations
  static getCachedIndicators(symbol: string, timeframe: string, period: number) {
    const cacheKey = `indicators_${symbol}_${timeframe}_${period}`;
    const cached = this.cache.get(cacheKey);
    const expiry = this.cacheExpiry.get(cacheKey);
    
    if (cached && expiry && Date.now() < expiry) {
      console.log(`[CACHE HIT] Indicators for ${symbol}`);
      return cached;
    }
    
    return null;
  }

  // Set cached indicators
  static setCachedIndicators(symbol: string, timeframe: string, period: number, data: any) {
    const cacheKey = `indicators_${symbol}_${timeframe}_${period}`;
    this.cache.set(cacheKey, data);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);
  }

  // Batch API requests
  static async batchRequests(requests: Array<() => Promise<any>>) {
    console.log(`[BATCH] Processing ${requests.length} requests`);
    const startTime = performance.now();
    
    const results = await Promise.all(requests);
    
    const endTime = performance.now();
    console.log(`[BATCH] Completed in ${endTime - startTime}ms`);
    
    return results;
  }

  // Optimize database queries
  static buildOptimizedQuery(baseQuery: any, filters: Record<string, any>) {
    let query = baseQuery;
    
    // Add indexes for frequently queried columns
    if (filters.symbol) {
      query = query.eq('symbol', filters.symbol);
    }
    
    if (filters.timeframe) {
      query = query.eq('timeframe', filters.timeframe);
    }
    
    // Add pagination for large datasets
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1);
    }
    
    return query;
  }

  // Clear expired cache entries
  static clearExpiredCache() {
    const now = Date.now();
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }

  // Get cache statistics
  static getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
      memoryUsage: JSON.stringify(Array.from(this.cache.values())).length
    };
  }
}

// Auto-cleanup expired cache every 5 minutes
setInterval(() => {
  PerformanceOptimizer.clearExpiredCache();
}, 300000);
