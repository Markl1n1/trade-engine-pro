// Advanced Risk Manager
// Sophisticated risk management with partial closing, adaptive stops, and position sizing

interface RiskConfig {
  maxRiskPerTrade: number; // Maximum risk per trade as % of account
  maxDailyRisk: number; // Maximum daily risk as % of account
  maxDrawdown: number; // Maximum drawdown before stopping
  positionSizing: {
    method: 'fixed' | 'kelly' | 'volatility' | 'atr';
    baseSize: number; // Base position size
    maxSize: number; // Maximum position size
    minSize: number; // Minimum position size
  };
  partialClosing: {
    enabled: boolean;
    levels: Array<{
      profitPercent: number;
      closePercent: number;
    }>;
  };
  adaptiveStops: {
    enabled: boolean;
    atrMultiplier: number;
    volatilityAdjustment: boolean;
    trendAdjustment: boolean;
  };
  portfolioRisk: {
    maxCorrelation: number;
    maxPositions: number;
    sectorLimits: Record<string, number>;
  };
}

interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;
  partialCloses: Array<{
    level: number;
    closedSize: number;
    profit: number;
  }>;
  riskMetrics: {
    riskAmount: number;
    riskPercent: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
}

interface RiskMetrics {
  totalRisk: number;
  dailyPnL: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  var95: number; // Value at Risk 95%
  expectedReturn: number;
  volatility: number;
}

export class AdvancedRiskManager {
  private config: RiskConfig;
  private positions: Map<string, Position> = new Map();
  private dailyMetrics: RiskMetrics;
  private accountBalance: number;
  
  constructor(config: RiskConfig, initialBalance: number) {
    this.config = config;
    this.accountBalance = initialBalance;
    this.dailyMetrics = this.initializeMetrics();
  }
  
  private initializeMetrics(): RiskMetrics {
    return {
      totalRisk: 0,
      dailyPnL: 0,
      maxDrawdown: 0,
      winRate: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      var95: 0,
      expectedReturn: 0,
      volatility: 0
    };
  }
  
  // Calculate optimal position size
  calculatePositionSize(
    symbol: string,
    entryPrice: number,
    stopLoss: number,
    accountBalance: number,
    volatility?: number,
    winRate?: number
  ): number {
    const riskAmount = accountBalance * this.config.maxRiskPerTrade;
    const priceRisk = Math.abs(entryPrice - stopLoss) / entryPrice;
    const baseSize = riskAmount / (entryPrice * priceRisk);
    
    let adjustedSize = baseSize;
    
    switch (this.config.positionSizing.method) {
      case 'kelly':
        if (winRate && winRate > 0) {
          const kellyPercent = (winRate * 2 - 1) / (2 * (1 - winRate));
          adjustedSize = baseSize * Math.min(kellyPercent, 0.25); // Cap at 25%
        }
        break;
        
      case 'volatility':
        if (volatility) {
          const volatilityAdjustment = 0.02 / volatility; // Target 2% volatility
          adjustedSize = baseSize * volatilityAdjustment;
        }
        break;
        
      case 'atr':
        if (volatility) {
          const atrAdjustment = 0.02 / (volatility * this.config.adaptiveStops.atrMultiplier);
          adjustedSize = baseSize * atrAdjustment;
        }
        break;
    }
    
    // Apply limits
    adjustedSize = Math.max(adjustedSize, this.config.positionSizing.minSize);
    adjustedSize = Math.min(adjustedSize, this.config.positionSizing.maxSize);
    
    // Check portfolio risk limits
    const portfolioRisk = this.calculatePortfolioRisk();
    if (portfolioRisk > this.config.maxDailyRisk) {
      adjustedSize = 0; // No new positions if risk limit exceeded
    }
    
    return adjustedSize;
  }
  
  // Calculate adaptive stop loss
  calculateAdaptiveStopLoss(
    position: Position,
    currentPrice: number,
    atr: number,
    trend: 'up' | 'down' | 'sideways'
  ): number {
    if (!this.config.adaptiveStops.enabled) {
      return position.stopLoss;
    }
    
    let adaptiveStop = position.stopLoss;
    
    // ATR-based adjustment
    const atrStop = currentPrice - (atr * this.config.adaptiveStops.atrMultiplier);
    if (position.side === 'LONG') {
      adaptiveStop = Math.max(adaptiveStop, atrStop);
    } else {
      adaptiveStop = Math.min(adaptiveStop, atrStop);
    }
    
    // Volatility adjustment
    if (this.config.adaptiveStops.volatilityAdjustment) {
      const volatilityMultiplier = this.calculateVolatilityMultiplier(position.symbol);
      adaptiveStop = this.adjustStopForVolatility(adaptiveStop, volatilityMultiplier);
    }
    
    // Trend adjustment
    if (this.config.adaptiveStops.trendAdjustment) {
      adaptiveStop = this.adjustStopForTrend(adaptiveStop, trend, position.side);
    }
    
    return adaptiveStop;
  }
  
  // Handle partial closing
  handlePartialClosing(position: Position, currentPrice: number): Array<{
    action: 'CLOSE_PARTIAL';
    size: number;
    level: number;
  }> {
    if (!this.config.partialClosing.enabled) {
      return [];
    }
    
    const actions: Array<{
      action: 'CLOSE_PARTIAL';
      size: number;
      level: number;
    }> = [];
    
    const currentProfit = this.calculateProfit(position, currentPrice);
    
    for (const level of this.config.partialClosing.levels) {
      // Check if we've reached this profit level and haven't closed at this level yet
      if (currentProfit >= level.profitPercent && 
          !position.partialCloses.some(pc => pc.level === level.profitPercent)) {
        
        const closeSize = position.size * (level.closePercent / 100);
        
        actions.push({
          action: 'CLOSE_PARTIAL',
          size: closeSize,
          level: level.profitPercent
        });
        
        // Record the partial close
        position.partialCloses.push({
          level: level.profitPercent,
          closedSize: closeSize,
          profit: currentProfit
        });
      }
    }
    
    return actions;
  }
  
  // Calculate portfolio risk
  calculatePortfolioRisk(): number {
    let totalRisk = 0;
    
    for (const position of this.positions.values()) {
      const riskAmount = position.size * Math.abs(position.entryPrice - position.stopLoss);
      totalRisk += riskAmount;
    }
    
    return (totalRisk / this.accountBalance) * 100;
  }
  
  // Check if new position is allowed
  canOpenPosition(symbol: string, size: number, entryPrice: number, stopLoss: number): {
    allowed: boolean;
    reason?: string;
  } {
    // Check daily risk limit
    const currentRisk = this.calculatePortfolioRisk();
    const newPositionRisk = (size * Math.abs(entryPrice - stopLoss) / this.accountBalance) * 100;
    
    if (currentRisk + newPositionRisk > this.config.maxDailyRisk) {
      return {
        allowed: false,
        reason: 'Daily risk limit exceeded'
      };
    }
    
    // Check maximum positions
    if (this.positions.size >= this.config.portfolioRisk.maxPositions) {
      return {
        allowed: false,
        reason: 'Maximum positions limit reached'
      };
    }
    
    // Check drawdown limit
    if (this.dailyMetrics.maxDrawdown > this.config.maxDrawdown) {
      return {
        allowed: false,
        reason: 'Maximum drawdown exceeded'
      };
    }
    
    // Check correlation limits
    const correlation = this.calculateCorrelation(symbol);
    if (correlation > this.config.portfolioRisk.maxCorrelation) {
      return {
        allowed: false,
        reason: 'High correlation with existing positions'
      };
    }
    
    return { allowed: true };
  }
  
  // Update position
  updatePosition(positionId: string, updates: Partial<Position>): void {
    const position = this.positions.get(positionId);
    if (position) {
      Object.assign(position, updates);
      this.updateRiskMetrics();
    }
  }
  
  // Close position
  closePosition(positionId: string, exitPrice: number, reason: string): {
    profit: number;
    profitPercent: number;
  } {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error('Position not found');
    }
    
    const profit = this.calculateProfit(position, exitPrice);
    const profitPercent = (profit / (position.size * position.entryPrice)) * 100;
    
    // Update account balance
    this.accountBalance += profit;
    
    // Remove position
    this.positions.delete(positionId);
    
    // Update metrics
    this.updateRiskMetrics();
    
    return { profit, profitPercent };
  }
  
  // Calculate profit for position
  private calculateProfit(position: Position, currentPrice: number): number {
    const priceDiff = position.side === 'LONG' 
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;
    
    return position.size * priceDiff;
  }
  
  // Calculate correlation with existing positions
  private calculateCorrelation(symbol: string): number {
    // Simplified correlation calculation
    // In real implementation, you would use historical price data
    return Math.random() * 0.5; // 0-50% correlation
  }
  
  // Calculate volatility multiplier
  private calculateVolatilityMultiplier(symbol: string): number {
    // Simplified volatility calculation
    // In real implementation, you would use ATR or standard deviation
    return 1.0 + (Math.random() * 0.5); // 1.0-1.5x multiplier
  }
  
  // Adjust stop for volatility
  private adjustStopForVolatility(stop: number, multiplier: number): number {
    return stop * multiplier;
  }
  
  // Adjust stop for trend
  private adjustStopForTrend(stop: number, trend: string, side: string): number {
    if (trend === 'up' && side === 'LONG') {
      return stop * 1.1; // Tighten stop in uptrend
    } else if (trend === 'down' && side === 'SHORT') {
      return stop * 1.1; // Tighten stop in downtrend
    }
    return stop;
  }
  
  // Update risk metrics
  private updateRiskMetrics(): void {
    let totalPnL = 0;
    let winningTrades = 0;
    let totalTrades = 0;
    
    for (const position of this.positions.values()) {
      const profit = this.calculateProfit(position, position.currentPrice);
      totalPnL += profit;
      totalTrades++;
      
      if (profit > 0) {
        winningTrades++;
      }
    }
    
    this.dailyMetrics.dailyPnL = totalPnL;
    this.dailyMetrics.winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    this.dailyMetrics.totalRisk = this.calculatePortfolioRisk();
    
    // Update max drawdown
    if (totalPnL < this.dailyMetrics.maxDrawdown) {
      this.dailyMetrics.maxDrawdown = totalPnL;
    }
  }
  
  // Get risk report
  getRiskReport(): {
    positions: Position[];
    metrics: RiskMetrics;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    
    // Check risk levels
    if (this.dailyMetrics.totalRisk > this.config.maxDailyRisk * 0.8) {
      recommendations.push('High portfolio risk - consider reducing position sizes');
    }
    
    if (this.dailyMetrics.maxDrawdown > this.config.maxDrawdown * 0.8) {
      recommendations.push('Approaching maximum drawdown - consider closing losing positions');
    }
    
    if (this.dailyMetrics.winRate < 0.4) {
      recommendations.push('Low win rate - review strategy parameters');
    }
    
    return {
      positions: Array.from(this.positions.values()),
      metrics: this.dailyMetrics,
      recommendations
    };
  }
  
  // Get position by ID
  getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }
  
  // Get all positions
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }
  
  // Update configuration
  updateConfig(newConfig: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  // Get current configuration
  getConfig(): RiskConfig {
    return { ...this.config };
  }
}

// Export risk manager factory
export function createRiskManager(config: RiskConfig, initialBalance: number): AdvancedRiskManager {
  return new AdvancedRiskManager(config, initialBalance);
}

// Default risk configuration
export const defaultRiskConfig: RiskConfig = {
  maxRiskPerTrade: 2, // 2% per trade
  maxDailyRisk: 10, // 10% daily risk
  maxDrawdown: 20, // 20% max drawdown
  positionSizing: {
    method: 'fixed',
    baseSize: 1000,
    maxSize: 10000,
    minSize: 100
  },
  partialClosing: {
    enabled: true,
    levels: [
      { profitPercent: 25, closePercent: 25 },
      { profitPercent: 50, closePercent: 50 },
      { profitPercent: 75, closePercent: 75 }
    ]
  },
  adaptiveStops: {
    enabled: true,
    atrMultiplier: 2,
    volatilityAdjustment: true,
    trendAdjustment: true
  },
  portfolioRisk: {
    maxCorrelation: 0.7,
    maxPositions: 10,
    sectorLimits: {}
  }
};
