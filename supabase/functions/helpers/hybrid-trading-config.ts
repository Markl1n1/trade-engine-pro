// Hybrid Trading Configuration
// Solves testnet limitations by using mainnet data with testnet API safety

export interface HybridTradingConfig {
  // Data sources
  useMainnetData: boolean;        // Use mainnet for market data (accurate prices/indicators)
  useTestnetAPI: boolean;         // Use testnet for API calls (safe trading)
  
  // Trading modes
  paperTradingMode: boolean;      // Simulate trades without real execution
  realDataSimulation: boolean;   // Use real market data for simulation
  
  // Data synchronization
  syncMainnetData: boolean;       // Sync data from mainnet to local DB
  cacheIndicators: boolean;       // Cache calculated indicators
  
  // Safety features
  maxPositionSize: number;        // Maximum position size in USD
  maxDailyTrades: number;         // Maximum trades per day
  riskWarningThreshold: number;  // Risk warning percentage
  
  // Data quality
  validateDataIntegrity: boolean; // Validate data before use
  handleMissingData: 'skip' | 'interpolate' | 'error'; // How to handle missing candles
  maxDataAge: number;            // Maximum age of data in minutes
}

export interface TradingMode {
  mode: 'testnet' | 'mainnet' | 'hybrid' | 'paper';
  description: string;
  dataSource: 'testnet' | 'mainnet' | 'hybrid';
  apiEndpoint: 'testnet' | 'mainnet' | 'hybrid';
  riskLevel: 'none' | 'low' | 'medium' | 'high';
  realMoney: boolean;
}

// Predefined trading modes
export const TRADING_MODES: Record<string, TradingMode> = {
  'testnet_only': {
    mode: 'testnet',
    description: 'Pure testnet - limited accuracy, safe for testing',
    dataSource: 'testnet',
    apiEndpoint: 'testnet',
    riskLevel: 'none',
    realMoney: false
  },
  
  'mainnet_only': {
    mode: 'mainnet',
    description: 'Pure mainnet - real money, real data, high risk',
    dataSource: 'mainnet',
    apiEndpoint: 'mainnet',
    riskLevel: 'high',
    realMoney: true
  },
  
  'hybrid_safe': {
    mode: 'hybrid',
    description: 'Hybrid mode - real data, testnet API, paper trading',
    dataSource: 'mainnet',
    apiEndpoint: 'testnet',
    riskLevel: 'none',
    realMoney: false
  },
  
  'hybrid_live': {
    mode: 'hybrid',
    description: 'Hybrid live - real data, testnet API, real execution',
    dataSource: 'mainnet',
    apiEndpoint: 'testnet',
    riskLevel: 'low',
    realMoney: true
  },
  
  'paper_trading': {
    mode: 'paper',
    description: 'Paper trading - real data, no real execution',
    dataSource: 'mainnet',
    apiEndpoint: 'testnet',
    riskLevel: 'none',
    realMoney: false
  }
};

// Default hybrid configuration
export const DEFAULT_HYBRID_CONFIG: HybridTradingConfig = {
  useMainnetData: true,
  useTestnetAPI: true,
  paperTradingMode: true,
  realDataSimulation: true,
  syncMainnetData: true,
  cacheIndicators: true,
  maxPositionSize: 1000,
  maxDailyTrades: 10,
  riskWarningThreshold: 5,
  validateDataIntegrity: true,
  handleMissingData: 'interpolate',
  maxDataAge: 5 // 5 minutes
};

// Exchange endpoints configuration
export const EXCHANGE_ENDPOINTS = {
  binance: {
    mainnet: {
      api: 'https://fapi.binance.com',
      ws: 'wss://fstream.binance.com',
      data: 'https://api.binance.com'
    },
    testnet: {
      api: 'https://testnet.binancefuture.com',
      ws: 'wss://stream.binancefuture.com',
      data: 'https://testnet.binance.vision'
    }
  },
  bybit: {
    mainnet: {
      api: 'https://api.bybit.com',
      ws: 'wss://stream.bybit.com',
      data: 'https://api.bybit.com'
    },
    testnet: {
      api: 'https://api-testnet.bybit.com',
      ws: 'wss://stream-testnet.bybit.com',
      data: 'https://api-testnet.bybit.com'
    }
  }
};

// Data source selector
export class DataSourceSelector {
  private config: HybridTradingConfig;
  private exchangeType: 'binance' | 'bybit';
  
  constructor(config: HybridTradingConfig, exchangeType: 'binance' | 'bybit') {
    this.config = config;
    this.exchangeType = exchangeType;
  }
  
  // Get data endpoint (always mainnet for accuracy)
  getDataEndpoint(): string {
    return EXCHANGE_ENDPOINTS[this.exchangeType].mainnet.data;
  }
  
  // Get API endpoint (testnet for safety, mainnet for real trading)
  getAPIEndpoint(): string {
    if (this.config.paperTradingMode) {
      return EXCHANGE_ENDPOINTS[this.exchangeType].testnet.api;
    }
    return this.config.useTestnetAPI 
      ? EXCHANGE_ENDPOINTS[this.exchangeType].testnet.api
      : EXCHANGE_ENDPOINTS[this.exchangeType].mainnet.api;
  }
  
  // Get WebSocket endpoint
  getWebSocketEndpoint(): string {
    if (this.config.paperTradingMode) {
      return EXCHANGE_ENDPOINTS[this.exchangeType].testnet.ws;
    }
    return this.config.useTestnetAPI 
      ? EXCHANGE_ENDPOINTS[this.exchangeType].testnet.ws
      : EXCHANGE_ENDPOINTS[this.exchangeType].mainnet.ws;
  }
  
  // Check if we should use real money
  shouldUseRealMoney(): boolean {
    return !this.config.paperTradingMode && !this.config.useTestnetAPI;
  }
  
  // Get risk level
  getRiskLevel(): 'none' | 'low' | 'medium' | 'high' {
    if (this.config.paperTradingMode) return 'none';
    if (this.config.useTestnetAPI) return 'low';
    return 'high';
  }
}

// Data validation and quality checks
export class DataQualityManager {
  private config: HybridTradingConfig;
  
  constructor(config: HybridTradingConfig) {
    this.config = config;
  }
  
  // Validate candle data
  validateCandleData(candles: any[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!candles || candles.length === 0) {
      errors.push('No candle data provided');
      return { valid: false, errors };
    }
    
    // Check data age
    const now = Date.now();
    const maxAge = this.config.maxDataAge * 60 * 1000; // Convert to milliseconds
    
    for (const candle of candles) {
      const candleTime = new Date(candle.open_time).getTime();
      const age = now - candleTime;
      
      if (age > maxAge) {
        errors.push(`Candle data too old: ${Math.round(age / 60000)} minutes`);
        break;
      }
      
      // Validate candle structure
      if (!candle.open || !candle.high || !candle.low || !candle.close || !candle.volume) {
        errors.push('Invalid candle structure');
        break;
      }
      
      // Validate price relationships
      if (candle.high < candle.low || candle.high < candle.open || candle.high < candle.close) {
        errors.push('Invalid price relationships in candle');
        break;
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  // Handle missing data
  handleMissingData(candles: any[], missingIndices: number[]): any[] {
    if (this.config.handleMissingData === 'error') {
      throw new Error(`Missing data at indices: ${missingIndices.join(', ')}`);
    }
    
    if (this.config.handleMissingData === 'skip') {
      return candles.filter((_, index) => !missingIndices.includes(index));
    }
    
    // Interpolate missing data
    const interpolatedCandles = [...candles];
    
    for (const index of missingIndices) {
      if (index === 0 || index === candles.length - 1) {
        // Use previous/next candle for edge cases
        const referenceCandle = index === 0 ? candles[1] : candles[index - 1];
        interpolatedCandles[index] = { ...referenceCandle };
      } else {
        // Linear interpolation
        const prevCandle = candles[index - 1];
        const nextCandle = candles[index + 1];
        
        interpolatedCandles[index] = {
          open: (prevCandle.close + nextCandle.open) / 2,
          high: Math.max(prevCandle.high, nextCandle.high),
          low: Math.min(prevCandle.low, nextCandle.low),
          close: (prevCandle.close + nextCandle.open) / 2,
          volume: (prevCandle.volume + nextCandle.volume) / 2,
          open_time: prevCandle.open_time + (nextCandle.open_time - prevCandle.open_time) / 2
        };
      }
    }
    
    return interpolatedCandles;
  }
  
  // Check data integrity
  checkDataIntegrity(candles: any[]): { integrity: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (!this.config.validateDataIntegrity) {
      return { integrity: true, issues: [] };
    }
    
    // Check for gaps in time series
    for (let i = 1; i < candles.length; i++) {
      const prevTime = new Date(candles[i - 1].open_time).getTime();
      const currTime = new Date(candles[i].open_time).getTime();
      const expectedInterval = 60 * 1000; // 1 minute in milliseconds
      
      if (currTime - prevTime > expectedInterval * 2) {
        issues.push(`Time gap detected at index ${i}`);
      }
    }
    
    // Check for price anomalies
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const priceChange = Math.abs(candle.close - candle.open) / candle.open;
      
      if (priceChange > 0.1) { // 10% change in one candle
        issues.push(`Large price change detected at index ${i}: ${(priceChange * 100).toFixed(2)}%`);
      }
    }
    
    return { integrity: issues.length === 0, issues };
  }
}

// Trading mode manager
export class TradingModeManager {
  private config: HybridTradingConfig;
  private dataSelector: DataSourceSelector;
  private qualityManager: DataQualityManager;
  
  constructor(config: HybridTradingConfig, exchangeType: 'binance' | 'bybit') {
    this.config = config;
    this.dataSelector = new DataSourceSelector(config, exchangeType);
    this.qualityManager = new DataQualityManager(config);
  }
  
  // Get current trading mode
  getCurrentMode(): TradingMode {
    if (this.config.paperTradingMode) {
      return TRADING_MODES.paper_trading;
    }
    
    if (this.config.useMainnetData && this.config.useTestnetAPI) {
      return TRADING_MODES.hybrid_safe;
    }
    
    if (this.config.useMainnetData && !this.config.useTestnetAPI) {
      return TRADING_MODES.mainnet_only;
    }
    
    return TRADING_MODES.testnet_only;
  }
  
  // Get data source info
  getDataSourceInfo(): { endpoint: string; risk: string; accuracy: string } {
    const mode = this.getCurrentMode();
    
    return {
      endpoint: this.dataSelector.getDataEndpoint(),
      risk: mode.riskLevel,
      accuracy: this.config.useMainnetData ? 'High (real market data)' : 'Low (testnet data)'
    };
  }
  
  // Validate trading configuration
  validateConfiguration(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    if (this.config.useMainnetData && this.config.useTestnetAPI && !this.config.paperTradingMode) {
      warnings.push('Using mainnet data with testnet API - ensure this is intentional');
    }
    
    if (this.config.maxPositionSize > 10000 && this.config.paperTradingMode) {
      warnings.push('Large position size in paper trading mode - consider reducing for testing');
    }
    
    if (this.config.maxDailyTrades > 50) {
      warnings.push('High daily trade limit - monitor for overtrading');
    }
    
    return { valid: true, warnings };
  }
}
