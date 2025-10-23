// Unified Strategy Interfaces
// Common interfaces for all trading strategies

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
  open_time?: number;
  close_time?: number;
}

export interface Trade {
  entry_price: number;
  entry_time: number;
  exit_price?: number;
  exit_time?: number;
  type: 'buy' | 'sell';
  quantity: number;
  profit?: number;
  exit_reason?: string;
  max_profit_reached?: number;
  // Enhanced fields
  confidence?: number;
  adx?: number;
  bollinger_position?: number;
  momentum_score?: number;
  session_strength?: number;
  time_to_expire?: number;
}

export interface BaseSignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  stop_loss?: number;
  take_profit?: number;
  // Enhanced fields
  confidence?: number;
  adx?: number;
  bollinger_position?: number;
  momentum_score?: number;
  session_strength?: number;
  time_to_expire?: number;
}

export interface BaseConfig {
  // Common parameters
  adx_threshold: number;
  bollinger_period: number;
  bollinger_std: number;
  rsi_oversold: number;
  rsi_overbought: number;
  momentum_threshold: number;
  volume_multiplier: number;
  trailing_stop_percent: number;
  max_position_time: number;
}

export interface BacktestConfig {
  initialBalance: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  trailingStopPercent?: number;
  productType: 'spot' | 'futures';
  leverage: number;
  makerFee: number;
  takerFee: number;
  slippage: number;
  executionTiming: 'open' | 'close';
  positionSizePercent: number;
  exchangeType?: 'binance' | 'bybit';
  symbol?: string;
}

export interface BacktestResults {
  initial_balance: number;
  final_balance: number;
  total_return: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  max_drawdown: number;
  sharpe_ratio: number;
  profit_factor: number;
  // Enhanced metrics
  confidence_avg: number;
  adx_avg: number;
  momentum_avg: number;
  session_strength_avg: number;
  trades: Trade[];
  balance_history: { time: number; balance: number }[];
}

export interface StrategyEvaluation {
  signal: BaseSignal;
  confidence: number;
  market_regime: 'trending' | 'ranging' | 'volatile';
  position_size: number;
  risk_reward_ratio: number;
  time_to_expire: number;
}

export interface MarketRegime {
  type: 'trending' | 'ranging' | 'volatile';
  strength: number; // 0-100
  volatility: number; // 0-100
  trend_direction: 'up' | 'down' | 'sideways';
  confidence: number; // 0-100
}

export interface PositionSizing {
  base_size: number;
  adjusted_size: number;
  max_size: number;
  risk_per_trade: number;
  confidence_multiplier: number;
  regime_multiplier: number;
}

export interface AdaptiveParameters {
  // Market regime adjustments
  regime_multipliers: {
    trending: number;
    ranging: number;
    volatile: number;
  };
  
  // Confidence adjustments
  confidence_thresholds: {
    high: number;    // > 80%
    medium: number;  // 60-80%
    low: number;    // < 60%
  };
  
  // Time-based adjustments
  session_adjustments: {
    asian: number;
    european: number;
    american: number;
  };
  
  // Volatility adjustments
  volatility_thresholds: {
    low: number;    // < 20%
    medium: number; // 20-40%
    high: number;   // > 40%
  };
}
