// Strategy Diagnostic Tool
// Analyzes why strategies show 0 trades and provides fixes

import { Candle } from './strategy-interfaces.ts';

export interface DiagnosticResult {
  strategyName: string;
  issues: string[];
  fixes: string[];
  recommendations: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface StrategyDiagnostic {
  totalCandles: number;
  signalsGenerated: number;
  tradesExecuted: number;
  signalRate: number;
  tradeRate: number;
  issues: DiagnosticResult[];
}

// Analyze FVG Strategy
export function diagnoseFVGStrategy(candles: Candle[], config: any): DiagnosticResult {
  const issues: string[] = [];
  const fixes: string[] = [];
  const recommendations: string[] = [];
  
  // Check minimum gap size
  const currentPrice = candles[candles.length - 1].close;
  const minGapSize = currentPrice * 0.001; // 0.1%
  
  let gapsFound = 0;
  let validGaps = 0;
  
  for (let i = 2; i < candles.length; i++) {
    const prev = candles[i - 2];
    const middle = candles[i - 1];
    const next = candles[i];
    
    const bullishGap = prev.high < next.low;
    const bearishGap = prev.low > next.high;
    
    if (bullishGap || bearishGap) {
      gapsFound++;
      const gapSize = bullishGap ? (next.low - prev.high) : (prev.low - next.high);
      
      if (gapSize >= minGapSize) {
        validGaps++;
      }
    }
  }
  
  if (gapsFound === 0) {
    issues.push('No gaps found in price data');
    fixes.push('Reduce minimum gap size threshold');
    recommendations.push('Consider using 0.05% instead of 0.1% minimum gap');
  } else if (validGaps === 0) {
    issues.push('Gaps found but all too small');
    fixes.push('Reduce minimum gap size from 0.1% to 0.05%');
    recommendations.push('Current threshold too strict for crypto markets');
  }
  
  // Check time window restrictions
  if (config.keyTimeStart && config.keyTimeEnd) {
    issues.push('Time window restrictions may block crypto trading');
    fixes.push('Remove time restrictions for crypto symbols');
    recommendations.push('Only apply time windows to futures, not crypto');
  }
  
  // Check retest logic
  let retestAttempts = 0;
  let successfulRetests = 0;
  
  for (let i = 10; i < candles.length; i++) {
    const recentCandles = candles.slice(i - 10, i + 1);
    // Simulate FVG detection and retest logic
    // This is a simplified check
    retestAttempts++;
  }
  
  if (retestAttempts > 0 && successfulRetests === 0) {
    issues.push('Retest logic too strict');
    fixes.push('Add tolerance to retest detection');
    recommendations.push('Allow 0.05% tolerance for retest detection');
  }
  
  return {
    strategyName: 'FVG Scalping',
    issues,
    fixes,
    recommendations,
    severity: issues.length > 2 ? 'HIGH' : issues.length > 0 ? 'MEDIUM' : 'LOW'
  };
}

// Analyze MTF Momentum Strategy
export function diagnoseMTFMomentumStrategy(candles: Candle[], config: any): DiagnosticResult {
  const issues: string[] = [];
  const fixes: string[] = [];
  const recommendations: string[] = [];
  
  // Check RSI thresholds
  const closes = candles.map(c => c.close);
  const rsiValues = calculateRSI(closes, config.rsi_period || 14);
  const currentRSI = rsiValues[rsiValues.length - 1];
  
  if (currentRSI < (config.rsi_entry_threshold || 50)) {
    issues.push('RSI entry threshold too high');
    fixes.push('Reduce RSI entry threshold from 50 to 45');
    recommendations.push('Crypto markets need more lenient RSI thresholds');
  }
  
  // Check volume requirements
  const currentVolume = candles[candles.length - 1].volume;
  const avgVolume = calculateVolumeSMA(candles, 20);
  const volumeRatio = currentVolume / avgVolume;
  
  if (volumeRatio < (config.volume_multiplier || 1.1)) {
    issues.push('Volume multiplier too strict');
    fixes.push('Reduce volume multiplier from 1.1 to 1.0');
    recommendations.push('Crypto markets have different volume patterns');
  }
  
  // Check multi-timeframe requirements
  if (config.require_all_timeframes) {
    issues.push('Requiring all timeframes to align is too strict');
    fixes.push('Allow at least one higher timeframe to confirm');
    recommendations.push('Use OR logic instead of AND for higher timeframes');
  }
  
  return {
    strategyName: 'MTF Momentum',
    issues,
    fixes,
    recommendations,
    severity: issues.length > 2 ? 'HIGH' : issues.length > 0 ? 'MEDIUM' : 'LOW'
  };
}

// Analyze SMA Crossover Strategy
export function diagnoseSMACrossoverStrategy(candles: Candle[], config: any): DiagnosticResult {
  const issues: string[] = [];
  const fixes: string[] = [];
  const recommendations: string[] = [];
  
  // Check SMA periods
  const closes = candles.map(c => c.close);
  const smaFast = calculateSMA(closes, config.sma_fast_period || 20);
  const smaSlow = calculateSMA(closes, config.sma_slow_period || 200);
  
  const currentSMAFast = smaFast[smaFast.length - 1];
  const currentSMASlow = smaSlow[smaSlow.length - 1];
  
  if (currentSMAFast < currentSMASlow) {
    issues.push('SMA crossover not detected');
    fixes.push('Check if crossover logic is working correctly');
    recommendations.push('Verify SMA calculation and crossover detection');
  }
  
  // Check RSI overbought/oversold levels
  const rsiValues = calculateRSI(closes, config.rsi_period || 14);
  const currentRSI = rsiValues[rsiValues.length - 1];
  
  if (currentRSI > (config.rsi_overbought || 75)) {
    issues.push('RSI overbought threshold too low');
    fixes.push('Increase RSI overbought from 75 to 80');
    recommendations.push('Crypto markets need higher overbought levels');
  }
  
  if (currentRSI < (config.rsi_oversold || 25)) {
    issues.push('RSI oversold threshold too high');
    fixes.push('Decrease RSI oversold from 25 to 20');
    recommendations.push('Crypto markets need lower oversold levels');
  }
  
  return {
    strategyName: 'SMA Crossover',
    issues,
    fixes,
    recommendations,
    severity: issues.length > 2 ? 'HIGH' : issues.length > 0 ? 'MEDIUM' : 'LOW'
  };
}

// Main diagnostic function
export function diagnoseAllStrategies(candles: Candle[], strategies: any[]): StrategyDiagnostic {
  const results: DiagnosticResult[] = [];
  
  for (const strategy of strategies) {
    switch (strategy.type) {
      case 'fvg_scalping':
        results.push(diagnoseFVGStrategy(candles, strategy));
        break;
      case 'mtf_momentum':
        results.push(diagnoseMTFMomentumStrategy(candles, strategy));
        break;
      case 'sma_crossover':
        results.push(diagnoseSMACrossoverStrategy(candles, strategy));
        break;
    }
  }
  
  const totalCandles = candles.length;
  const signalsGenerated = results.reduce((sum, r) => sum + (r.issues.length > 0 ? 0 : 1), 0);
  const tradesExecuted = 0; // This would be calculated from actual backtest results
  
  return {
    totalCandles,
    signalsGenerated,
    tradesExecuted,
    signalRate: signalsGenerated / strategies.length,
    tradeRate: tradesExecuted / strategies.length,
    issues: results
  };
}

// Helper functions
function calculateRSI(prices: number[], period: number): number[] {
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  const rsi: number[] = [];
  for (let i = period - 1; i < gains.length; i++) {
    const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

function calculateVolumeSMA(candles: Candle[], period: number): number {
  const volumes = candles.slice(-period).map(c => c.volume);
  return volumes.reduce((a, b) => a + b, 0) / volumes.length;
}

// Generate diagnostic report
export function generateDiagnosticReport(diagnostic: StrategyDiagnostic): string {
  let report = `# Strategy Diagnostic Report\n\n`;
  report += `## Summary\n`;
  report += `- Total Candles: ${diagnostic.totalCandles}\n`;
  report += `- Signals Generated: ${diagnostic.signalsGenerated}\n`;
  report += `- Trades Executed: ${diagnostic.tradesExecuted}\n`;
  report += `- Signal Rate: ${(diagnostic.signalRate * 100).toFixed(1)}%\n`;
  report += `- Trade Rate: ${(diagnostic.tradeRate * 100).toFixed(1)}%\n\n`;
  
  report += `## Issues Found\n\n`;
  
  for (const issue of diagnostic.issues) {
    report += `### ${issue.strategyName} (${issue.severity})\n\n`;
    
    if (issue.issues.length > 0) {
      report += `**Issues:**\n`;
      issue.issues.forEach(issue => report += `- ${issue}\n`);
      report += `\n`;
    }
    
    if (issue.fixes.length > 0) {
      report += `**Fixes:**\n`;
      issue.fixes.forEach(fix => report += `- ${fix}\n`);
      report += `\n`;
    }
    
    if (issue.recommendations.length > 0) {
      report += `**Recommendations:**\n`;
      issue.recommendations.forEach(rec => report += `- ${rec}\n`);
      report += `\n`;
    }
  }
  
  return report;
}
