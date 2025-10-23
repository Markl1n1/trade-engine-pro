// 4h Reentry Strategy Test Script
// Tests the optimized 4h Reentry strategy with enhanced parameters

import { evaluate4hReentry } from './4h-reentry-strategy.ts';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
  open_time?: number;
  close_time?: number;
}

interface LiveState {
  range_high?: number;
  range_low?: number;
  position_open: boolean;
  entry_price?: number;
  entry_time?: string;
  last_processed_candle_time?: number;
}

// Generate test data with 4h session simulation
function generateTestData(): Candle[] {
  const candles: Candle[] = [];
  let price = 50000;
  const baseVolume = 1000000;
  
  // Generate 4 days of 1-minute data (4h session per day)
  for (let day = 0; day < 4; day++) {
    const dayStart = Date.now() + (day * 24 * 60 * 60 * 1000);
    
    // Generate 4h session data (00:00-03:59 NY time)
    for (let minute = 0; minute < 240; minute++) {
      const volatility = 0.01;
      const change = (Math.random() - 0.5) * volatility;
      price *= (1 + change);
      
      const high = price * (1 + Math.random() * 0.005);
      const low = price * (1 - Math.random() * 0.005);
      const volume = baseVolume * (0.8 + Math.random() * 0.4);
      
      candles.push({
        open: price,
        high: Math.max(price, high),
        low: Math.min(price, low),
        close: price,
        volume: volume,
        timestamp: dayStart + (minute * 60 * 1000),
        open_time: dayStart + (minute * 60 * 1000)
      });
    }
  }
  
  return candles;
}

// Test the strategy
function test4hReentryStrategy() {
  console.log('🧪 Testing 4h Reentry Strategy...');
  
  const testCandles = generateTestData();
  console.log(`📊 Generated ${testCandles.length} test candles (4 days of 4h sessions)`);
  
  // Mock strategy configuration
  const strategy = {
    reentry_session_start: "00:00",
    reentry_session_end: "03:59",
    reentry_risk_reward: 2
  };
  
  // Test with no live state (new session)
  const signal = evaluate4hReentry(testCandles, null, strategy, 1.0, 2.0);
  
  console.log('📈 Test Results:');
  console.log(`Signal Type: ${signal.signal_type}`);
  console.log(`Reason: ${signal.reason}`);
  
  if (signal.signal_type) {
    console.log(`Range High: ${signal.range_high?.toFixed(2)}`);
    console.log(`Range Low: ${signal.range_low?.toFixed(2)}`);
    console.log(`Stop Loss: ${signal.stop_loss?.toFixed(2)}`);
    console.log(`Take Profit: ${signal.take_profit?.toFixed(2)}`);
    console.log(`ADX: ${signal.adx?.toFixed(2)}`);
    console.log(`Bollinger Position: ${signal.bollinger_position?.toFixed(3)}`);
    console.log(`Momentum Score: ${signal.momentum_score?.toFixed(2)}`);
    console.log(`Volume Confirmation: ${signal.volume_confirmation}`);
    console.log(`Session Strength: ${signal.session_strength?.toFixed(3)}`);
    console.log(`Confidence: ${signal.confidence?.toFixed(1)}%`);
    console.log(`Time to Expire: ${signal.time_to_expire} minutes`);
  }
  
  // Test with live state (existing position)
  const liveState: LiveState = {
    range_high: 51000,
    range_low: 49000,
    position_open: false,
    entry_price: 50000,
    entry_time: new Date().toISOString()
  };
  
  console.log('\n🔧 Testing with live state...');
  const liveSignal = evaluate4hReentry(testCandles, liveState, strategy, 1.0, 2.0);
  
  console.log('📈 Live State Test Results:');
  console.log(`Signal Type: ${liveSignal.signal_type}`);
  console.log(`Reason: ${liveSignal.reason}`);
  
  if (liveSignal.signal_type) {
    console.log(`Confidence: ${liveSignal.confidence?.toFixed(1)}%`);
  }
  
  console.log('\n✅ 4h Reentry Strategy test completed!');
}

// Run the test
test4hReentryStrategy();
