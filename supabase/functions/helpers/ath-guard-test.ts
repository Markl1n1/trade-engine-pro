// ATH Guard Strategy Test Script
// Tests the optimized ATH Guard strategy with enhanced parameters

import { evaluateATHGuardStrategy, defaultATHGuardConfig } from './ath-guard-strategy';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// Generate test data
function generateTestData(): Candle[] {
  const candles: Candle[] = [];
  let price = 50000;
  const baseVolume = 1000000;
  
  for (let i = 0; i < 300; i++) {
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
      timestamp: Date.now() + i * 60000 // 1 minute intervals
    });
  }
  
  return candles;
}

// Test the strategy
function testATHGuardStrategy() {
  console.log('🧪 Testing ATH Guard Strategy...');
  
  const testCandles = generateTestData();
  console.log(`📊 Generated ${testCandles.length} test candles`);
  
  // Test with default configuration
  const signal = evaluateATHGuardStrategy(testCandles, defaultATHGuardConfig, false);
  
  console.log('📈 Test Results:');
  console.log(`Signal Type: ${signal.signal_type}`);
  console.log(`Reason: ${signal.reason}`);
  
  if (signal.signal_type) {
    console.log(`Stop Loss: ${signal.stop_loss?.toFixed(2)}`);
    console.log(`Take Profit 1: ${signal.take_profit_1?.toFixed(2)}`);
    console.log(`Take Profit 2: ${signal.take_profit_2?.toFixed(2)}`);
    console.log(`ADX: ${signal.adx?.toFixed(2)}`);
    console.log(`Bollinger Position: ${signal.bollinger_position?.toFixed(3)}`);
    console.log(`Momentum Score: ${signal.momentum_score?.toFixed(2)}`);
    console.log(`Confidence: ${signal.confidence?.toFixed(1)}%`);
    console.log(`Time to Expire: ${signal.time_to_expire} minutes`);
  }
  
  // Test with custom configuration
  const customConfig = {
    ...defaultATHGuardConfig,
    adx_threshold: 25,
    momentum_threshold: 20,
    bollinger_period: 15
  };
  
  console.log('\n🔧 Testing with custom configuration...');
  const customSignal = evaluateATHGuardStrategy(testCandles, customConfig, false);
  
  console.log('📈 Custom Test Results:');
  console.log(`Signal Type: ${customSignal.signal_type}`);
  console.log(`Reason: ${customSignal.reason}`);
  
  if (customSignal.signal_type) {
    console.log(`Confidence: ${customSignal.confidence?.toFixed(1)}%`);
  }
  
  console.log('\n✅ ATH Guard Strategy test completed!');
}

// Run the test
testATHGuardStrategy();
