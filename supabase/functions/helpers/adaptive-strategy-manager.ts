// Adaptive Strategy Manager
// Manages adaptive parameters and market regime detection

import { 
  MarketRegime, 
  AdaptiveParameters, 
  BaseConfig,
  StrategyEvaluation 
} from './strategy-interfaces.ts';

export class AdaptiveStrategyManager {
  private adaptiveParams: AdaptiveParameters;
  private currentRegime: MarketRegime;
  
  constructor(adaptiveParams: AdaptiveParameters) {
    this.adaptiveParams = adaptiveParams;
    this.currentRegime = {
      type: 'ranging',
      strength: 50,
      volatility: 30,
      trend_direction: 'sideways',
      confidence: 50
    };
  }

  // Update market regime based on recent data
  updateMarketRegime(candles: any[], index: number): void {
    const lookback = Math.min(50, index);
    const recentCandles = candles.slice(index - lookback, index);
    
    // Calculate trend strength
    const trendStrength = this.calculateTrendStrength(recentCandles);
    
    // Calculate volatility
    const volatility = this.calculateVolatility(recentCandles);
    
    // Calculate momentum
    const momentum = this.calculateMomentum(recentCandles);
    
    // Determine regime type
    let regimeType: 'trending' | 'ranging' | 'volatile';
    if (trendStrength > 0.7 && volatility < 0.4) {
      regimeType = 'trending';
    } else if (volatility > 0.6) {
      regimeType = 'volatile';
    } else {
      regimeType = 'ranging';
    }
    
    this.currentRegime = {
      type: regimeType,
      strength: trendStrength * 100,
      volatility: volatility * 100,
      trend_direction: trendStrength > 0 ? 'up' : 'down',
      confidence: Math.min(100, (trendStrength + (1 - volatility) + momentum) * 33)
    };
  }

  // Get adaptive parameters for strategy
  getAdaptiveParameters(strategyType: string): BaseConfig {
    const baseConfig = this.getBaseConfig(strategyType);
    const regimeMultiplier = this.adaptiveParams.regime_multipliers[this.currentRegime.type];
    
    return {
      ...baseConfig,
      adx_threshold: baseConfig.adx_threshold * regimeMultiplier,
      momentum_threshold: baseConfig.momentum_threshold * regimeMultiplier,
      volume_multiplier: baseConfig.volume_multiplier * regimeMultiplier,
      trailing_stop_percent: baseConfig.trailing_stop_percent * regimeMultiplier
    };
  }

  // Adjust position size based on regime and confidence
  adjustPositionSize(
    baseSize: number, 
    confidence: number, 
    evaluation: StrategyEvaluation
  ): number {
    const regimeMultiplier = this.adaptiveParams.regime_multipliers[this.currentRegime.type];
    const confidenceMultiplier = this.getConfidenceMultiplier(confidence);
    const volatilityMultiplier = this.getVolatilityMultiplier(this.currentRegime.volatility);
    
    return baseSize * regimeMultiplier * confidenceMultiplier * volatilityMultiplier;
  }

  // Get confidence multiplier
  private getConfidenceMultiplier(confidence: number): number {
    if (confidence >= this.adaptiveParams.confidence_thresholds.high) return 1.2;
    if (confidence >= this.adaptiveParams.confidence_thresholds.medium) return 1.0;
    return 0.8;
  }

  // Get volatility multiplier
  private getVolatilityMultiplier(volatility: number): number {
    if (volatility >= this.adaptiveParams.volatility_thresholds.high) return 0.8;
    if (volatility >= this.adaptiveParams.volatility_thresholds.medium) return 1.0;
    return 1.2;
  }

  // Get base configuration for strategy type
  private getBaseConfig(strategyType: string): BaseConfig {
    switch (strategyType) {
      case 'mtf_momentum':
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
      
      case 'sma_crossover':
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
      
      case 'ath_guard':
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
      
      case '4h_reentry':
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

  // Calculate trend strength
  private calculateTrendStrength(candles: any[]): number {
    if (candles.length < 2) return 0;
    
    const closes = candles.map(c => c.close);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const change = (last - first) / first;
    
    return Math.abs(change);
  }

  // Calculate volatility
  private calculateVolatility(candles: any[]): number {
    if (candles.length < 2) return 0;
    
    const closes = candles.map(c => c.close);
    const returns = [];
    
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  // Calculate momentum
  private calculateMomentum(candles: any[]): number {
    if (candles.length < 2) return 0;
    
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    
    const priceMomentum = (closes[closes.length - 1] - closes[0]) / closes[0];
    const volumeMomentum = (volumes[volumes.length - 1] - volumes[0]) / volumes[0];
    
    return (priceMomentum + volumeMomentum) / 2;
  }

  // Get current market regime
  getCurrentRegime(): MarketRegime {
    return this.currentRegime;
  }

  // Check if strategy is suitable for current regime
  isStrategySuitable(strategyType: string): boolean {
    const regime = this.currentRegime;
    
    switch (strategyType) {
      case 'mtf_momentum':
        return regime.type === 'trending' || regime.type === 'volatile';
      
      case 'sma_crossover':
        return regime.type === 'trending';
      
      case 'ath_guard':
        return regime.type === 'volatile' || regime.type === 'ranging';
      
      case '4h_reentry':
        return regime.type === 'ranging' || regime.type === 'volatile';
      
      default:
        return true;
    }
  }

  // Get regime-specific adjustments
  getRegimeAdjustments(): any {
    const regime = this.currentRegime;
    
    return {
      position_size_multiplier: this.adaptiveParams.regime_multipliers[regime.type],
      confidence_threshold: this.getConfidenceThreshold(regime.type),
      volatility_adjustment: this.getVolatilityAdjustment(regime.volatility),
      trend_adjustment: this.getTrendAdjustment(regime.trend_direction)
    };
  }

  // Get confidence threshold for regime
  private getConfidenceThreshold(regimeType: string): number {
    switch (regimeType) {
      case 'trending':
        return 60;
      case 'ranging':
        return 70;
      case 'volatile':
        return 80;
      default:
        return 65;
    }
  }

  // Get volatility adjustment
  private getVolatilityAdjustment(volatility: number): number {
    if (volatility > 60) return 0.8;
    if (volatility > 40) return 1.0;
    return 1.2;
  }

  // Get trend adjustment
  private getTrendAdjustment(trendDirection: string): number {
    switch (trendDirection) {
      case 'up':
        return 1.1;
      case 'down':
        return 0.9;
      default:
        return 1.0;
    }
  }
}

// Default adaptive parameters
export const defaultAdaptiveParameters: AdaptiveParameters = {
  regime_multipliers: {
    trending: 1.2,
    ranging: 0.8,
    volatile: 1.0
  },
  
  confidence_thresholds: {
    high: 80,
    medium: 60,
    low: 40
  },
  
  session_adjustments: {
    asian: 0.9,
    european: 1.1,
    american: 1.0
  },
  
  volatility_thresholds: {
    low: 20,
    medium: 40,
    high: 60
  }
};
