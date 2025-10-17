// Hybrid Data Manager
// Manages data sources for hybrid trading mode (mainnet data + testnet API)

import { HybridTradingConfig, DataSourceSelector, DataQualityManager, TradingModeManager, DEFAULT_HYBRID_CONFIG } from './hybrid-trading-config.ts';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_time: number;
  close_time: number;
}

interface MarketDataRequest {
  symbol: string;
  timeframe: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

interface DataSourceResult {
  data: Candle[];
  source: 'mainnet' | 'testnet' | 'cache';
  timestamp: number;
  quality: 'high' | 'medium' | 'low';
  warnings: string[];
}

export class HybridDataManager {
  private config: HybridTradingConfig;
  private dataSelector: DataSourceSelector;
  private qualityManager: DataQualityManager;
  private modeManager: TradingModeManager;
  private cache: Map<string, DataSourceResult> = new Map();
  
  constructor(
    config: HybridTradingConfig, 
    exchangeType: 'binance' | 'bybit'
  ) {
    this.config = config;
    this.dataSelector = new DataSourceSelector(config, exchangeType);
    this.qualityManager = new DataQualityManager(config);
    this.modeManager = new TradingModeManager(config, exchangeType);
  }
  
  // Main method to get market data
  async getMarketData(request: MarketDataRequest): Promise<DataSourceResult> {
    const cacheKey = this.generateCacheKey(request);
    
    // Check cache first
    if (this.config.cacheIndicators && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (this.isCacheValid(cached)) {
        console.log(`[HYBRID] Using cached data for ${request.symbol} ${request.timeframe}`);
        return cached;
      }
    }
    
    // Get data from appropriate source
    let result: DataSourceResult;
    
    if (this.config.useMainnetData) {
      result = await this.getMainnetData(request);
    } else {
      result = await this.getTestnetData(request);
    }
    
    // Validate data quality
    const validation = this.qualityManager.validateCandleData(result.data);
    if (!validation.valid) {
      console.warn(`[HYBRID] Data validation failed: ${validation.errors.join(', ')}`);
      result.quality = 'low';
      result.warnings.push(...validation.errors);
    }
    
    // Check data integrity
    const integrity = this.qualityManager.checkDataIntegrity(result.data);
    if (!integrity.integrity) {
      console.warn(`[HYBRID] Data integrity issues: ${integrity.issues.join(', ')}`);
      result.quality = 'medium';
      result.warnings.push(...integrity.issues);
    }
    
    // Cache result
    if (this.config.cacheIndicators) {
      this.cache.set(cacheKey, result);
    }
    
    return result;
  }
  
  // Get data from mainnet (high accuracy)
  private async getMainnetData(request: MarketDataRequest): Promise<DataSourceResult> {
    console.log(`[HYBRID] Fetching mainnet data for ${request.symbol} ${request.timeframe}`);
    
    try {
      const endpoint = this.dataSelector.getDataEndpoint();
      const url = this.buildDataURL(endpoint, request);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Mainnet data fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      const candles = this.parseCandles(data);
      
      return {
        data: candles,
        source: 'mainnet',
        timestamp: Date.now(),
        quality: 'high',
        warnings: []
      };
      
    } catch (error) {
      console.error(`[HYBRID] Mainnet data fetch failed:`, error);
      
      // Fallback to testnet if mainnet fails
      if (this.config.useTestnetAPI) {
        console.log(`[HYBRID] Falling back to testnet data`);
        return await this.getTestnetData(request);
      }
      
      throw error;
    }
  }
  
  // Get data from testnet (lower accuracy but safe)
  private async getTestnetData(request: MarketDataRequest): Promise<DataSourceResult> {
    console.log(`[HYBRID] Fetching testnet data for ${request.symbol} ${request.timeframe}`);
    
    try {
      const endpoint = this.dataSelector.getDataEndpoint();
      const url = this.buildDataURL(endpoint, request);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Testnet data fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      const candles = this.parseCandles(data);
      
      return {
        data: candles,
        source: 'testnet',
        timestamp: Date.now(),
        quality: 'medium',
        warnings: ['Using testnet data - may not reflect real market conditions']
      };
      
    } catch (error) {
      console.error(`[HYBRID] Testnet data fetch failed:`, error);
      throw error;
    }
  }
  
  // Build data URL for exchange API
  private buildDataURL(endpoint: string, request: MarketDataRequest): string {
    const params = new URLSearchParams({
      symbol: request.symbol,
      interval: request.timeframe,
      limit: (request.limit || 500).toString()
    });
    
    if (request.startTime) {
      params.append('startTime', request.startTime.toString());
    }
    
    if (request.endTime) {
      params.append('endTime', request.endTime.toString());
    }
    
    return `${endpoint}/fapi/v1/klines?${params.toString()}`;
  }
  
  // Parse exchange API response to candles
  private parseCandles(data: any[]): Candle[] {
    return data.map((kline: any) => ({
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      open_time: kline[0],
      close_time: kline[6]
    }));
  }
  
  // Generate cache key
  private generateCacheKey(request: MarketDataRequest): string {
    return `${request.symbol}_${request.timeframe}_${request.startTime || 'latest'}_${request.limit || 500}`;
  }
  
  // Check if cache is valid
  private isCacheValid(cached: DataSourceResult): boolean {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    return Date.now() - cached.timestamp < maxAge;
  }
  
  // Get current trading mode info
  getTradingModeInfo(): {
    mode: string;
    description: string;
    dataSource: string;
    riskLevel: string;
    realMoney: boolean;
    warnings: string[];
  } {
    const mode = this.modeManager.getCurrentMode();
    const validation = this.modeManager.validateConfiguration();
    
    return {
      mode: mode.mode,
      description: mode.description,
      dataSource: mode.dataSource,
      riskLevel: mode.riskLevel,
      realMoney: mode.realMoney,
      warnings: validation.warnings
    };
  }
  
  // Get data source statistics
  getDataSourceStats(): {
    totalRequests: number;
    cacheHits: number;
    mainnetRequests: number;
    testnetRequests: number;
    averageQuality: number;
  } {
    const stats = {
      totalRequests: 0,
      cacheHits: 0,
      mainnetRequests: 0,
      testnetRequests: 0,
      averageQuality: 0
    };
    
    for (const [_, result] of this.cache) {
      stats.totalRequests++;
      
      if (result.source === 'cache') {
        stats.cacheHits++;
      } else if (result.source === 'mainnet') {
        stats.mainnetRequests++;
      } else if (result.source === 'testnet') {
        stats.testnetRequests++;
      }
      
      const qualityScore = result.quality === 'high' ? 3 : result.quality === 'medium' ? 2 : 1;
      stats.averageQuality += qualityScore;
    }
    
    if (stats.totalRequests > 0) {
      stats.averageQuality /= stats.totalRequests;
    }
    
    return stats;
  }
  
  // Clear cache
  clearCache(): void {
    this.cache.clear();
    console.log('[HYBRID] Cache cleared');
  }
  
  // Get cache size
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Factory function to create hybrid data manager
export function createHybridDataManager(
  config: HybridTradingConfig,
  exchangeType: 'binance' | 'bybit' = 'binance'
): HybridDataManager {
  return new HybridDataManager(config, exchangeType);
}

// Utility function to get optimal configuration
export function getOptimalHybridConfig(
  userRiskTolerance: 'low' | 'medium' | 'high',
  testingMode: boolean = true
): HybridTradingConfig {
  const baseConfig = { ...DEFAULT_HYBRID_CONFIG };
  
  switch (userRiskTolerance) {
    case 'low':
      return {
        ...baseConfig,
        paperTradingMode: true,
        maxPositionSize: 100,
        maxDailyTrades: 5,
        riskWarningThreshold: 2
      };
      
    case 'medium':
      return {
        ...baseConfig,
        paperTradingMode: !testingMode,
        maxPositionSize: 1000,
        maxDailyTrades: 20,
        riskWarningThreshold: 5
      };
      
    case 'high':
      return {
        ...baseConfig,
        paperTradingMode: false,
        maxPositionSize: 10000,
        maxDailyTrades: 100,
        riskWarningThreshold: 10
      };
      
    default:
      return baseConfig;
  }
}
