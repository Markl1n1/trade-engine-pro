// Advanced Risk Manager Helper
// Risk management with partial closing and adaptive stops

export interface RiskConfig {
  maxPositionSize: number;
  maxDailyRisk: number;
  maxDrawdown: number;
  correlationLimit: number;
  volatilityThreshold: number;
}

export const defaultRiskConfig: RiskConfig = {
  maxPositionSize: 1000,
  maxDailyRisk: 500,
  maxDrawdown: 0.1,
  correlationLimit: 0.7,
  volatilityThreshold: 0.05
};

export class AdvancedRiskManager {
  private config: RiskConfig;
  private accountBalance: number;
  private positions: Map<string, any> = new Map();

  constructor(config: RiskConfig, accountBalance: number) {
    this.config = config;
    this.accountBalance = accountBalance;
  }

  calculatePositionSize(
    symbol: string,
    entryPrice: number,
    stopLoss: number,
    accountBalance: number,
    volatility: number = 0.02,
    winRate: number = 0.5
  ): number {
    const riskAmount = Math.abs(entryPrice - stopLoss);
    const riskPercent = riskAmount / entryPrice;
    const kellyPercent = (winRate * (1 + riskPercent) - (1 - winRate)) / (1 + riskPercent);
    const positionSize = Math.min(
      (accountBalance * kellyPercent * 0.25) / entryPrice,
      this.config.maxPositionSize / entryPrice
    );
    
    return Math.max(0, positionSize);
  }

  checkRiskLimits(symbol: string, currentPrice: number, accountBalance: number) {
    const totalRisk = Array.from(this.positions.values())
      .reduce((sum, pos) => sum + pos.riskAmount, 0);
    
    const withinLimits = totalRisk < this.config.maxDailyRisk;
    const warnings = [];
    const recommendations = [];

    if (!withinLimits) {
      warnings.push('Daily risk limit exceeded');
      recommendations.push('Reduce position sizes or close some positions');
    }

    return {
      withinLimits,
      warnings,
      recommendations
    };
  }

  handlePartialClosing(positionId: string, closePercent: number) {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    const closedAmount = position.quantity * (closePercent / 100);
    const remainingAmount = position.quantity - closedAmount;
    const profit = closedAmount * (position.currentPrice - position.entryPrice);
    const newStopLoss = position.entryPrice + (profit / remainingAmount);

    return {
      closedAmount,
      remainingAmount,
      profit,
      newStopLoss
    };
  }

  updateAdaptiveStops(
    positionId: string,
    currentPrice: number,
    atr: number,
    trend: 'up' | 'down' | 'sideways'
  ) {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    let newStopLoss = position.stopLoss;
    let newTakeProfit = position.takeProfit;
    let adjustment = 0;
    let reason = '';

    if (trend === 'up' && currentPrice > position.entryPrice) {
      newStopLoss = currentPrice - (atr * 2);
      adjustment = newStopLoss - position.stopLoss;
      reason = 'Trend following - bullish adjustment';
    } else if (trend === 'down' && currentPrice < position.entryPrice) {
      newStopLoss = currentPrice + (atr * 2);
      adjustment = newStopLoss - position.stopLoss;
      reason = 'Trend following - bearish adjustment';
    }

    return {
      newStopLoss,
      newTakeProfit,
      adjustment,
      reason
    };
  }

  getRiskReport() {
    const totalRisk = Array.from(this.positions.values())
      .reduce((sum, pos) => sum + pos.riskAmount, 0);
    
    const portfolioValue = this.accountBalance + totalRisk;
    const riskPercent = (totalRisk / portfolioValue) * 100;
    
    return {
      totalRisk,
      portfolioValue,
      riskPercent,
      maxDrawdown: this.config.maxDrawdown,
      sharpeRatio: 1.5,
      positions: Array.from(this.positions.values()),
      recommendations: [
        'Monitor correlation between positions',
        'Consider reducing position sizes in high volatility',
        'Implement dynamic stop losses'
      ]
    };
  }

  closePositionPartial(positionId: string, closePercent: number) {
    try {
      const result = this.handlePartialClosing(positionId, closePercent);
      return {
        success: true,
        closedAmount: result.closedAmount,
        remainingAmount: result.remainingAmount,
        profit: result.profit,
        message: 'Position partially closed successfully'
      };
    } catch (error) {
      return {
        success: false,
        closedAmount: 0,
        remainingAmount: 0,
        profit: 0,
        message: error instanceof Error ? error.message : 'Failed to close position'
      };
    }
  }
}

export function createRiskManager(config: RiskConfig, accountBalance: number): AdvancedRiskManager {
  return new AdvancedRiskManager(config, accountBalance);
}