// Strategy Configuration Loader
// Unified configuration management for all strategies to ensure consistency
// between backtest and real-time monitoring

export interface UnifiedStrategyConfig {
  // Global defaults
  adx_threshold: number;
  bollinger_period: number;
  bollinger_std: number;
  min_trend_strength: number;
  trailing_stop_percent: number;
  max_position_time: number;
  momentum_threshold: number;
  support_resistance_lookback: number;
  min_volume_spike: number;
  min_profit_percent: number;
  
  // Risk management
  atr_sl_multiplier: number;
  atr_tp_multiplier: number;
  risk_reward_ratio: number;
  
  // Volume filters
  volume_multiplier: number;
  
  // Momentum oscillators
  rsi_period: number;
  rsi_overbought: number;
  rsi_oversold: number;
  
  // SMA Crossover specific
  sma_fast_period?: number;
  sma_slow_period?: number;
  
  // MTF Momentum specific
  mtf_rsi_period?: number;
  mtf_rsi_entry_threshold?: number;
  mtf_macd_fast?: number;
  mtf_macd_slow?: number;
  mtf_macd_signal?: number;
  mtf_volume_multiplier?: number;
  
  // ATH Guard specific
  ath_guard_ema_slope_threshold?: number;
  ath_guard_pullback_tolerance?: number;
  ath_guard_volume_multiplier?: number;
  ath_guard_stoch_oversold?: number;
  ath_guard_stoch_overbought?: number;
  ath_guard_atr_sl_multiplier?: number;
  ath_guard_atr_tp1_multiplier?: number;
  ath_guard_atr_tp2_multiplier?: number;
  ath_guard_ath_safety_distance?: number;
  ath_guard_rsi_threshold?: number;
  
  // FVG specific
  fvg_key_candle_time?: string;
  fvg_key_timeframe?: string;
  fvg_analysis_timeframe?: string;
  fvg_risk_reward_ratio?: number;
  fvg_tick_size?: number;
  
  // 4h Reentry specific
  mstg_weight_momentum?: number;
  mstg_weight_trend?: number;
  mstg_weight_volatility?: number;
  mstg_weight_relative?: number;
  mstg_long_threshold?: number;
  mstg_short_threshold?: number;
  mstg_exit_threshold?: number;
  mstg_extreme_threshold?: number;
  // Flags-derived helpers
  __general_filter_flags__?: Record<string, boolean>;
  isFilterEnabled?: (name: 'rsi' | 'volume' | 'trend' | 'timeWindow') => boolean;
}

// Global default values (from DeepSeek recommendations)
const GLOBAL_DEFAULTS: Partial<UnifiedStrategyConfig> = {
  // Risk management
  atr_sl_multiplier: 1.8,
  atr_tp_multiplier: 2.5,
  trailing_stop_percent: 0,
  max_position_time: 480,
  risk_reward_ratio: 2.0,
  
  // Volume filters
  volume_multiplier: 1.2,
  min_volume_spike: 1.1,
  
  // Trend volatility
  adx_threshold: 22,
  bollinger_period: 20,
  bollinger_std: 2.0,
  min_trend_strength: 0.3,
  
  // Momentum oscillators
  rsi_period: 14,
  rsi_overbought: 70,
  rsi_oversold: 30,
  momentum_threshold: 12,
  
  // Support/resistance
  support_resistance_lookback: 20,
  min_profit_percent: 0.2
};

/**
 * Get unified strategy configuration from database record
 * Applies global defaults for missing fields to ensure consistency
 * 
 * @param strategy - Strategy record from database
 * @returns Unified configuration object
 */
export function getUnifiedStrategyConfig(strategy: any): UnifiedStrategyConfig {
  if (!strategy) {
    throw new Error('Strategy record is required');
  }

  // Build configuration with strategy-specific values and global defaults
  const flags: Record<string, boolean> | null = strategy.general_filter_flags || null;

  const isFilterEnabled = (name: 'rsi' | 'volume' | 'trend' | 'timeWindow'): boolean => {
    // Missing flags default to enabled for backward compatibility
    if (!flags) return true;
    const v = flags[name];
    return v !== false;
  };

  const config: UnifiedStrategyConfig = {
    // Global defaults (can be overridden by strategy-specific values)
    ...GLOBAL_DEFAULTS,
    
    // Strategy-specific values (override defaults if present)
    adx_threshold: strategy.adx_threshold ?? GLOBAL_DEFAULTS.adx_threshold!,
    bollinger_period: strategy.bollinger_period ?? GLOBAL_DEFAULTS.bollinger_period!,
    bollinger_std: strategy.bollinger_std ?? GLOBAL_DEFAULTS.bollinger_std!,
    min_trend_strength: strategy.min_trend_strength ?? GLOBAL_DEFAULTS.min_trend_strength!,
    trailing_stop_percent: strategy.trailing_stop_percent ?? GLOBAL_DEFAULTS.trailing_stop_percent!,
    max_position_time: strategy.max_position_time ?? GLOBAL_DEFAULTS.max_position_time!,
    momentum_threshold: strategy.momentum_threshold ?? GLOBAL_DEFAULTS.momentum_threshold!,
    support_resistance_lookback: strategy.support_resistance_lookback ?? GLOBAL_DEFAULTS.support_resistance_lookback!,
    min_volume_spike: strategy.min_volume_spike ?? GLOBAL_DEFAULTS.min_volume_spike!,
    min_profit_percent: strategy.min_profit_percent ?? GLOBAL_DEFAULTS.min_profit_percent!,
    
    // Risk management
    atr_sl_multiplier: strategy.atr_sl_multiplier ?? GLOBAL_DEFAULTS.atr_sl_multiplier!,
    atr_tp_multiplier: strategy.atr_tp_multiplier ?? GLOBAL_DEFAULTS.atr_tp_multiplier!,
    risk_reward_ratio: strategy.fvg_risk_reward_ratio ?? GLOBAL_DEFAULTS.risk_reward_ratio!,
    
    // Volume filters
    volume_multiplier: strategy.volume_multiplier ?? GLOBAL_DEFAULTS.volume_multiplier!,
    
    // Momentum oscillators
    rsi_period: strategy.rsi_period ?? GLOBAL_DEFAULTS.rsi_period!,
    rsi_overbought: strategy.rsi_overbought ?? GLOBAL_DEFAULTS.rsi_overbought!,
    rsi_oversold: strategy.rsi_oversold ?? GLOBAL_DEFAULTS.rsi_oversold!,
    
    // SMA Crossover specific
    sma_fast_period: strategy.sma_fast_period,
    sma_slow_period: strategy.sma_slow_period,
    
    // MTF Momentum specific
    mtf_rsi_period: strategy.mtf_rsi_period,
    mtf_rsi_entry_threshold: strategy.mtf_rsi_entry_threshold,
    mtf_macd_fast: strategy.mtf_macd_fast,
    mtf_macd_slow: strategy.mtf_macd_slow,
    mtf_macd_signal: strategy.mtf_macd_signal,
    mtf_volume_multiplier: strategy.mtf_volume_multiplier,
    
    // ATH Guard specific
    ath_guard_ema_slope_threshold: strategy.ath_guard_ema_slope_threshold,
    ath_guard_pullback_tolerance: strategy.ath_guard_pullback_tolerance,
    ath_guard_volume_multiplier: strategy.ath_guard_volume_multiplier,
    ath_guard_stoch_oversold: strategy.ath_guard_stoch_oversold,
    ath_guard_stoch_overbought: strategy.ath_guard_stoch_overbought,
    ath_guard_atr_sl_multiplier: strategy.ath_guard_atr_sl_multiplier,
    ath_guard_atr_tp1_multiplier: strategy.ath_guard_atr_tp1_multiplier,
    ath_guard_atr_tp2_multiplier: strategy.ath_guard_atr_tp2_multiplier,
    ath_guard_ath_safety_distance: strategy.ath_guard_ath_safety_distance,
    ath_guard_rsi_threshold: strategy.ath_guard_rsi_threshold,
    
    // FVG specific
    fvg_key_candle_time: strategy.fvg_key_candle_time,
    fvg_key_timeframe: strategy.fvg_key_timeframe,
    fvg_analysis_timeframe: strategy.fvg_analysis_timeframe,
    fvg_risk_reward_ratio: strategy.fvg_risk_reward_ratio,
    fvg_tick_size: strategy.fvg_tick_size,
    
    // 4h Reentry specific
    mstg_weight_momentum: strategy.mstg_weight_momentum,
    mstg_weight_trend: strategy.mstg_weight_trend,
    mstg_weight_volatility: strategy.mstg_weight_volatility,
    mstg_weight_relative: strategy.mstg_weight_relative,
    mstg_long_threshold: strategy.mstg_long_threshold,
    mstg_short_threshold: strategy.mstg_short_threshold,
    mstg_exit_threshold: strategy.mstg_exit_threshold,
    mstg_extreme_threshold: strategy.mstg_extreme_threshold,
    __general_filter_flags__: flags || undefined,
    isFilterEnabled
  };

  return config;
}

/**
 * Get strategy-specific configuration for backtest
 * Ensures backtest uses the same filters as real-time monitoring
 * 
 * @param strategy - Strategy record from database
 * @param strategyType - Type of strategy for specific config mapping
 * @returns Strategy-specific configuration object
 */
export function getStrategyBacktestConfig(strategy: any, strategyType: string): any {
  const unifiedConfig = getUnifiedStrategyConfig(strategy);
  const flags = unifiedConfig.__general_filter_flags__ || {};
  const isEnabled = unifiedConfig.isFilterEnabled || ((_: any) => true);
  
  switch (strategyType) {
    case 'sma_crossover':
    case 'sma_20_200_rsi':
      // Build SMA config, then relax gates based on flags
      {
        // Optimize: Make RSI thresholds less strict (increase overbought, decrease oversold)
        const rsiOverbought = isEnabled('rsi') 
          ? Math.min(85, (unifiedConfig.rsi_overbought || 70) + 5) // Add 5 to make less strict
          : 100;
        const rsiOversold = isEnabled('rsi')
          ? Math.max(15, (unifiedConfig.rsi_oversold || 30) - 5) // Subtract 5 to make less strict
          : 0;
        // Optimize: Reduce volume multiplier requirement (0.8 for more entries)
        const volumeMultiplier = isEnabled('volume')
          ? Math.max(0.8, (unifiedConfig.volume_multiplier || 1.2) * 0.67) // Reduce to 0.8 target
          : 0;
        
        // Optimize: Reduce ADX threshold (15 for more entries)
        const adxThreshold = isEnabled('trend') 
          ? Math.min(15, unifiedConfig.adx_threshold || 18) 
          : 0;
        
        // Optimize: Reduce min_trend_strength (0.2 for more entries)
        const minTrendStrength = isEnabled('trend') 
          ? Math.min(0.2, unifiedConfig.min_trend_strength || 0.3) 
          : 0;
        
        const base = {
        sma_fast_period: unifiedConfig.sma_fast_period || 20,
        sma_slow_period: unifiedConfig.sma_slow_period || 200,
        rsi_period: unifiedConfig.rsi_period,
        rsi_overbought: rsiOverbought,
        rsi_oversold: rsiOversold,
        volume_multiplier: volumeMultiplier,
        atr_sl_multiplier: unifiedConfig.atr_sl_multiplier,
        atr_tp_multiplier: unifiedConfig.atr_tp_multiplier,
        adx_threshold: adxThreshold,
        bollinger_period: unifiedConfig.bollinger_period,
        bollinger_std: unifiedConfig.bollinger_std,
        trailing_stop_percent: unifiedConfig.trailing_stop_percent,
        max_position_time: unifiedConfig.max_position_time,
        min_trend_strength: minTrendStrength
      };
        return base;
      }
      
    case 'mtf_momentum':
      // Optimize: Reduce RSI threshold and volume multiplier for better entry rate
      const mtfRsiThreshold = isEnabled('rsi')
        ? Math.max(45, (unifiedConfig.mtf_rsi_entry_threshold || 55) - 5) // Reduce by 5 to make less strict
        : 0;
      const mtfVolumeMultiplier = isEnabled('volume')
        ? Math.max(1.0, (unifiedConfig.mtf_volume_multiplier || 1.3) * 0.85) // Reduce by 15%
        : 0;
      
      return {
        mtf_rsi_period: unifiedConfig.mtf_rsi_period || 14,
        mtf_rsi_entry_threshold: mtfRsiThreshold,
        mtf_macd_fast: unifiedConfig.mtf_macd_fast || 8,
        mtf_macd_slow: unifiedConfig.mtf_macd_slow || 21,
        mtf_macd_signal: unifiedConfig.mtf_macd_signal || 5,
        mtf_volume_multiplier: mtfVolumeMultiplier,
        atr_sl_multiplier: unifiedConfig.atr_sl_multiplier,
        atr_tp_multiplier: unifiedConfig.atr_tp_multiplier,
        trailing_stop_percent: unifiedConfig.trailing_stop_percent,
        max_position_time: unifiedConfig.max_position_time,
        min_profit_percent: unifiedConfig.min_profit_percent
      };
      
    case 'ath_guard_scalping':
      // Optimize: Reduce RSI threshold and volume multiplier for better entry rate
      const athGuardRsiThreshold = isEnabled('rsi')
        ? Math.min(75, (unifiedConfig.ath_guard_rsi_threshold || 75) - 5) // Reduce by 5
        : 0;
      const athGuardVolumeMultiplier = isEnabled('volume')
        ? Math.max(1.0, (unifiedConfig.ath_guard_volume_multiplier || 1.2) * 0.9) // Reduce by 10%
        : 0;
      
      return {
        ema_slope_threshold: unifiedConfig.ath_guard_ema_slope_threshold || 0.10,
        pullback_tolerance: unifiedConfig.ath_guard_pullback_tolerance || 0.25,
        volume_multiplier: athGuardVolumeMultiplier,
        stoch_oversold: unifiedConfig.ath_guard_stoch_oversold || 25,
        stoch_overbought: unifiedConfig.ath_guard_stoch_overbought || 75,
        atr_sl_multiplier: unifiedConfig.ath_guard_atr_sl_multiplier || 1.0,
        atr_tp1_multiplier: unifiedConfig.ath_guard_atr_tp1_multiplier || 0.6,
        atr_tp2_multiplier: unifiedConfig.ath_guard_atr_tp2_multiplier || 1.2,
        ath_safety_distance: unifiedConfig.ath_guard_ath_safety_distance || 0.2,
        rsi_threshold: athGuardRsiThreshold,
        trailing_stop_percent: unifiedConfig.trailing_stop_percent,
        max_position_time: unifiedConfig.max_position_time,
        adx_threshold: isEnabled('trend') ? unifiedConfig.adx_threshold : 0,
        min_volume_spike: unifiedConfig.min_volume_spike,
        momentum_threshold: unifiedConfig.momentum_threshold,
        support_resistance_lookback: unifiedConfig.support_resistance_lookback
      };
      
    case 'fvg_scalping':
      // Optimize: Increase volume requirement and quality threshold (in code) for better winrate
      return {
        keyTimeStart: unifiedConfig.fvg_key_candle_time?.split('-')[0] || "09:30",
        keyTimeEnd: unifiedConfig.fvg_key_candle_time?.split('-')[1] || "09:35",
        keyTimeframe: unifiedConfig.fvg_key_timeframe || "5m",
        analysisTimeframe: unifiedConfig.fvg_analysis_timeframe || "1m",
        riskRewardRatio: unifiedConfig.fvg_risk_reward_ratio || 3.0,
        tickSize: unifiedConfig.fvg_tick_size || 0.01,
        min_fvg_size_percent: 0.5, // OPTIMIZED: Increased from 0.3% to 0.5% for larger gaps
        require_trend_alignment: true, // Phase 3: Require EMA trend alignment
        min_volume_ratio: 2.0, // OPTIMIZED: Increased from 1.8x to 2.0x for better signals (improve winrate)
        prefer_50_percent_fill: true, // Phase 6: Prefer 50% mitigation
        avoid_low_liquidity_hours: true, // Phase 7: Avoid 00:00-04:00 UTC
        disableTimeWindow: !isEnabled('timeWindow'),
        max_position_time: unifiedConfig.max_position_time
      };
      
    case '4h_reentry':
      // Optimize: Relax filters to allow entries
      // ADX: 22 → 18, RSI: 30-70 → 20-80, Momentum: 10 → 8, Volume: 1.3 → 1.1
      return {
        sessionStart: "00:00",
        sessionEnd: "03:59",
        riskRewardRatio: unifiedConfig.risk_reward_ratio,
        atr_sl_multiplier: unifiedConfig.atr_sl_multiplier,
        atr_tp_multiplier: unifiedConfig.atr_tp_multiplier,
        trailing_stop_percent: unifiedConfig.trailing_stop_percent,
        max_position_time: unifiedConfig.max_position_time,
        volume_threshold: Math.max(1.1, (unifiedConfig.volume_multiplier || 1.3) * 0.85), // 1.3 → 1.1
        adx_threshold: Math.min(18, unifiedConfig.adx_threshold || 22), // 22 → 18
        bollinger_period: unifiedConfig.bollinger_period,
        bollinger_std: unifiedConfig.bollinger_std,
        rsi_oversold: Math.max(20, (unifiedConfig.rsi_oversold || 30) - 10), // 30 → 20
        rsi_overbought: Math.min(80, (unifiedConfig.rsi_overbought || 70) + 10), // 70 → 80
        momentum_threshold: Math.min(8, unifiedConfig.momentum_threshold || 10), // 10 → 8
        // MSTG specific
        mstg_weight_momentum: unifiedConfig.mstg_weight_momentum,
        mstg_weight_trend: unifiedConfig.mstg_weight_trend,
        mstg_weight_volatility: unifiedConfig.mstg_weight_volatility,
        mstg_weight_relative: unifiedConfig.mstg_weight_relative,
        mstg_long_threshold: unifiedConfig.mstg_long_threshold,
        mstg_short_threshold: unifiedConfig.mstg_short_threshold,
        mstg_exit_threshold: unifiedConfig.mstg_exit_threshold,
        mstg_extreme_threshold: unifiedConfig.mstg_extreme_threshold
      };
      
    default:
      console.warn(`Unknown strategy type: ${strategyType}, using unified config`);
      return unifiedConfig;
  }
}

/**
 * Get strategy-specific configuration for real-time monitoring
 * Ensures monitoring uses the same filters as backtest
 * 
 * @param strategy - Strategy record from database
 * @param strategyType - Type of strategy for specific config mapping
 * @returns Strategy-specific configuration object
 */
export function getStrategyMonitorConfig(strategy: any, strategyType: string): any {
  // For real-time monitoring, we can use the same config as backtest
  // This ensures perfect consistency
  return getStrategyBacktestConfig(strategy, strategyType);
}
