// Real Binance API client for testnet and mainnet execution

interface BinanceOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  newClientOrderId?: string;
}

interface BinanceOrderResponse {
  orderId: number;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cumQuote: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
  origQuoteOrderQty: string;
}

interface BinancePosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  maxNotionalValue: string;
  marginType: string;
  isolatedMargin: string;
  isAutoAddMargin: string;
  positionSide: string;
  notional: string;
  isolatedWallet: string;
  updateTime: number;
}

export class BinanceAPIClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private isTestnet: boolean;

  constructor(apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestnet = isTestnet;
    this.baseUrl = isTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  }

  private async generateSignature(queryString: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(queryString));
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async makeRequest(endpoint: string, params: Record<string, any> = {}, method: string = 'GET'): Promise<any> {
    const timestamp = Date.now();
    const queryString = new URLSearchParams({
      ...params,
      timestamp: timestamp.toString()
    }).toString();
    
    const signature = await this.generateSignature(queryString);
    const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;
    
    const headers = {
      'X-MBX-APIKEY': this.apiKey,
      'Content-Type': 'application/json'
    };

    console.log(`[BINANCE-API] ${method} ${url}`);
    
    const response = await fetch(url, {
      method,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Binance API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async placeOrder(orderRequest: BinanceOrderRequest): Promise<BinanceOrderResponse> {
    console.log(`[BINANCE-API] Placing ${orderRequest.side} order for ${orderRequest.symbol}`);
    
    const params = {
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type,
      quantity: orderRequest.quantity,
      newClientOrderId: orderRequest.newClientOrderId || `trade_engine_${Date.now()}`
    };

    if (orderRequest.type === 'LIMIT' && orderRequest.price) {
      params.price = orderRequest.price;
      params.timeInForce = orderRequest.timeInForce || 'GTC';
    }

    return await this.makeRequest('/fapi/v1/order', params, 'POST');
  }

  async getAccountInfo(): Promise<any> {
    return await this.makeRequest('/fapi/v2/account');
  }

  async getPositions(symbol?: string): Promise<BinancePosition[]> {
    const params = symbol ? { symbol } : {};
    return await this.makeRequest('/fapi/v2/positionRisk', params);
  }

  async getOpenOrders(symbol?: string): Promise<any[]> {
    const params = symbol ? { symbol } : {};
    return await this.makeRequest('/fapi/v1/openOrders', params);
  }

  async cancelOrder(symbol: string, orderId: number): Promise<any> {
    return await this.makeRequest('/fapi/v1/order', {
      symbol,
      orderId
    }, 'DELETE');
  }

  async getOrderStatus(symbol: string, orderId: number): Promise<any> {
    return await this.makeRequest('/fapi/v1/order', {
      symbol,
      orderId
    });
  }

  async testConnectivity(): Promise<boolean> {
    try {
      await this.makeRequest('/fapi/v1/ping');
      return true;
    } catch (error) {
      console.error('[BINANCE-API] Connectivity test failed:', error);
      return false;
    }
  }
}
