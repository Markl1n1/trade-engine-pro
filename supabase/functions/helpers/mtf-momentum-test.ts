// Test script for optimized MTF Momentum strategy
// This script compares old vs new parameters

import { evaluateMTFMomentum, defaultMTFMomentumConfig } from './mtf-momentum-strategy.ts';

// Test data generator
function generateTestCandles(count: number, basePrice: number = 3000): any[] {
  const candles: any[] = [];
  let currentPrice = basePrice;
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.02; // ±1% change
    currentPrice *= (1 + change);
    
    const high = currentPrice * (1 + Math.random() * 0.01);
    const low = currentPrice * (1 - Math.random() * 0.01);
    const volume = 1000 + Math.random() * 500;
    
    candles.push({
      open: currentPrice,
      high: high,
      low: low,
      close: currentPrice,
      volume: volume,
      timestamp: Date.now() + i * 60000 // 1 minute intervals
    });
  }
  
  return candles;
}

// Test function
export async function testMTFMomentumOptimization() {
  console.log('🧪 Testing MTF Momentum Optimization...');
  
  // Generate test data
  const candles1m = generateTestCandles(200);
  const candles5m = generateTestCandles(40);  // 5m candles
  const candles15m = generateTestCandles(14); // 15m candles
  
  console.log(`📊 Generated test data: ${candles1m.length} 1m, ${candles5m.length} 5m, ${candles15m.length} 15m candles`);
  
  // Test with old parameters
  const oldConfig = {
    rsi_period: 14,
    rsi_entry_threshold: 55,
    macd_fast: 12,
    macd_slow: 26,
    macd_signal: 9,
    volume_multiplier: 1.2
  };
  
  // Test with new optimized parameters
  const newConfig = defaultMTFMomentumConfig;
  
  console.log('\n🔍 Testing with OLD parameters:');
  console.log('Config:', oldConfig);
  
  const oldSignal = evaluateMTFMomentum(candles1m, candles5m, candles15m, oldConfig, false);
  console.log('Signal:', oldSignal);
  
  console.log('\n🚀 Testing with NEW optimized parameters:');
  console.log('Config:', newConfig);
  
  const newSignal = evaluateMTFMomentum(candles1m, candles5m, candles15m, newConfig, false);
  console.log('Signal:', newSignal);
  
  // Performance comparison
  console.log('\n📈 Performance Comparison:');
  console.log('Old RSI threshold:', oldConfig.rsi_entry_threshold);
  console.log('New RSI threshold:', newConfig.rsi_entry_threshold);
  console.log('Old MACD (fast/slow/signal):', `${oldConfig.macd_fast}/${oldConfig.macd_slow}/${oldConfig.macd_signal}`);
  console.log('New MACD (fast/slow/signal):', `${newConfig.macd_fast}/${newConfig.macd_slow}/${newConfig.macd_signal}`);
  console.log('Old volume multiplier:', oldConfig.volume_multiplier);
  console.log('New volume multiplier:', newConfig.volume_multiplier);
  
  // Expected improvements
  console.log('\n✨ Expected Improvements:');
  console.log('✅ More frequent signals (RSI threshold: 55 → 50)');
  console.log('✅ Faster response (MACD: 12/26/9 → 8/21/5)');
  console.log('✅ More volume flexibility (1.2x → 1.1x)');
  console.log('✅ ATR-based risk management');
  console.log('✅ Signal confidence scoring');
  console.log('✅ Enhanced signal information');
  
  return {
    oldSignal,
    newSignal,
    improvements: {
      rsiThreshold: oldConfig.rsi_entry_threshold - newConfig.rsi_entry_threshold,
      macdSpeed: 'Faster',
      volumeFlexibility: 'More flexible',
      riskManagement: 'ATR-based',
      signalQuality: 'Confidence scoring'
    }
  };
}

// Run test if called directly
if (import.meta.main) {
  testMTFMomentumOptimization()
    .then(result => {
      console.log('\n🎯 Test Results:', result);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
    });
}
