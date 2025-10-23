// Comprehensive Testing Suite
// Complete testing and validation for all optimized strategies

import { 
  Candle, 
  Trade, 
  BaseSignal, 
  BaseConfig, 
  BacktestConfig, 
  BacktestResults,
  MarketRegime 
} from './strategy-interfaces.ts';

import { UnifiedBacktestEngine } from './unified-backtest-engine.ts';
import { AdaptiveStrategyManager, defaultAdaptiveParameters } from './adaptive-strategy-manager.ts';
import { EnhancedReporting } from './enhanced-reporting.ts';

// Import all strategy helpers
import { evaluateMTFMomentum } from './mtf-momentum-strategy.ts';
import { evaluateSMACrossoverStrategy } from './sma-crossover-strategy.ts';
import { evaluateATHGuardStrategy } from './ath-guard-strategy.ts';
import { evaluate4hReentry } from './4h-reentry-strategy.ts';

export class ComprehensiveTestingSuite {
  private testResults: any[] = [];
  private comparisonResults: any = {};
  
  constructor() {
    this.testResults = [];
    this.comparisonResults = {};
  }

  // Run comprehensive tests for all strategies
  async runComprehensiveTests(): Promise<any> {
    console.log('🧪 Starting Comprehensive Testing Suite...');
    
    const testData = this.generateComprehensiveTestData();
    console.log(`📊 Generated test data: ${testData.length} candles`);
    
    // Test each strategy
    const strategies = [
      { name: 'MTF Momentum', evaluator: this.createMTFEvaluator() },
      { name: 'SMA Crossover', evaluator: this.createSMAEvaluator() },
      { name: 'ATH Guard', evaluator: this.createATHGuardEvaluator() },
      { name: '4h Reentry', evaluator: this.create4hReentryEvaluator() }
    ];
    
    for (const strategy of strategies) {
      console.log(`\n🔧 Testing ${strategy.name}...`);
      const results = await this.testStrategy(strategy.name, strategy.evaluator, testData);
      this.testResults.push(results);
    }
    
    // Generate comparison report
    const comparisonReport = this.generateComparisonReport();
    
    // Generate final recommendations
    const recommendations = this.generateFinalRecommendations();
    
    return {
      testResults: this.testResults,
      comparisonReport,
      recommendations,
      summary: this.generateTestSummary()
    };
  }

  // Test individual strategy
  private async testStrategy(
    strategyName: string, 
    evaluator: (candles: Candle[], index: number, config: BaseConfig) => BaseSignal,
    testData: Candle[]
  ): Promise<any> {
    const backtestConfig: BacktestConfig = {
      initialBalance: 10000,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
      trailingStopPercent: 1.0,
      productType: 'futures',
      leverage: 10,
      makerFee: 0.1,
      takerFee: 0.1,
      slippage: 0.05,
      executionTiming: 'close',
      positionSizePercent: 5.0,
      exchangeType: 'binance',
      symbol: 'BTCUSDT'
    };
    
    const strategyConfig = this.getStrategyConfig(strategyName);
    const engine = new UnifiedBacktestEngine(backtestConfig, defaultAdaptiveParameters);
    
    // Run backtest
    const results = await engine.runBacktest(testData, evaluator, strategyConfig);
    
    // Test adaptive parameters
    const adaptiveManager = new AdaptiveStrategyManager(defaultAdaptiveParameters);
    adaptiveManager.updateMarketRegime(testData, testData.length - 1);
    const currentRegime = adaptiveManager.getCurrentRegime();
    
    // Generate enhanced report
    const reporting = new EnhancedReporting();
    const enhancedReport = reporting.generateReport(results, strategyName, currentRegime);
    
    return {
      strategyName,
      results,
      enhancedReport,
      currentRegime,
      performanceScore: this.calculatePerformanceScore(results),
      riskScore: this.calculateRiskScore(results),
      overallScore: 0 // Will be calculated
    };
  }

  // Create strategy evaluators
  private createMTFEvaluator() {
    return (candles: Candle[], index: number, config: BaseConfig): BaseSignal => {
      if (index < 200) return { signal_type: null, reason: 'Insufficient data' };
      
      const recentCandles = candles.slice(0, index + 1);
      const signal = evaluateMTFMomentum(recentCandles, config, false);
      
      return {
        signal_type: signal.signal_type,
        reason: signal.reason,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        confidence: signal.confidence,
        adx: signal.adx,
        bollinger_position: signal.bollinger_position,
        momentum_score: signal.momentum_score,
        time_to_expire: signal.time_to_expire
      };
    };
  }

  private createSMAEvaluator() {
    return (candles: Candle[], index: number, config: BaseConfig): BaseSignal => {
      if (index < 200) return { signal_type: null, reason: 'Insufficient data' };
      
      const recentCandles = candles.slice(0, index + 1);
      const signal = evaluateSMACrossoverStrategy(recentCandles, config, false);
      
      return {
        signal_type: signal.signal_type,
        reason: signal.reason,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        confidence: signal.confidence,
        adx: signal.adx,
        bollinger_position: signal.bollinger_position,
        trend_strength: signal.trend_strength,
        time_to_expire: signal.time_to_expire
      };
    };
  }

  private createATHGuardEvaluator() {
    return (candles: Candle[], index: number, config: BaseConfig): BaseSignal => {
      if (index < 200) return { signal_type: null, reason: 'Insufficient data' };
      
      const recentCandles = candles.slice(0, index + 1);
      const signal = evaluateATHGuardStrategy(recentCandles, config, false);
      
      return {
        signal_type: signal.signal_type,
        reason: signal.reason,
        stop_loss: signal.stop_loss,
        take_profit_1: signal.take_profit_1,
        take_profit_2: signal.take_profit_2,
        confidence: signal.confidence,
        adx: signal.adx,
        bollinger_position: signal.bollinger_position,
        momentum_score: signal.momentum_score,
        time_to_expire: signal.time_to_expire
      };
    };
  }

  private create4hReentryEvaluator() {
    return (candles: Candle[], index: number, config: BaseConfig): BaseSignal => {
      if (index < 200) return { signal_type: null, reason: 'Insufficient data' };
      
      const recentCandles = candles.slice(0, index + 1);
      const signal = evaluate4hReentry(recentCandles, null, { 
        reentry_session_start: "00:00",
        reentry_session_end: "03:59",
        reentry_risk_reward: 2
      });
      
      return {
        signal_type: signal.signal_type,
        reason: signal.reason,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        confidence: signal.confidence,
        adx: signal.adx,
        bollinger_position: signal.bollinger_position,
        momentum_score: signal.momentum_score,
        session_strength: signal.session_strength,
        time_to_expire: signal.time_to_expire
      };
    };
  }

  // Generate comprehensive test data
  private generateComprehensiveTestData(): Candle[] {
    const candles: Candle[] = [];
    let price = 50000;
    const baseVolume = 1000000;
    
    // Generate 2000 candles with different market conditions
    for (let i = 0; i < 2000; i++) {
      let volatility = 0.02;
      
      // Simulate different market regimes
      if (i < 500) {
        // Trending market
        volatility = 0.015;
        price *= (1 + (Math.random() - 0.3) * volatility);
      } else if (i < 1000) {
        // Ranging market
        volatility = 0.01;
        price *= (1 + (Math.random() - 0.5) * volatility);
      } else if (i < 1500) {
        // Volatile market
        volatility = 0.04;
        price *= (1 + (Math.random() - 0.5) * volatility);
      } else {
        // Mixed market
        volatility = 0.025;
        price *= (1 + (Math.random() - 0.5) * volatility);
      }
      
      const high = price * (1 + Math.random() * 0.01);
      const low = price * (1 - Math.random() * 0.01);
      const volume = baseVolume * (0.5 + Math.random() * 1.0);
      
      candles.push({
        open: price,
        high: Math.max(price, high),
        low: Math.min(price, low),
        close: price,
        volume: volume,
        open_time: Date.now() + (i * 60 * 1000),
        close_time: Date.now() + ((i + 1) * 60 * 1000)
      });
    }
    
    return candles;
  }

  // Get strategy configuration
  private getStrategyConfig(strategyName: string): BaseConfig {
    switch (strategyName) {
      case 'MTF Momentum':
        return {
          adx_threshold: 20,
          bollinger_period: 20,
          bollinger_std: 2.0,
          rsi_oversold: 30,
          rsi_overbought: 70,
          momentum_threshold: 15,
          volume_multiplier: 1.1,
          trailing_stop_percent: 0.5,
          max_position_time: 60
        };
      
      case 'SMA Crossover':
        return {
          adx_threshold: 25,
          bollinger_period: 20,
          bollinger_std: 2.0,
          rsi_oversold: 25,
          rsi_overbought: 75,
          momentum_threshold: 20,
          volume_multiplier: 1.3,
          trailing_stop_percent: 0.5,
          max_position_time: 120
        };
      
      case 'ATH Guard':
        return {
          adx_threshold: 20,
          bollinger_period: 20,
          bollinger_std: 2.0,
          rsi_oversold: 30,
          rsi_overbought: 70,
          momentum_threshold: 15,
          volume_multiplier: 1.2,
          trailing_stop_percent: 0.5,
          max_position_time: 60
        };
      
      case '4h Reentry':
        return {
          adx_threshold: 20,
          bollinger_period: 20,
          bollinger_std: 2.0,
          rsi_oversold: 30,
          rsi_overbought: 70,
          momentum_threshold: 10,
          volume_multiplier: 1.2,
          trailing_stop_percent: 0.5,
          max_position_time: 240
        };
      
      default:
        return {
          adx_threshold: 20,
          bollinger_period: 20,
          bollinger_std: 2.0,
          rsi_oversold: 30,
          rsi_overbought: 70,
          momentum_threshold: 15,
          volume_multiplier: 1.2,
          trailing_stop_percent: 0.5,
          max_position_time: 120
        };
    }
  }

  // Calculate performance score
  private calculatePerformanceScore(results: BacktestResults): number {
    const returnScore = Math.min(100, Math.max(0, results.total_return + 50));
    const winRateScore = results.win_rate;
    const profitFactorScore = Math.min(100, results.profit_factor * 25);
    const sharpeScore = Math.min(100, Math.max(0, results.sharpe_ratio * 20));
    
    return (returnScore + winRateScore + profitFactorScore + sharpeScore) / 4;
  }

  // Calculate risk score
  private calculateRiskScore(results: BacktestResults): number {
    const drawdownScore = Math.max(0, 100 - results.max_drawdown);
    const tradeCountScore = Math.min(100, results.total_trades / 2);
    const consistencyScore = results.win_rate;
    
    return (drawdownScore + tradeCountScore + consistencyScore) / 3;
  }

  // Generate comparison report
  private generateComparisonReport(): any {
    const comparison = {
      strategies: this.testResults.map(result => ({
        name: result.strategyName,
        total_return: result.results.total_return,
        win_rate: result.results.win_rate,
        max_drawdown: result.results.max_drawdown,
        sharpe_ratio: result.results.sharpe_ratio,
        profit_factor: result.results.profit_factor,
        total_trades: result.results.total_trades,
        performance_score: result.performanceScore,
        risk_score: result.riskScore
      })),
      
      rankings: {
        by_return: this.testResults
          .sort((a, b) => b.results.total_return - a.results.total_return)
          .map(r => r.strategyName),
        
        by_sharpe: this.testResults
          .sort((a, b) => b.results.sharpe_ratio - a.results.sharpe_ratio)
          .map(r => r.strategyName),
        
        by_win_rate: this.testResults
          .sort((a, b) => b.results.win_rate - a.results.win_rate)
          .map(r => r.strategyName),
        
        by_risk: this.testResults
          .sort((a, b) => a.results.max_drawdown - b.results.max_drawdown)
          .map(r => r.strategyName)
      },
      
      best_performer: this.testResults.reduce((best, current) => 
        current.performanceScore > best.performanceScore ? current : best
      ),
      
      lowest_risk: this.testResults.reduce((best, current) => 
        current.results.max_drawdown < best.results.max_drawdown ? current : best
      )
    };
    
    return comparison;
  }

  // Generate final recommendations
  private generateFinalRecommendations(): any {
    const recommendations = [];
    
    // Performance-based recommendations
    const bestPerformer = this.testResults.reduce((best, current) => 
      current.performanceScore > best.performanceScore ? current : best
    );
    
    recommendations.push({
      type: "performance",
      priority: "high",
      message: `${bestPerformer.strategyName} shows the best performance with ${bestPerformer.performanceScore.toFixed(1)}% score`,
      action: `Consider focusing on ${bestPerformer.strategyName} for live trading`
    });
    
    // Risk-based recommendations
    const lowestRisk = this.testResults.reduce((best, current) => 
      current.results.max_drawdown < best.results.max_drawdown ? current : best
    );
    
    recommendations.push({
      type: "risk",
      priority: "high",
      message: `${lowestRisk.strategyName} shows the lowest risk with ${lowestRisk.results.max_drawdown.toFixed(2)}% max drawdown`,
      action: `Use ${lowestRisk.strategyName} for conservative trading`
    });
    
    // Strategy-specific recommendations
    this.testResults.forEach(result => {
      if (result.results.win_rate < 50) {
        recommendations.push({
          type: "strategy",
          priority: "medium",
          message: `${result.strategyName} has low win rate (${result.results.win_rate.toFixed(1)}%)`,
          action: `Review and optimize ${result.strategyName} entry conditions`
        });
      }
      
      if (result.results.max_drawdown > 15) {
        recommendations.push({
          type: "risk",
          priority: "medium",
          message: `${result.strategyName} has high drawdown (${result.results.max_drawdown.toFixed(2)}%)`,
          action: `Implement stricter risk management for ${result.strategyName}`
        });
      }
    });
    
    return {
      recommendations,
      summary: {
        total_recommendations: recommendations.length,
        high_priority: recommendations.filter(r => r.priority === 'high').length,
        medium_priority: recommendations.filter(r => r.priority === 'medium').length
      }
    };
  }

  // Generate test summary
  private generateTestSummary(): any {
    const totalTests = this.testResults.length;
    const avgReturn = this.testResults.reduce((sum, r) => sum + r.results.total_return, 0) / totalTests;
    const avgWinRate = this.testResults.reduce((sum, r) => sum + r.results.win_rate, 0) / totalTests;
    const avgDrawdown = this.testResults.reduce((sum, r) => sum + r.results.max_drawdown, 0) / totalTests;
    const avgSharpe = this.testResults.reduce((sum, r) => sum + r.results.sharpe_ratio, 0) / totalTests;
    
    return {
      total_strategies_tested: totalTests,
      average_return: avgReturn,
      average_win_rate: avgWinRate,
      average_drawdown: avgDrawdown,
      average_sharpe: avgSharpe,
      best_strategy: this.testResults.reduce((best, current) => 
        current.performanceScore > best.performanceScore ? current : best
      ).strategyName,
      lowest_risk_strategy: this.testResults.reduce((best, current) => 
        current.results.max_drawdown < best.results.max_drawdown ? current : best
      ).strategyName
    };
  }
}

// Run comprehensive tests
export async function runComprehensiveTests(): Promise<any> {
  const testSuite = new ComprehensiveTestingSuite();
  return await testSuite.runComprehensiveTests();
}
