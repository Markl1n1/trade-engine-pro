/**
 * Dynamic Position Sizing Module
 * 
 * This module calculates optimal position sizes based on:
 * - Account balance and risk tolerance
 * - Volatility (ATR-based)
 * - Market regime
 * - Exchange constraints
 */

export interface PositionSizingConfig {
  maxRiskPercent: number; // Maximum risk per trade (e.g., 2%)
  volatilityLookback: number; // Period for ATR calculation (e.g., 14)
  minPositionSize: number; // Minimum position size
  maxPositionSize: number; // Maximum position size
  maxPortfolioRisk: number; // Maximum total portfolio risk
}

export interface ExchangeConstraints {
  minQty: number;
  maxQty: number;
  stepSize: number;
  minNotional: number;
  maxNotional: number;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_time: number;
  close_time: number;
}

/**
 * Calculate Average True Range (ATR)
 */
function calculateATR(candles: Candle[], period: number): number[] {
  const atr: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    
    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);
    
    const trueRange = Math.max(tr1, tr2, tr3);
    atr.push(trueRange);
  }
  
  // Calculate ATR using Wilder's smoothing
  const atrValues: number[] = [];
  let atrSum = 0;
  
  for (let i = 0; i < atr.length; i++) {
    if (i < period) {
      atrSum += atr[i];
      if (i === period - 1) {
        atrValues.push(atrSum / period);
      }
    } else {
      atrSum = (atrSum * (period - 1) + atr[i]) / period;
      atrValues.push(atrSum);
    }
  }
  
  return atrValues;
}

/**
 * Calculate position size based on risk and volatility
 */
export function calculatePositionSize(
  accountBalance: number,
  entryPrice: number,
  stopLossPrice: number,
  atr: number,
  config: PositionSizingConfig,
  constraints: ExchangeConstraints
): number {
  // Calculate risk per trade
  const riskAmount = accountBalance * (config.maxRiskPercent / 100);
  
  // Calculate stop distance
  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  
  // Calculate position size based on risk
  const riskBasedSize = riskAmount / stopDistance;
  
  // Calculate volatility-based size (Kelly Criterion approximation)
  const volatilityBasedSize = (accountBalance * 0.01) / (atr * 2);
  
  // Use the smaller of the two for conservative approach
  const positionSize = Math.min(riskBasedSize, volatilityBasedSize);
  
  // Apply position size limits
  const limitedSize = Math.max(
    config.minPositionSize,
    Math.min(config.maxPositionSize, positionSize)
  );
  
  // Apply exchange constraints
  const stepAdjustedSize = Math.floor(limitedSize / constraints.stepSize) * constraints.stepSize;
  
  // Ensure minimum quantity
  if (stepAdjustedSize < constraints.minQty) {
    return constraints.minQty;
  }
  
  // Ensure maximum quantity
  if (stepAdjustedSize > constraints.maxQty) {
    return constraints.maxQty;
  }
  
  // Ensure minimum notional value
  const notionalValue = stepAdjustedSize * entryPrice;
  if (notionalValue < constraints.minNotional) {
    const minQuantity = Math.ceil(constraints.minNotional / entryPrice / constraints.stepSize) * constraints.stepSize;
    return Math.min(minQuantity, constraints.maxQty);
  }
  
  return stepAdjustedSize;
}

/**
 * Calculate position size with market regime adjustment
 */
export function calculateRegimeAdjustedPositionSize(
  accountBalance: number,
  entryPrice: number,
  stopLossPrice: number,
  atr: number,
  config: PositionSizingConfig,
  constraints: ExchangeConstraints,
  regimeMultiplier: number = 1.0
): number {
  const basePositionSize = calculatePositionSize(
    accountBalance,
    entryPrice,
    stopLossPrice,
    atr,
    config,
    constraints
  );
  
  // Apply regime adjustment
  const adjustedSize = basePositionSize * regimeMultiplier;
  
  // Ensure it still meets constraints
  const stepAdjustedSize = Math.floor(adjustedSize / constraints.stepSize) * constraints.stepSize;
  
  if (stepAdjustedSize < constraints.minQty) {
    return constraints.minQty;
  }
  
  if (stepAdjustedSize > constraints.maxQty) {
    return constraints.maxQty;
  }
  
  return stepAdjustedSize;
}

/**
 * Calculate portfolio-level position size adjustment
 */
export function calculatePortfolioAdjustedPositionSize(
  basePositionSize: number,
  currentPortfolioRisk: number,
  maxPortfolioRisk: number,
  correlationFactor: number = 1.0
): number {
  // Calculate available risk
  const availableRisk = maxPortfolioRisk - currentPortfolioRisk;
  
  if (availableRisk <= 0) {
    return 0; // No more risk available
  }
  
  // Adjust for correlation
  const correlationAdjustedSize = basePositionSize * correlationFactor;
  
  // Ensure we don't exceed portfolio risk limits
  const riskAdjustedSize = Math.min(
    correlationAdjustedSize,
    availableRisk * 0.8 // Use 80% of available risk for safety
  );
  
  return riskAdjustedSize;
}

/**
 * Calculate optimal position size for a strategy
 */
export function calculateOptimalPositionSize(
  accountBalance: number,
  entryPrice: number,
  stopLossPrice: number,
  candles: Candle[],
  config: PositionSizingConfig,
  constraints: ExchangeConstraints,
  regimeMultiplier: number = 1.0,
  correlationFactor: number = 1.0
): {
  positionSize: number;
  riskAmount: number;
  riskPercent: number;
  volatility: number;
  confidence: number;
} {
  // Calculate ATR for volatility
  const atr = calculateATR(candles, config.volatilityLookback);
  const currentATR = atr[atr.length - 1];
  
  // Calculate base position size
  const basePositionSize = calculateRegimeAdjustedPositionSize(
    accountBalance,
    entryPrice,
    stopLossPrice,
    currentATR,
    config,
    constraints,
    regimeMultiplier
  );
  
  // Apply portfolio-level adjustments
  const finalPositionSize = calculatePortfolioAdjustedPositionSize(
    basePositionSize,
    0, // Current portfolio risk (would be calculated from active positions)
    config.maxPortfolioRisk,
    correlationFactor
  );
  
  // Calculate actual risk
  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  const riskAmount = finalPositionSize * stopDistance;
  const riskPercent = (riskAmount / accountBalance) * 100;
  
  // Calculate confidence based on volatility and regime
  const volatilityConfidence = Math.max(0, 100 - (currentATR / entryPrice) * 1000);
  const regimeConfidence = regimeMultiplier * 100;
  const confidence = Math.min(volatilityConfidence, regimeConfidence);
  
  return {
    positionSize: finalPositionSize,
    riskAmount,
    riskPercent,
    volatility: currentATR,
    confidence
  };
}

/**
 * Validate position size against all constraints
 */
export function validatePositionSize(
  positionSize: number,
  entryPrice: number,
  constraints: ExchangeConstraints
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check minimum quantity
  if (positionSize < constraints.minQty) {
    errors.push(`Position size ${positionSize} is below minimum quantity ${constraints.minQty}`);
  }
  
  // Check maximum quantity
  if (positionSize > constraints.maxQty) {
    errors.push(`Position size ${positionSize} exceeds maximum quantity ${constraints.maxQty}`);
  }
  
  // Check step size
  const remainder = positionSize % constraints.stepSize;
  if (remainder !== 0) {
    errors.push(`Position size ${positionSize} is not a multiple of step size ${constraints.stepSize}`);
  }
  
  // Check notional value
  const notionalValue = positionSize * entryPrice;
  if (notionalValue < constraints.minNotional) {
    errors.push(`Notional value ${notionalValue} is below minimum ${constraints.minNotional}`);
  }
  
  if (notionalValue > constraints.maxNotional) {
    warnings.push(`Notional value ${notionalValue} exceeds maximum ${constraints.maxNotional}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get default position sizing configuration
 */
export function getDefaultPositionSizingConfig(): PositionSizingConfig {
  return {
    maxRiskPercent: 2.0, // 2% risk per trade
    volatilityLookback: 14, // 14-period ATR
    minPositionSize: 0.01, // Minimum 0.01 units
    maxPositionSize: 0.1, // Maximum 10% of account
    maxPortfolioRisk: 10.0 // Maximum 10% total portfolio risk
  };
}
