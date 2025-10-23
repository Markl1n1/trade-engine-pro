// Enhanced Reporting System
// Advanced reporting and analytics for backtest results

import { 
  BacktestResults, 
  Trade, 
  MarketRegime 
} from './strategy-interfaces.ts';

export class EnhancedReporting {
  
  // Generate comprehensive backtest report
  generateReport(results: BacktestResults, strategyType: string, regime: MarketRegime): any {
    const report = {
      summary: this.generateSummary(results),
      performance: this.generatePerformanceMetrics(results),
      risk: this.generateRiskMetrics(results),
      trades: this.generateTradeAnalysis(results.trades),
      regime: this.generateRegimeAnalysis(regime),
      recommendations: this.generateRecommendations(results, strategyType, regime)
    };
    
    return report;
  }

  // Generate summary statistics
  private generateSummary(results: BacktestResults): any {
    return {
      total_return: results.total_return,
      total_trades: results.total_trades,
      win_rate: results.win_rate,
      profit_factor: results.profit_factor,
      max_drawdown: results.max_drawdown,
      sharpe_ratio: results.sharpe_ratio,
      // Enhanced metrics
      confidence_avg: results.confidence_avg,
      adx_avg: results.adx_avg,
      momentum_avg: results.momentum_avg,
      session_strength_avg: results.session_strength_avg
    };
  }

  // Generate performance metrics
  private generatePerformanceMetrics(results: BacktestResults): any {
    const trades = results.trades;
    const profits = trades.map(t => t.profit || 0);
    
    return {
      // Basic metrics
      total_return: results.total_return,
      annualized_return: this.calculateAnnualizedReturn(results),
      volatility: this.calculateVolatility(profits),
      
      // Trade metrics
      avg_win: results.avg_win,
      avg_loss: results.avg_loss,
      largest_win: Math.max(...profits),
      largest_loss: Math.min(...profits),
      
      // Consecutive metrics
      max_consecutive_wins: this.calculateMaxConsecutiveWins(trades),
      max_consecutive_losses: this.calculateMaxConsecutiveLosses(trades),
      
      // Enhanced metrics
      confidence_correlation: this.calculateConfidenceCorrelation(trades),
      regime_performance: this.calculateRegimePerformance(trades)
    };
  }

  // Generate risk metrics
  private generateRiskMetrics(results: BacktestResults): any {
    const trades = results.trades;
    const profits = trades.map(t => t.profit || 0);
    
    return {
      max_drawdown: results.max_drawdown,
      sharpe_ratio: results.sharpe_ratio,
      sortino_ratio: this.calculateSortinoRatio(profits),
      calmar_ratio: this.calculateCalmarRatio(results),
      var_95: this.calculateVaR(profits, 0.95),
      var_99: this.calculateVaR(profits, 0.99),
      expected_shortfall: this.calculateExpectedShortfall(profits),
      risk_adjusted_return: this.calculateRiskAdjustedReturn(results)
    };
  }

  // Generate trade analysis
  private generateTradeAnalysis(trades: Trade[]): any {
    if (trades.length === 0) {
      return {
        total_trades: 0,
        analysis: "No trades to analyze"
      };
    }
    
    const profits = trades.map(t => t.profit || 0);
    const confidenceScores = trades.map(t => t.confidence || 50);
    const adxScores = trades.map(t => t.adx || 0);
    const momentumScores = trades.map(t => t.momentum_score || 0);
    
    return {
      total_trades: trades.length,
      win_rate: (trades.filter(t => (t.profit || 0) > 0).length / trades.length) * 100,
      
      // Performance by confidence
      confidence_analysis: this.analyzeByConfidence(trades),
      
      // Performance by ADX
      adx_analysis: this.analyzeByADX(trades),
      
      // Performance by momentum
      momentum_analysis: this.analyzeByMomentum(trades),
      
      // Time-based analysis
      time_analysis: this.analyzeByTime(trades),
      
      // Exit reason analysis
      exit_analysis: this.analyzeExitReasons(trades),
      
      // Statistical analysis
      statistical_analysis: {
        mean_profit: profits.reduce((a, b) => a + b, 0) / profits.length,
        median_profit: this.calculateMedian(profits),
        std_deviation: this.calculateStandardDeviation(profits),
        skewness: this.calculateSkewness(profits),
        kurtosis: this.calculateKurtosis(profits)
      }
    };
  }

  // Generate regime analysis
  private generateRegimeAnalysis(regime: MarketRegime): any {
    return {
      current_regime: regime.type,
      regime_strength: regime.strength,
      volatility: regime.volatility,
      trend_direction: regime.trend_direction,
      confidence: regime.confidence,
      
      // Regime-specific insights
      insights: this.generateRegimeInsights(regime),
      
      // Recommendations for current regime
      recommendations: this.generateRegimeRecommendations(regime)
    };
  }

  // Generate recommendations
  private generateRecommendations(results: BacktestResults, strategyType: string, regime: MarketRegime): any {
    const recommendations = [];
    
    // Performance-based recommendations
    if (results.win_rate < 50) {
      recommendations.push({
        type: "performance",
        priority: "high",
        message: "Win rate is below 50%. Consider adjusting entry criteria or adding more filters.",
        action: "Review and tighten entry conditions"
      });
    }
    
    if (results.max_drawdown > 20) {
      recommendations.push({
        type: "risk",
        priority: "high",
        message: "Maximum drawdown exceeds 20%. Consider reducing position size or adding stop-losses.",
        action: "Implement stricter risk management"
      });
    }
    
    if (results.profit_factor < 1.5) {
      recommendations.push({
        type: "profitability",
        priority: "medium",
        message: "Profit factor is below 1.5. Consider improving exit strategies.",
        action: "Optimize take-profit and stop-loss levels"
      });
    }
    
    // Regime-based recommendations
    if (regime.type === 'volatile' && results.confidence_avg < 70) {
      recommendations.push({
        type: "regime",
        priority: "medium",
        message: "High volatility regime with low confidence. Consider reducing position size.",
        action: "Adjust position sizing for volatile conditions"
      });
    }
    
    // Strategy-specific recommendations
    const strategyRecommendations = this.generateStrategyRecommendations(strategyType, results);
    recommendations.push(...strategyRecommendations);
    
    return {
      recommendations,
      priority_order: recommendations.sort((a, b) => {
        const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority as string] - priorityOrder[a.priority as string];
      })
    };
  }

  // Helper methods for calculations
  private calculateAnnualizedReturn(results: BacktestResults): number {
    // Simplified calculation - in real implementation, use actual time period
    return results.total_return * 12; // Assuming monthly data
  }

  private calculateVolatility(profits: number[]): number {
    if (profits.length < 2) return 0;
    
    const mean = profits.reduce((a, b) => a + b, 0) / profits.length;
    const variance = profits.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / profits.length;
    
    return Math.sqrt(variance);
  }

  private calculateMaxConsecutiveWins(trades: Trade[]): number {
    let maxWins = 0;
    let currentWins = 0;
    
    for (const trade of trades) {
      if ((trade.profit || 0) > 0) {
        currentWins++;
        maxWins = Math.max(maxWins, currentWins);
      } else {
        currentWins = 0;
      }
    }
    
    return maxWins;
  }

  private calculateMaxConsecutiveLosses(trades: Trade[]): number {
    let maxLosses = 0;
    let currentLosses = 0;
    
    for (const trade of trades) {
      if ((trade.profit || 0) < 0) {
        currentLosses++;
        maxLosses = Math.max(maxLosses, currentLosses);
      } else {
        currentLosses = 0;
      }
    }
    
    return maxLosses;
  }

  private calculateConfidenceCorrelation(trades: Trade[]): number {
    if (trades.length < 2) return 0;
    
    const profits = trades.map(t => t.profit || 0);
    const confidenceScores = trades.map(t => t.confidence || 50);
    
    return this.calculateCorrelation(profits, confidenceScores);
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateSortinoRatio(profits: number[]): number {
    if (profits.length < 2) return 0;
    
    const meanReturn = profits.reduce((a, b) => a + b, 0) / profits.length;
    const negativeReturns = profits.filter(p => p < 0);
    
    if (negativeReturns.length === 0) return meanReturn > 0 ? Infinity : 0;
    
    const downsideDeviation = Math.sqrt(
      negativeReturns.reduce((sum, ret) => sum + ret * ret, 0) / negativeReturns.length
    );
    
    return downsideDeviation === 0 ? 0 : meanReturn / downsideDeviation;
  }

  private calculateCalmarRatio(results: BacktestResults): number {
    const annualizedReturn = this.calculateAnnualizedReturn(results);
    return results.max_drawdown === 0 ? 0 : annualizedReturn / results.max_drawdown;
  }

  private calculateVaR(profits: number[], confidence: number): number {
    const sortedProfits = [...profits].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedProfits.length);
    return sortedProfits[index] || 0;
  }

  private calculateExpectedShortfall(profits: number[]): number {
    const var95 = this.calculateVaR(profits, 0.95);
    const tailLosses = profits.filter(p => p <= var95);
    return tailLosses.length === 0 ? 0 : tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length;
  }

  private calculateRiskAdjustedReturn(results: BacktestResults): number {
    return results.sharpe_ratio * results.total_return;
  }

  private analyzeByConfidence(trades: Trade[]): any {
    const confidenceRanges = [
      { range: "High (80-100%)", min: 80, max: 100 },
      { range: "Medium (60-80%)", min: 60, max: 80 },
      { range: "Low (0-60%)", min: 0, max: 60 }
    ];
    
    return confidenceRanges.map(range => {
      const tradesInRange = trades.filter(t => 
        (t.confidence || 50) >= range.min && (t.confidence || 50) < range.max
      );
      
      if (tradesInRange.length === 0) {
        return { range: range.range, count: 0, avg_profit: 0, win_rate: 0 };
      }
      
      const profits = tradesInRange.map(t => t.profit || 0);
      const wins = profits.filter(p => p > 0).length;
      
      return {
        range: range.range,
        count: tradesInRange.length,
        avg_profit: profits.reduce((a, b) => a + b, 0) / profits.length,
        win_rate: (wins / tradesInRange.length) * 100
      };
    });
  }

  private analyzeByADX(trades: Trade[]): any {
    const adxRanges = [
      { range: "Strong Trend (25+)", min: 25, max: 100 },
      { range: "Weak Trend (15-25)", min: 15, max: 25 },
      { range: "No Trend (<15)", min: 0, max: 15 }
    ];
    
    return adxRanges.map(range => {
      const tradesInRange = trades.filter(t => 
        (t.adx || 0) >= range.min && (t.adx || 0) < range.max
      );
      
      if (tradesInRange.length === 0) {
        return { range: range.range, count: 0, avg_profit: 0, win_rate: 0 };
      }
      
      const profits = tradesInRange.map(t => t.profit || 0);
      const wins = profits.filter(p => p > 0).length;
      
      return {
        range: range.range,
        count: tradesInRange.length,
        avg_profit: profits.reduce((a, b) => a + b, 0) / profits.length,
        win_rate: (wins / tradesInRange.length) * 100
      };
    });
  }

  private analyzeByMomentum(trades: Trade[]): any {
    const momentumRanges = [
      { range: "Strong Momentum (20+)", min: 20, max: 100 },
      { range: "Weak Momentum (10-20)", min: 10, max: 20 },
      { range: "No Momentum (<10)", min: -100, max: 10 }
    ];
    
    return momentumRanges.map(range => {
      const tradesInRange = trades.filter(t => 
        (t.momentum_score || 0) >= range.min && (t.momentum_score || 0) < range.max
      );
      
      if (tradesInRange.length === 0) {
        return { range: range.range, count: 0, avg_profit: 0, win_rate: 0 };
      }
      
      const profits = tradesInRange.map(t => t.profit || 0);
      const wins = profits.filter(p => p > 0).length;
      
      return {
        range: range.range,
        count: tradesInRange.length,
        avg_profit: profits.reduce((a, b) => a + b, 0) / profits.length,
        win_rate: (wins / tradesInRange.length) * 100
      };
    });
  }

  private analyzeByTime(trades: Trade[]): any {
    // Simplified time analysis - in real implementation, use actual timestamps
    return {
      hourly_distribution: "Not implemented",
      daily_distribution: "Not implemented",
      weekly_distribution: "Not implemented"
    };
  }

  private analyzeExitReasons(trades: Trade[]): any {
    const exitReasons = trades.map(t => t.exit_reason || 'unknown');
    const reasonCounts = exitReasons.reduce((acc, reason) => {
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(reasonCounts).map(([reason, count]) => ({
      reason,
      count,
      percentage: (count / trades.length) * 100
    }));
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  private calculateSkewness(values: number[]): number {
    if (values.length < 3) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = this.calculateStandardDeviation(values);
    
    if (stdDev === 0) return 0;
    
    const skewness = values.reduce((sum, val) => {
      return sum + Math.pow((val - mean) / stdDev, 3);
    }, 0) / values.length;
    
    return skewness;
  }

  private calculateKurtosis(values: number[]): number {
    if (values.length < 4) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = this.calculateStandardDeviation(values);
    
    if (stdDev === 0) return 0;
    
    const kurtosis = values.reduce((sum, val) => {
      return sum + Math.pow((val - mean) / stdDev, 4);
    }, 0) / values.length;
    
    return kurtosis - 3; // Excess kurtosis
  }

  private calculateRegimePerformance(trades: Trade[]): any {
    // Simplified regime performance analysis
    return {
      trending_performance: "Not implemented",
      ranging_performance: "Not implemented",
      volatile_performance: "Not implemented"
    };
  }

  private generateRegimeInsights(regime: MarketRegime): string[] {
    const insights = [];
    
    if (regime.type === 'trending') {
      insights.push("Strong trend detected - momentum strategies may perform well");
    } else if (regime.type === 'ranging') {
      insights.push("Range-bound market - mean reversion strategies may be effective");
    } else if (regime.type === 'volatile') {
      insights.push("High volatility - consider reducing position sizes");
    }
    
    if (regime.volatility > 60) {
      insights.push("High volatility environment - increased risk");
    }
    
    if (regime.strength > 80) {
      insights.push("Very strong trend - high confidence in direction");
    }
    
    return insights;
  }

  private generateRegimeRecommendations(regime: MarketRegime): string[] {
    const recommendations = [];
    
    if (regime.type === 'trending') {
      recommendations.push("Consider trend-following strategies");
      recommendations.push("Use trailing stops to capture trends");
    } else if (regime.type === 'ranging') {
      recommendations.push("Consider mean reversion strategies");
      recommendations.push("Use support/resistance levels for entries");
    } else if (regime.type === 'volatile') {
      recommendations.push("Reduce position sizes");
      recommendations.push("Use wider stop-losses");
    }
    
    return recommendations;
  }

  private generateStrategyRecommendations(strategyType: string, results: BacktestResults): any[] {
    const recommendations = [];
    
    switch (strategyType) {
      case 'mtf_momentum':
        if (results.momentum_avg < 10) {
          recommendations.push({
            type: "strategy",
            priority: "medium",
            message: "Low average momentum score. Consider adjusting momentum parameters.",
            action: "Review momentum calculation and thresholds"
          });
        }
        break;
      
      case 'sma_crossover':
        if (results.adx_avg < 20) {
          recommendations.push({
            type: "strategy",
            priority: "medium",
            message: "Low average ADX. Consider adding trend strength filters.",
            action: "Implement ADX-based trend confirmation"
          });
        }
        break;
      
      case 'ath_guard':
        if (results.confidence_avg < 60) {
          recommendations.push({
            type: "strategy",
            priority: "high",
            message: "Low average confidence. Consider tightening entry criteria.",
            action: "Review and optimize entry conditions"
          });
        }
        break;
      
      case '4h_reentry':
        if (results.session_strength_avg < 0.5) {
          recommendations.push({
            type: "strategy",
            priority: "medium",
            message: "Low session strength. Consider improving session detection.",
            action: "Optimize session strength calculation"
          });
        }
        break;
    }
    
    return recommendations;
  }
}
