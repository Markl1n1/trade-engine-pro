// Exchange-specific trading constraints for accurate backtest simulation

export interface ExchangeConstraints {
  stepSize: number;
  minQty: number;
  minNotional: number;
  priceTick: number;  // Added: minimum price increment
  makerFee: number;
  takerFee: number;
  maxLeverage: number;
  maxOrderQty: number;  // Added: maximum order quantity
}

/**
 * Get Bybit Futures trading constraints for a specific symbol
 * Based on official Bybit Futures specifications
 */
export function getBybitConstraints(symbol: string): ExchangeConstraints {
  const constraints: Record<string, ExchangeConstraints> = {
    'BTCUSDT': {
      stepSize: 0.001,      // Quantity step size
      minQty: 0.001,        // Minimum order quantity
      minNotional: 10,      // Minimum notional value (USDT)
      priceTick: 0.01,      // Minimum price increment
      makerFee: 0.01,       // 0.01% maker fee (VIP0)
      takerFee: 0.06,       // 0.06% taker fee (VIP0)
      maxLeverage: 125,     // Maximum leverage
      maxOrderQty: 1000     // Maximum order quantity
    },
    'ETHUSDT': {
      stepSize: 0.01,
      minQty: 0.01,
      minNotional: 10,
      priceTick: 0.01,
      makerFee: 0.01,
      takerFee: 0.06,
      maxLeverage: 100,
      maxOrderQty: 10000
    },
    'SOLUSDT': {
      stepSize: 0.01,
      minQty: 0.1,
      minNotional: 10,
      priceTick: 0.001,
      makerFee: 0.01,
      takerFee: 0.06,
      maxLeverage: 50,
      maxOrderQty: 100000
    },
    'BNBUSDT': {
      stepSize: 0.01,
      minQty: 0.01,
      minNotional: 10,
      priceTick: 0.01,
      makerFee: 0.01,
      takerFee: 0.06,
      maxLeverage: 50,
      maxOrderQty: 10000
    },
    'DOGEUSDT': {
      stepSize: 0.1,        // Corrected: DOGE typically has 0.1 step size
      minQty: 1,
      minNotional: 10,
      priceTick: 0.00001,   // DOGE has smaller price increments
      makerFee: 0.01,
      takerFee: 0.06,
      maxLeverage: 75,
      maxOrderQty: 1000000
    },
    'ADAUSDT': {
      stepSize: 0.1,
      minQty: 1,
      minNotional: 10,
      priceTick: 0.00001,
      makerFee: 0.01,
      takerFee: 0.06,
      maxLeverage: 75,
      maxOrderQty: 1000000
    },
    'XRPUSDT': {
      stepSize: 0.1,
      minQty: 0.1,
      minNotional: 10,
      priceTick: 0.00001,
      makerFee: 0.01,
      takerFee: 0.06,
      maxLeverage: 75,
      maxOrderQty: 1000000
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
      priceTick: 0.01,
      makerFee: 0.02,
      takerFee: 0.04,
      maxLeverage: 125,
      maxOrderQty: 1000
    },
    'ETHUSDT': {
      stepSize: 0.01,
      minQty: 0.01,
      minNotional: 10,
      priceTick: 0.01,
      makerFee: 0.02,
      takerFee: 0.04,
      maxLeverage: 100,
      maxOrderQty: 10000
    }
  };
  
  // Default to generic Binance parameters
  return constraints[symbol] || {
    stepSize: 0.00001,
    minQty: 0.001,
    minNotional: 10,
    priceTick: 0.00001,
    makerFee: 0.02,
    takerFee: 0.04,
    maxLeverage: 125,
    maxOrderQty: 1000
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

/**
 * Round quantity to valid step size
 */
export function roundToStepSize(quantity: number, stepSize: number): number {
  if (stepSize <= 0) return quantity;
  return Math.floor(quantity / stepSize) * stepSize;
}

/**
 * Round price to valid tick size
 */
export function roundToTickSize(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Validate order against exchange constraints
 */
export function validateOrder(
  quantity: number,
  price: number,
  constraints: ExchangeConstraints
): { valid: boolean; reason?: string } {
  // Check minimum quantity
  if (quantity < constraints.minQty) {
    return { valid: false, reason: `Quantity ${quantity} below minimum ${constraints.minQty}` };
  }
  
  // Check maximum quantity
  if (quantity > constraints.maxOrderQty) {
    return { valid: false, reason: `Quantity ${quantity} above maximum ${constraints.maxOrderQty}` };
  }
  
  // Check step size
  const roundedQty = roundToStepSize(quantity, constraints.stepSize);
  if (Math.abs(quantity - roundedQty) > 1e-10) {
    return { valid: false, reason: `Quantity ${quantity} not aligned with step size ${constraints.stepSize}` };
  }
  
  // Check minimum notional
  const notional = quantity * price;
  if (notional < constraints.minNotional) {
    return { valid: false, reason: `Notional ${notional} below minimum ${constraints.minNotional}` };
  }
  
  // Check price tick size
  const roundedPrice = roundToTickSize(price, constraints.priceTick);
  if (Math.abs(price - roundedPrice) > 1e-10) {
    return { valid: false, reason: `Price ${price} not aligned with tick size ${constraints.priceTick}` };
  }
  
  return { valid: true };
}
