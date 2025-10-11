/**
 * Universal Exchange API Helper
 * Supports Binance and Bybit with unified interface
 */

export interface ExchangeConfig {
  exchange: 'binance' | 'bybit';
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

export interface ExchangeEndpoints {
  baseUrl: string;
  account: string;
  positions: string;
  createOrder: string;
  klines: string;
  ticker: string;
  instruments: string;
  trades: string;
  serverTime: string;
}

export interface UnifiedBalance {
  asset: string;
  balance: number;
  unrealizedProfit: number;
}

export interface UnifiedPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  positionAmt: number;
  entryPrice: number;
  unrealizedProfit: number;
  leverage: number;
}

export interface UnifiedCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Base URLs for exchanges
const EXCHANGE_URLS = {
  binance: {
    testnet: 'https://testnet.binancefuture.com',
    mainnet: 'https://fapi.binance.com'
  },
  bybit: {
    testnet: 'https://api-testnet.bybit.com',
    mainnet: 'https://api.bybit.com'
  }
};

// Interval mapping between exchanges
const INTERVAL_MAPPING: Record<string, Record<string, string>> = {
  binance: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
    '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M'
  },
  bybit: {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360', '8h': '480', '12h': '720',
    '1d': 'D', '1w': 'W', '1M': 'M'
  }
};

/**
 * Get exchange endpoints based on configuration
 */
export function getExchangeEndpoints(config: ExchangeConfig): ExchangeEndpoints {
  const baseUrl = config.testnet 
    ? EXCHANGE_URLS[config.exchange].testnet 
    : EXCHANGE_URLS[config.exchange].mainnet;

  if (config.exchange === 'binance') {
    return {
      baseUrl,
      account: '/fapi/v2/account',
      positions: '/fapi/v2/positionRisk',
      createOrder: '/fapi/v1/order',
      klines: '/fapi/v1/klines',
      ticker: '/fapi/v1/ticker/24hr',
      instruments: '/fapi/v1/exchangeInfo',
      trades: '/fapi/v1/userTrades',
      serverTime: '/fapi/v1/time'
    };
  } else {
    return {
      baseUrl,
      account: '/v5/account/wallet-balance',
      positions: '/v5/position/list',
      createOrder: '/v5/order/create',
      klines: '/v5/market/kline',
      ticker: '/v5/market/tickers',
      instruments: '/v5/market/instruments-info',
      trades: '/v5/execution/list',
      serverTime: '/v5/market/time'
    };
  }
}

/**
 * Create HMAC-SHA256 signature for Binance
 */
async function createBinanceSignature(queryString: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(queryString)
  );
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create HMAC-SHA256 signature for Bybit
 */
async function createBybitSignature(
  timestamp: number, 
  apiKey: string, 
  recvWindow: string,
  params: string,
  secret: string
): Promise<string> {
  const paramStr = timestamp + apiKey + recvWindow + params;
  const encoder = new TextEncoder();
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(paramStr)
  );
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Make authenticated request to exchange API
 */
export async function makeExchangeRequest(
  config: ExchangeConfig,
  endpoint: keyof ExchangeEndpoints,
  params: Record<string, any> = {},
  method: 'GET' | 'POST' = 'GET'
): Promise<any> {
  const endpoints = getExchangeEndpoints(config);
  const url = endpoints.baseUrl + endpoints[endpoint];
  
  if (config.exchange === 'binance') {
    return makeBinanceRequest(url, config, params, method);
  } else {
    return makeBybitRequest(url, config, params, method);
  }
}

/**
 * Make Binance API request
 */
async function makeBinanceRequest(
  url: string,
  config: ExchangeConfig,
  params: Record<string, any>,
  method: string
): Promise<any> {
  const timestamp = Date.now();
  const queryParams = { ...params, timestamp };
  const queryString = new URLSearchParams(
    Object.entries(queryParams).map(([k, v]) => [k, String(v)])
  ).toString();
  
  const signature = await createBinanceSignature(queryString, config.apiSecret);
  const fullUrl = `${url}?${queryString}&signature=${signature}`;
  
  const response = await fetch(fullUrl, {
    method,
    headers: {
      'X-MBX-APIKEY': config.apiKey,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance API error: ${errorText}`);
  }
  
  return response.json();
}

/**
 * Make Bybit API request
 */
async function makeBybitRequest(
  url: string,
  config: ExchangeConfig,
  params: Record<string, any>,
  method: string
): Promise<any> {
  const timestamp = Date.now();
  const recvWindow = '5000';
  
  let fullUrl = url;
  let body = '';
  
  if (method === 'GET') {
    const queryString = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    
    const signature = await createBybitSignature(
      timestamp,
      config.apiKey,
      recvWindow,
      queryString,
      config.apiSecret
    );
    
    fullUrl = queryString ? `${url}?${queryString}` : url;
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': config.apiKey,
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'X-BAPI-SIGN': signature,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bybit API error: ${errorText}`);
    }
    
    const data = await response.json();
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    return data.result;
  } else {
    // POST request
    body = JSON.stringify(params);
    
    const signature = await createBybitSignature(
      timestamp,
      config.apiKey,
      recvWindow,
      body,
      config.apiSecret
    );
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': config.apiKey,
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'X-BAPI-SIGN': signature,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json'
      },
      body
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bybit API error: ${errorText}`);
    }
    
    const data = await response.json();
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    return data.result;
  }
}

/**
 * Parse account data to unified format
 */
export function parseAccountData(data: any, exchange: string): {
  canTrade: boolean;
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  balances: UnifiedBalance[];
} {
  if (exchange === 'binance') {
    return {
      canTrade: data.canTrade,
      totalWalletBalance: data.totalWalletBalance,
      totalUnrealizedProfit: data.totalUnrealizedProfit,
      balances: data.assets
        ?.filter((asset: any) => parseFloat(asset.walletBalance) > 0)
        .map((asset: any) => ({
          asset: asset.asset,
          balance: parseFloat(asset.walletBalance),
          unrealizedProfit: parseFloat(asset.unrealizedProfit)
        })) || []
    };
  } else {
    // Bybit
    const account = data.list?.[0];
    if (!account) {
      throw new Error('No account data found');
    }
    
    return {
      canTrade: true,
      totalWalletBalance: account.totalWalletBalance || '0',
      totalUnrealizedProfit: account.totalUnrealisedProfit || '0',
      balances: account.coin
        ?.filter((coin: any) => parseFloat(coin.walletBalance) > 0)
        .map((coin: any) => ({
          asset: coin.coin,
          balance: parseFloat(coin.walletBalance),
          unrealizedProfit: parseFloat(coin.unrealisedProfit || '0')
        })) || []
    };
  }
}

/**
 * Parse positions to unified format
 */
export function parsePositions(data: any, exchange: string): UnifiedPosition[] {
  if (exchange === 'binance') {
    return data
      .filter((pos: any) => parseFloat(pos.positionAmt) !== 0)
      .map((pos: any) => ({
        symbol: pos.symbol,
        side: parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT',
        positionAmt: Math.abs(parseFloat(pos.positionAmt)),
        entryPrice: parseFloat(pos.entryPrice),
        unrealizedProfit: parseFloat(pos.unRealizedProfit),
        leverage: parseFloat(pos.leverage)
      }));
  } else {
    // Bybit
    return data.list
      ?.filter((pos: any) => parseFloat(pos.size) !== 0)
      .map((pos: any) => ({
        symbol: pos.symbol,
        side: pos.side === 'Buy' ? 'LONG' : 'SHORT',
        positionAmt: parseFloat(pos.size),
        entryPrice: parseFloat(pos.avgPrice),
        unrealizedProfit: parseFloat(pos.unrealisedPnl || '0'),
        leverage: parseFloat(pos.leverage)
      })) || [];
  }
}

/**
 * Parse klines/candles to unified format
 */
export function parseKlines(data: any, exchange: string): UnifiedCandle[] {
  if (exchange === 'binance') {
    return data.map((candle: any) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  } else {
    // Bybit
    return data.list?.map((candle: any) => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    })) || [];
  }
}

/**
 * Parse ticker data to unified format
 */
export function parseTicker(data: any, exchange: string): any {
  if (exchange === 'binance') {
    return {
      symbol: data.symbol,
      lastPrice: data.lastPrice,
      priceChange: data.priceChange,
      priceChangePercent: data.priceChangePercent,
      volume: data.volume
    };
  } else {
    // Bybit
    return {
      symbol: data.symbol,
      lastPrice: data.lastPrice,
      priceChange: data.price24hPcnt,
      priceChangePercent: (parseFloat(data.price24hPcnt) * 100).toString(),
      volume: data.volume24h
    };
  }
}

/**
 * Parse instruments/trading pairs to unified format
 */
export function parseInstruments(data: any, exchange: string): any[] {
  if (exchange === 'binance') {
    return data.symbols
      .filter((symbol: any) => 
        symbol.status === 'TRADING' && 
        symbol.quoteAsset === 'USDT' &&
        symbol.contractType === 'PERPETUAL'
      )
      .map((symbol: any) => ({
        symbol: symbol.symbol,
        baseAsset: symbol.baseAsset,
        quoteAsset: symbol.quoteAsset,
        pricePrecision: symbol.pricePrecision,
        quantityPrecision: symbol.quantityPrecision
      }));
  } else {
    // Bybit
    return data.list
      ?.filter((symbol: any) => 
        symbol.status === 'Trading' && 
        symbol.quoteCoin === 'USDT' &&
        symbol.contractType === 'LinearPerpetual'
      )
      .map((symbol: any) => ({
        symbol: symbol.symbol,
        baseAsset: symbol.baseCoin,
        quoteAsset: symbol.quoteCoin,
        pricePrecision: symbol.priceScale,
        quantityPrecision: symbol.lotSizeFilter?.qtyStep ? 
          -Math.log10(parseFloat(symbol.lotSizeFilter.qtyStep)) : 8
      })) || [];
  }
}

/**
 * Map interval from standard format to exchange format
 */
export function mapInterval(interval: string, exchange: string): string {
  return INTERVAL_MAPPING[exchange][interval] || interval;
}

/**
 * Fetch public market data (klines) without authentication
 */
export async function fetchPublicKlines(
  exchange: 'binance' | 'bybit',
  symbol: string,
  interval: string,
  limit: number = 500,
  testnet: boolean = false
): Promise<UnifiedCandle[]> {
  const baseUrl = testnet 
    ? EXCHANGE_URLS[exchange].testnet 
    : EXCHANGE_URLS[exchange].mainnet;
  
  const mappedInterval = mapInterval(interval, exchange);
  
  if (exchange === 'binance') {
    const url = `${baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${mappedInterval}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return parseKlines(data, 'binance');
  } else {
    // Bybit
    const url = `${baseUrl}/v5/market/kline?category=linear&symbol=${symbol}&interval=${mappedInterval}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Bybit API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    return parseKlines(data.result, 'bybit');
  }
}

/**
 * Fetch public ticker data without authentication
 */
export async function fetchPublicTicker(
  exchange: 'binance' | 'bybit',
  symbols: string[],
  testnet: boolean = false
): Promise<any[]> {
  const baseUrl = testnet 
    ? EXCHANGE_URLS[exchange].testnet 
    : EXCHANGE_URLS[exchange].mainnet;
  
  if (exchange === 'binance') {
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const url = `${baseUrl}/fapi/v1/ticker/24hr?symbol=${symbol}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Binance API error for ${symbol}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return parseTicker(data, 'binance');
      })
    );
    return results;
  } else {
    // Bybit - can fetch multiple symbols at once
    const symbolList = symbols.join(',');
    const url = `${baseUrl}/v5/market/tickers?category=linear&symbol=${symbolList}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Bybit API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    return data.result.list.map((ticker: any) => parseTicker(ticker, 'bybit'));
  }
}

/**
 * Fetch public instruments without authentication
 */
export async function fetchPublicInstruments(
  exchange: 'binance' | 'bybit',
  testnet: boolean = false
): Promise<any[]> {
  const baseUrl = testnet 
    ? EXCHANGE_URLS[exchange].testnet 
    : EXCHANGE_URLS[exchange].mainnet;
  
  if (exchange === 'binance') {
    const url = `${baseUrl}/fapi/v1/exchangeInfo`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return parseInstruments(data, 'binance');
  } else {
    // Bybit
    const url = `${baseUrl}/v5/market/instruments-info?category=linear`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Bybit API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    return parseInstruments(data.result, 'bybit');
  }
}
