// Unified Backtest Engine Test Script
// Tests the new unified backtest engine with all strategies

import { UnifiedBacktestEngine } from './unified-backtest-engine.ts';
import { AdaptiveStrategyManager, defaultAdaptiveParameters } from './adaptive-strategy-manager.ts';
import { EnhancedReporting } from './enhanced-reporting.ts';
import { BacktestConfig, BaseConfig } from './strategy-interfaces.ts';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_time: number;
  close_time: number;
}

// Generate test data
function generateTestData(): Candle[] {
  const candles: Candle[] = [];
  let price = 50000;
  const baseVolume = 1000000;
  
  // Generate 1000 candles (simulating 1-minute data)
  for (let i = 0; i < 1000; i++) {
    const volatility = 0.02;
    const change = (Math.random() - 0.5) * volatility;
    price *= (1 + change);
    
    const high = price * (1 + Math.random() * 0.01);
    const low = price * (1 - Math.random() * 0.01);
    const volume = baseVolume * (0.8 + Math.random() * 0.4);
    
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

// Mock strategy evaluator
function mockStrategyEvaluator(candles: Candle[], index: number, config: BaseConfig): any {
  const currentCandle = candles[index];
  const prevCandle = candles[index - 1];
  
  // Simple mock strategy: buy if price goes up, sell if price goes down
  if (currentCandle.close > prevCandle.close) {
    return {
      signal_type: 'BUY',
      reason: 'Price increased',
      stop_loss: currentCandle.close * 0.98,
      take_profit: currentCandle.close * 1.02,
      confidence: 70,
      adx: 25,
      bollinger_position: 0.6,
      momentum_score: 15,
      session_strength: 0.7,
      time_to_expire: 60
    };
  } else if (currentCandle.close < prevCandle.close) {
    return {
      signal_type: 'SELL',
      reason: 'Price decreased',
      stop_loss: currentCandle.close * 1.02,
      take_profit: currentCandle.close * 0.98,
      confidence: 65,
      adx: 20,
      bollinger_position: 0.4,
      momentum_score: -10,
      session_strength: 0.6,
      time_to_expire: 60
    };
  }
  
  return {
    signal_type: null,
    reason: 'No signal'
  };
}

// Test the unified backtest engine
async function testUnifiedBacktestEngine() {
  console.log('🧪 Testing Unified Backtest Engine...');
  
  const testCandles = generateTestData();
  console.log(`📊 Generated ${testCandles.length} test candles`);
  
  // Create backtest configuration
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
  
  // Create strategy configuration
  const strategyConfig: BaseConfig = {
    adx_threshold: 20,
    bollinger_period: 20,
    bollinger_std: 2.0,
    rsi_oversold: 30,
    rsi_overbought: 70,
    momentum_threshold: 15,
    volume_multiplier: 1.2,
    trailing_stop_percent: 1.0,
    max_position_time: 60
  };
  
  // Create unified backtest engine
  const engine = new UnifiedBacktestEngine(backtestConfig, defaultAdaptiveParameters);
  
  console.log('🚀 Running unified backtest...');
  const results = await engine.runBacktest(testCandles, mockStrategyEvaluator, strategyConfig);
  
  console.log('📈 Backtest Results:');
  console.log(`Initial Balance: $${results.initial_balance.toFixed(2)}`);
  console.log(`Final Balance: $${results.final_balance.toFixed(2)}`);
  console.log(`Total Return: ${results.total_return.toFixed(2)}%`);
  console.log(`Total Trades: ${results.total_trades}`);
  console.log(`Win Rate: ${results.win_rate.toFixed(2)}%`);
  console.log(`Max Drawdown: ${results.max_drawdown.toFixed(2)}%`);
  console.log(`Sharpe Ratio: ${results.sharpe_ratio.toFixed(2)}`);
  console.log(`Profit Factor: ${results.profit_factor.toFixed(2)}`);
  
  // Enhanced metrics
  console.log('\n📊 Enhanced Metrics:');
  console.log(`Average Confidence: ${results.confidence_avg.toFixed(1)}%`);
  console.log(`Average ADX: ${results.adx_avg.toFixed(2)}`);
  console.log(`Average Momentum: ${results.momentum_avg.toFixed(2)}`);
  console.log(`Average Session Strength: ${results.session_strength_avg.toFixed(3)}`);
  
  // Test adaptive strategy manager
  console.log('\n🔧 Testing Adaptive Strategy Manager...');
  const adaptiveManager = new AdaptiveStrategyManager(defaultAdaptiveParameters);
  
  // Update market regime
  adaptiveManager.updateMarketRegime(testCandles, testCandles.length - 1);
  const currentRegime = adaptiveManager.getCurrentRegime();
  
  console.log('📊 Current Market Regime:');
  console.log(`Type: ${currentRegime.type}`);
  console.log(`Strength: ${currentRegime.strength.toFixed(1)}%`);
  console.log(`Volatility: ${currentRegime.volatility.toFixed(1)}%`);
  console.log(`Trend Direction: ${currentRegime.trend_direction}`);
  console.log(`Confidence: ${currentRegime.confidence.toFixed(1)}%`);
  
  // Test enhanced reporting
  console.log('\n📋 Testing Enhanced Reporting...');
  const reporting = new EnhancedReporting();
  const report = reporting.generateReport(results, 'test_strategy', currentRegime);
  
  console.log('📊 Enhanced Report Generated:');
  console.log(`Summary: ${JSON.stringify(report.summary, null, 2)}`);
  console.log(`Performance: ${JSON.stringify(report.performance, null, 2)}`);
  console.log(`Risk: ${JSON.stringify(report.risk, null, 2)}`);
  console.log(`Recommendations: ${report.recommendations.recommendations.length} recommendations generated`);
  
  console.log('\n✅ Unified Backtest Engine test completed!');
}

// Run the test
testUnifiedBacktestEngine();
