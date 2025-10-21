// Exchange-specific trading constraints for accurate backtest simulation

export interface ExchangeConstraints {
  stepSize: number;
  minQty: number;
  minNotional: number;
  makerFee: number;
  takerFee: number;
  maxLeverage: number;
}

/**
 * Get Bybit Futures trading constraints for a specific symbol
 * Based on official Bybit Futures specifications
 */
export function getBybitConstraints(symbol: string): ExchangeConstraints {
  const constraints: Record<string, ExchangeConstraints> = {
    'BTCUSDT': {
      stepSize: 0.001,
      minQty: 0.001,
      minNotional: 10,
      makerFee: 0.02,   // 0.02% maker
      takerFee: 0.055,  // 0.055% taker
      maxLeverage: 125
    },
    'ETHUSDT': {
      stepSize: 0.01,
      minQty: 0.01,
      minNotional: 10,
      makerFee: 0.02,
      takerFee: 0.055,
      maxLeverage: 100
    },
    'SOLUSDT': {
      stepSize: 0.01,
      minQty: 0.1,
      minNotional: 10,
      makerFee: 0.02,
      takerFee: 0.055,
      maxLeverage: 50
    },
    'BNBUSDT': {
      stepSize: 0.01,
      minQty: 0.01,
      minNotional: 10,
      makerFee: 0.02,
      takerFee: 0.055,
      maxLeverage: 50
    },
    'DOGEUSDT': {
      stepSize: 0.0001,
      minQty: 1,
      minNotional: 10,
      makerFee: 0.02,
      takerFee: 0.055,
      maxLeverage: 75
    },
    'ADAUSDT': {
      stepSize: 0.0001,
      minQty: 1,
      minNotional: 10,
      makerFee: 0.02,
      takerFee: 0.055,
      maxLeverage: 75
    },
    'XRPUSDT': {
      stepSize: 0.0001,
      minQty: 0.1,
      minNotional: 10,
      makerFee: 0.02,
      takerFee: 0.055,
      maxLeverage: 75
    }
  };
  
  // Default to BTCUSDT parameters if symbol not found
  return constraints[symbol] || constraints['BTCUSDT'];
}

/**
 * Get Binance Futures trading constraints for a specific symbol
 * Based on official Binance Futures specifications
 */
export function getBinanceConstraints(symbol: string): ExchangeConstraints {
  const constraints: Record<string, ExchangeConstraints> = {
    'BTCUSDT': {
      stepSize: 0.001,
      minQty: 0.001,
      minNotional: 10,
      makerFee: 0.02,
      takerFee: 0.04,
      maxLeverage: 125
    },
    'ETHUSDT': {
      stepSize: 0.01,
      minQty: 0.01,
      minNotional: 10,
      makerFee: 0.02,
      takerFee: 0.04,
      maxLeverage: 100
    }
  };
  
  // Default to generic Binance parameters
  return constraints[symbol] || {
    stepSize: 0.00001,
    minQty: 0.001,
    minNotional: 10,
    makerFee: 0.02,
    takerFee: 0.04,
    maxLeverage: 125
  };
}

/**
 * Get realistic slippage percentage based on exchange and symbol
 */
export function getRealisticSlippage(exchangeType: 'binance' | 'bybit', symbol: string): number {
  if (exchangeType === 'bybit') {
    // Bybit has excellent liquidity
    const highLiquidityPairs = ['BTCUSDT', 'ETHUSDT'];
    return highLiquidityPairs.includes(symbol) ? 0.01 : 0.03; // 0.01% BTC/ETH, 0.03% altcoins
  } else {
    // Binance also has high liquidity
    const highLiquidityPairs = ['BTCUSDT', 'ETHUSDT'];
    return highLiquidityPairs.includes(symbol) ? 0.015 : 0.035; // Slightly higher than Bybit
  }
}
