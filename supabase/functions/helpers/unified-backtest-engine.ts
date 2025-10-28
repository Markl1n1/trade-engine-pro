// Unified Backtest Engine
// Centralized backtesting logic for all strategies

import { 
  Candle, 
  Trade, 
  BaseSignal, 
  BaseConfig, 
  BacktestConfig, 
  BacktestResults,
  StrategyEvaluation,
  MarketRegime,
  PositionSizing,
  AdaptiveParameters
} from './strategy-interfaces.ts';

export class UnifiedBacktestEngine {
  private config: BacktestConfig;
  private adaptiveParams: AdaptiveParameters;
  private marketRegime: MarketRegime;
  
  constructor(config: BacktestConfig, adaptiveParams: AdaptiveParameters) {
    this.config = config;
    this.adaptiveParams = adaptiveParams;
    this.marketRegime = {
      type: 'ranging',
      strength: 50,
      volatility: 30,
      trend_direction: 'sideways',
      confidence: 50
    };
  }

  // Main backtest execution
  async runBacktest(
    candles: Candle[],
    strategyEvaluator: (candles: Candle[], index: number, config: BaseConfig) => BaseSignal,
    strategyConfig: BaseConfig
  ): Promise<BacktestResults> {
    console.log(`[UNIFIED-BACKTEST] Starting backtest with ${candles.length} candles`);
    
    let balance = this.config.initialBalance;
    let position: Trade | null = null;
    const trades: Trade[] = [];
    let maxBalance = balance;
    let maxDrawdown = 0;
    const balanceHistory: { time: number; balance: number }[] = [];
    
    // Pre-calculate indicators for performance
    const indicatorCache = this.preCalculateIndicators(candles);
    
    // Initialize trailing stop manager
    let trailingStopManager = this.createTrailingStopManager();
    
    // Main backtest loop - START AT 100 for more data (softer entry criteria)
    for (let i = 100; i < candles.length; i++) {
      const currentCandle = candles[i];
      const executionPrice = this.config.executionTiming === 'open' 
        ? currentCandle.open 
        : currentCandle.close;
      
      // Update market regime
      this.updateMarketRegime(candles, i);
      
      // Check trailing stop first
      if (position && trailingStopManager) {
        const trailingResult = this.checkTrailingStop(
          position, 
          executionPrice, 
          trailingStopManager
        );
        
        if (trailingResult.shouldClose) {
          const exitResult = this.closePosition(
            position, 
            executionPrice, 
            'trailing_stop'
          );
          balance += exitResult.netProfit;
          trades.push(exitResult.trade);
          position = null;
          trailingStopManager.reset();
        }
      }
      
      // Check time-based exit
      if (position && this.shouldExitByTime(position, currentCandle)) {
        const exitResult = this.closePosition(
          position, 
          executionPrice, 
          'time_expired'
        );
        balance += exitResult.netProfit;
        trades.push(exitResult.trade);
        position = null;
        trailingStopManager.reset();
      }
      
      // Evaluate strategy if no position
      if (!position) {
        const signal = strategyEvaluator(candles, i, strategyConfig);
        
        if (signal.signal_type) {
          const evaluation = this.evaluateSignal(signal, candles, i);
          const positionSize = this.calculatePositionSize(evaluation, balance);
          
          if (positionSize > 0) {
            position = this.openPosition(
              signal, 
              executionPrice, 
              positionSize, 
              currentCandle.open_time || currentCandle.timestamp || 0
            );
            
            if (this.config.trailingStopPercent) {
              trailingStopManager.initialize(
                position.entry_price, 
                position.type
              );
            }
          }
        }
      }
      
      // Update balance and drawdown
      const currentBalance = position ? balance : balance;
      if (currentBalance > maxBalance) {
        maxBalance = currentBalance;
      }
      
      const drawdown = (maxBalance - currentBalance) / maxBalance;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
      
      balanceHistory.push({
        time: currentCandle.open_time || currentCandle.timestamp || 0,
        balance: currentBalance
      });
    }
    
    // Close any remaining position
    if (position) {
      const lastCandle = candles[candles.length - 1];
      const exitPrice = this.config.executionTiming === 'open' 
        ? lastCandle.open 
        : lastCandle.close;
      
      const exitResult = this.closePosition(
        position, 
        exitPrice, 
        'end_of_data'
      );
      balance += exitResult.netProfit;
      trades.push(exitResult.trade);
    }
    
    return this.calculateResults(
      this.config.initialBalance,
      balance,
      trades,
      balanceHistory,
      maxDrawdown
    );
  }

  // Pre-calculate indicators for performance
  private preCalculateIndicators(candles: Candle[]): any {
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    
    return {
      sma20: this.calculateSMA(closes, 20),
      sma50: this.calculateSMA(closes, 50),
      sma200: this.calculateSMA(closes, 200),
      ema12: this.calculateEMA(closes, 12),
      ema26: this.calculateEMA(closes, 26),
      rsi: this.calculateRSI(closes, 14),
      adx: this.calculateADX(candles, 14),
      bollinger: this.calculateBollingerBands(closes, 20, 2),
      atr: this.calculateATR(candles, 14),
      volume_sma: this.calculateSMA(volumes, 20)
    };
  }

  // Update market regime based on recent price action
  private updateMarketRegime(candles: Candle[], index: number): void {
    const lookback = Math.min(50, index);
    const recentCandles = candles.slice(index - lookback, index);
    
    // Calculate trend strength
    const closes = recentCandles.map(c => c.close);
    const trendStrength = this.calculateTrendStrength(closes);
    
    // Calculate volatility
    const volatility = this.calculateVolatility(closes);
    
    // Determine regime type
    let regimeType: 'trending' | 'ranging' | 'volatile';
    if (trendStrength > 0.7) {
      regimeType = 'trending';
    } else if (volatility > 0.6) {
      regimeType = 'volatile';
    } else {
      regimeType = 'ranging';
    }
    
    this.marketRegime = {
      type: regimeType,
      strength: trendStrength * 100,
      volatility: volatility * 100,
      trend_direction: trendStrength > 0 ? 'up' : 'down',
      confidence: Math.min(100, (trendStrength + (1 - volatility)) * 50)
    };
  }

  // Evaluate signal quality
  private evaluateSignal(signal: BaseSignal, candles: Candle[], index: number): StrategyEvaluation {
    const confidence = signal.confidence || 50;
    const regimeMultiplier = this.adaptiveParams.regime_multipliers[this.marketRegime.type];
    const confidenceMultiplier = this.getConfidenceMultiplier(confidence);
    
    return {
      signal,
      confidence,
      market_regime: this.marketRegime.type,
      position_size: this.config.positionSizePercent * regimeMultiplier * confidenceMultiplier,
      risk_reward_ratio: this.calculateRiskRewardRatio(signal),
      time_to_expire: signal.time_to_expire || 240
    };
  }

  // Calculate position size based on evaluation
  private calculatePositionSize(evaluation: StrategyEvaluation, balance: number): number {
    const baseSize = (balance * evaluation.position_size) / 100;
    const maxSize = balance * 0.1; // Max 10% of balance
    const minSize = balance * 0.01; // Min 1% of balance
    
    return Math.max(minSize, Math.min(maxSize, baseSize));
  }

  // Open position
  private openPosition(
    signal: BaseSignal, 
    price: number, 
    quantity: number, 
    timestamp: number
  ): Trade {
    return {
      entry_price: price,
      entry_time: timestamp,
      type: signal.signal_type === 'BUY' ? 'buy' : 'sell',
      quantity: quantity,
      confidence: signal.confidence,
      adx: signal.adx,
      bollinger_position: signal.bollinger_position,
      momentum_score: signal.momentum_score,
      session_strength: signal.session_strength,
      time_to_expire: signal.time_to_expire
    };
  }

  // Close position
  private closePosition(
    position: Trade, 
    price: number, 
    reason: string
  ): { trade: Trade; netProfit: number } {
    const exitPrice = price * (1 - this.config.slippage / 100);
    const profit = position.type === 'buy' 
      ? (exitPrice - position.entry_price) * position.quantity
      : (position.entry_price - exitPrice) * position.quantity;
    
    const entryFee = (position.entry_price * position.quantity * this.config.makerFee) / 100;
    const exitFee = (exitPrice * position.quantity * this.config.takerFee) / 100;
    const netProfit = profit - entryFee - exitFee;
    
    const trade: Trade = {
      ...position,
      exit_price: exitPrice,
      exit_time: Date.now(),
      profit: netProfit,
      exit_reason: reason
    };
    
    return { trade, netProfit };
  }

  // Check trailing stop
  private checkTrailingStop(
    position: Trade, 
    currentPrice: number, 
    trailingStopManager: any
  ): { shouldClose: boolean } {
    if (!this.config.trailingStopPercent) {
      return { shouldClose: false };
    }
    
    return trailingStopManager.checkTrailingStop(currentPrice);
  }

  // Check time-based exit
  private shouldExitByTime(position: Trade, currentCandle: Candle): boolean {
    if (!position.time_to_expire) return false;
    
    const candleTime = currentCandle.open_time || currentCandle.timestamp || 0;
    const timeElapsed = candleTime - position.entry_time;
    const maxTime = position.time_to_expire * 60 * 1000; // Convert to milliseconds
    
    return timeElapsed >= maxTime;
  }

  // Create trailing stop manager
  private createTrailingStopManager(): any {
    if (!this.config.trailingStopPercent) return null;
    
    return {
      maxProfitPercent: 0,
      trailingPercent: this.config.trailingStopPercent,
      isActive: false,
      entryPrice: 0,
      positionType: 'buy' as 'buy' | 'sell',
      
      initialize(entryPrice: number, positionType: 'buy' | 'sell'): void {
        this.entryPrice = entryPrice;
        this.positionType = positionType;
        this.maxProfitPercent = 0;
        this.isActive = false;
      },
      
      checkTrailingStop(currentPrice: number): { shouldClose: boolean } {
        if (!this.isActive) return { shouldClose: false };
        
        const profitPercent = this.positionType === 'buy'
          ? ((currentPrice - this.entryPrice) / this.entryPrice) * 100
          : ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
        
        if (profitPercent > this.maxProfitPercent) {
          this.maxProfitPercent = profitPercent;
        }
        
        const trailingStopLevel = this.maxProfitPercent - this.trailingPercent;
        const shouldClose = profitPercent <= trailingStopLevel;
        
        return { shouldClose };
      },
      
      reset(): void {
        this.maxProfitPercent = 0;
        this.isActive = false;
        this.entryPrice = 0;
      }
    };
  }

  // Calculate results
  private calculateResults(
    initialBalance: number,
    finalBalance: number,
    trades: Trade[],
    balanceHistory: { time: number; balance: number }[],
    maxDrawdown: number
  ): BacktestResults {
    const totalReturn = ((finalBalance - initialBalance) / initialBalance) * 100;
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    const profits = trades.map(t => t.profit || 0);
    const wins = profits.filter(p => p > 0);
    const losses = profits.filter(p => p < 0);
    
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    
    const totalWins = wins.reduce((a, b) => a + b, 0);
    const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;
    
    // Enhanced metrics
    const confidenceAvg = trades.length > 0 
      ? trades.reduce((sum, t) => sum + (t.confidence || 50), 0) / trades.length 
      : 50;
    
    const adxAvg = trades.length > 0 
      ? trades.reduce((sum, t) => sum + (t.adx || 0), 0) / trades.length 
      : 0;
    
    const momentumAvg = trades.length > 0 
      ? trades.reduce((sum, t) => sum + (t.momentum_score || 0), 0) / trades.length 
      : 0;
    
    const sessionStrengthAvg = trades.length > 0 
      ? trades.reduce((sum, t) => sum + (t.session_strength || 0), 0) / trades.length 
      : 0;
    
    return {
      initial_balance: initialBalance,
      final_balance: finalBalance,
      total_return: totalReturn,
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: winRate,
      avg_win: avgWin,
      avg_loss: avgLoss,
      max_drawdown: maxDrawdown * 100,
      sharpe_ratio: this.calculateSharpeRatio(balanceHistory),
      profit_factor: profitFactor,
      confidence_avg: confidenceAvg,
      adx_avg: adxAvg,
      momentum_avg: momentumAvg,
      session_strength_avg: sessionStrengthAvg,
      trades,
      balance_history: balanceHistory
    };
  }

  // Helper methods for calculations
  private calculateSMA(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(data[i]);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  }

  private calculateEMA(data: number[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    
    let sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(sma);
    
    for (let i = period; i < data.length; i++) {
      const ema = (data[i] - result[result.length - 1]) * multiplier + result[result.length - 1];
      result.push(ema);
    }
    
    return result;
  }

  private calculateRSI(data: number[], period: number): number[] {
    const result: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }
    
    if (gains.length < period) {
      return new Array(data.length).fill(50);
    }
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = 0; i < period; i++) {
      result.push(50);
    }
    
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    }
    
    return [50, ...result];
  }

  private calculateADX(candles: Candle[], period: number): number[] {
    // Simplified ADX calculation
    const result: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i < period) {
        result.push(0);
      } else {
        // Simplified ADX calculation
        const recentCandles = candles.slice(i - period, i);
        const volatility = this.calculateVolatility(recentCandles.map(c => c.close));
        result.push(volatility * 100);
      }
    }
    return result;
  }

  private calculateBollingerBands(data: number[], period: number, stdDev: number): { upper: number[], middle: number[], lower: number[] } {
    const result = { upper: [] as number[], middle: [] as number[], lower: [] as number[] };
    
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.upper.push(data[i]);
        result.middle.push(data[i]);
        result.lower.push(data[i]);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const sma = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
        const stdDeviation = Math.sqrt(variance);
        
        result.upper.push(sma + (stdDeviation * stdDev));
        result.middle.push(sma);
        result.lower.push(sma - (stdDeviation * stdDev));
      }
    }
    
    return result;
  }

  private calculateATR(candles: Candle[], period: number): number[] {
    const tr: number[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    
    return [0, ...this.calculateEMA(tr, period)];
  }

  private calculateTrendStrength(data: number[]): number {
    if (data.length < 2) return 0;
    
    const first = data[0];
    const last = data[data.length - 1];
    const change = (last - first) / first;
    
    return Math.abs(change);
  }

  private calculateVolatility(data: number[]): number {
    if (data.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < data.length; i++) {
      returns.push((data[i] - data[i - 1]) / data[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  private getConfidenceMultiplier(confidence: number): number {
    if (confidence >= this.adaptiveParams.confidence_thresholds.high) return 1.2;
    if (confidence >= this.adaptiveParams.confidence_thresholds.medium) return 1.0;
    return 0.8;
  }

  private calculateRiskRewardRatio(signal: BaseSignal): number {
    if (!signal.stop_loss || !signal.take_profit) return 1;
    
    const risk = Math.abs(signal.stop_loss - signal.take_profit);
    const reward = Math.abs(signal.take_profit - signal.stop_loss);
    
    return reward / risk;
  }

  private calculateSharpeRatio(balanceHistory: { time: number; balance: number }[]): number {
    if (balanceHistory.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < balanceHistory.length; i++) {
      returns.push((balanceHistory[i].balance - balanceHistory[i - 1].balance) / balanceHistory[i - 1].balance);
    }
    
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? meanReturn / stdDev : 0;
  }
}
