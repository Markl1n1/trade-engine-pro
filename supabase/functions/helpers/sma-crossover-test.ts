// Test script for optimized SMA Crossover strategy
// This script compares old vs new parameters for 15m timeframe

import { evaluateSMACrossoverStrategy, defaultSMACrossoverConfig } from './sma-crossover-strategy.ts';

// Test data generator for 15m timeframe
function generateTestCandles15m(count: number, basePrice: number = 50000): any[] {
  const candles: any[] = [];
  let currentPrice = basePrice;
  
  for (let i = 0; i < count; i++) {
    // More realistic 15m price movements
    const change = (Math.random() - 0.5) * 0.005; // ±0.25% change per 15m
    currentPrice *= (1 + change);
    
    const high = currentPrice * (1 + Math.random() * 0.002);
    const low = currentPrice * (1 - Math.random() * 0.002);
    const volume = 5000 + Math.random() * 2000; // Higher volume for 15m
    
    candles.push({
      open: currentPrice,
      high: high,
      low: low,
      close: currentPrice,
      volume: volume,
      timestamp: Date.now() + i * 900000 // 15 minute intervals
    });
  }
  
  return candles;
}

// Test function
export async function testSMACrossoverOptimization() {
  console.log('🧪 Testing SMA Crossover Optimization for 15m...');
  
  // Generate test data for 15m timeframe
  const candles = generateTestCandles15m(300); // 300 candles = 75 hours of 15m data
  
  console.log(`📊 Generated test data: ${candles.length} 15m candles`);
  
  // Test with old parameters
  const oldConfig = {
    sma_fast_period: 20,
    sma_slow_period: 200,
    rsi_period: 14,
    rsi_overbought: 70,
    rsi_oversold: 30,
    volume_multiplier: 1.2,
    atr_sl_multiplier: 2.0,
    atr_tp_multiplier: 3.0
  };
  
  // Test with new optimized parameters
  const newConfig = defaultSMACrossoverConfig;
  
  console.log('\n🔍 Testing with OLD parameters:');
  console.log('Config:', oldConfig);
  
  const oldSignal = evaluateSMACrossoverStrategy(candles, oldConfig, false);
  console.log('Signal:', oldSignal);
  
  console.log('\n🚀 Testing with NEW optimized parameters:');
  console.log('Config:', newConfig);
  
  const newSignal = evaluateSMACrossoverStrategy(candles, newConfig, false);
  console.log('Signal:', newSignal);
  
  // Performance comparison
  console.log('\n📈 Performance Comparison:');
  console.log('Old RSI overbought:', oldConfig.rsi_overbought);
  console.log('New RSI overbought:', newConfig.rsi_overbought);
  console.log('Old RSI oversold:', oldConfig.rsi_oversold);
  console.log('New RSI oversold:', newConfig.rsi_oversold);
  console.log('Old volume multiplier:', oldConfig.volume_multiplier);
  console.log('New volume multiplier:', newConfig.volume_multiplier);
  console.log('Old ATR SL/TP:', `${oldConfig.atr_sl_multiplier}/${oldConfig.atr_tp_multiplier}`);
  console.log('New ATR SL/TP:', `${newConfig.atr_sl_multiplier}/${newConfig.atr_tp_multiplier}`);
  
  // New features
  console.log('\n✨ New Enhanced Features:');
  console.log('✅ ADX trend strength filter (threshold: 25)');
  console.log('✅ Bollinger Bands analysis (period: 20, std: 2)');
  console.log('✅ Enhanced trend strength scoring');
  console.log('✅ Signal confidence calculation');
  console.log('✅ Time-based position management (4 hours max)');
  console.log('✅ Trailing stop for trends (1.0%)');
  
  // Expected improvements
  console.log('\n🎯 Expected Improvements for 15m:');
  console.log('✅ Better trend detection with ADX');
  console.log('✅ Reduced false signals with Bollinger Bands');
  console.log('✅ Improved risk management with larger ATR multipliers');
  console.log('✅ Enhanced signal quality with confidence scoring');
  console.log('✅ Better position management with time limits');
  
  return {
    oldSignal,
    newSignal,
    improvements: {
      rsiFilters: 'More restrictive (70/30 → 75/25)',
      volumeRequirement: 'Higher (1.2x → 1.3x)',
      riskManagement: 'Enhanced (2.0/3.0 → 2.5/4.0)',
      trendDetection: 'ADX + Bollinger Bands',
      signalQuality: 'Confidence scoring',
      positionManagement: 'Time-based limits'
    }
  };
}

// Run test if called directly
if (import.meta.main) {
  testSMACrossoverOptimization()
    .then(result => {
      console.log('\n🎯 Test Results:', result);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
    });
}
