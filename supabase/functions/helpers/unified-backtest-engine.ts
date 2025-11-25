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
import { getBybitConstraints, getBinanceConstraints, roundToStepSize, roundToTickSize, validateOrder } from './exchange-constraints.ts';

// Numeric helpers for stability
const EPS = 1e-8;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const safeDiv = (a: number, b: number) => a / (Math.abs(b) < EPS ? (b >= 0 ? EPS : -EPS) : b);
const floorToStep = (v: number, step: number) => Math.floor(v / (step || EPS)) * (step || EPS);

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
    if (!candles || candles.length === 0) {
      return this.calculateResults(
        this.config.initialBalance,
        this.config.initialBalance,
        [],
        [],
        0
      );
    }
    // Ensure chronological order
    candles = [...candles].sort((a, b) => (a.open_time ?? a.timestamp ?? 0) - (b.open_time ?? b.timestamp ?? 0));
    
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
    
    // Determine safe warm-up window (min 200 bars)
    const startIndex = Math.min(candles.length, Math.max(200, 0));

    // Prepare exchange constraints
    const symbol = this.config.symbol || 'BTCUSDT';
    const exchangeType = this.config.exchangeType || 'bybit';
    const constraints = exchangeType === 'binance' ? getBinanceConstraints(symbol) : getBybitConstraints(symbol);

    // Main backtest loop
    for (let i = startIndex; i < candles.length; i++) {
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
        // Position cooldown logic
        const lastTradeTime = trades.length > 0 ? trades[trades.length - 1].exit_time || 0 : 0;
        const cooldownPeriod = 5 * 60 * 1000; // 5 minutes in milliseconds

        if (Date.now() - lastTradeTime < cooldownPeriod) {
          this.debug('SKIP_ENTRY', { reason: 'COOLDOWN_ACTIVE', lastTradeTime, cooldownPeriod });
          continue; // Skip entry during cooldown
        }

        // Daily trades limit
        const today = new Date().toDateString();
        const todayTrades = trades.filter(t => 
          new Date(t.entry_time).toDateString() === today
        ).length;

        if (todayTrades >= 5) { // Max 5 trades per day
          this.debug('SKIP_ENTRY', { reason: 'DAILY_LIMIT_REACHED', todayTrades, maxDaily: 5 });
          continue;
        }

        const signal = strategyEvaluator(candles, i, strategyConfig);
        
        if (signal.signal_type) {
          const evaluation = this.evaluateSignal(signal, candles, i);
          // Ensure TTL present
          signal.time_to_expire = signal.time_to_expire ?? evaluation.time_to_expire;

          // Round price to tick size
          const roundedPrice = roundToTickSize(executionPrice, constraints.priceTick);
          
          // Use centralized position sizing with constraints
          const positionResult = this.calculatePositionWithConstraints(
            evaluation, 
            balance, 
            roundedPrice, 
            constraints
          );
          
          if (!positionResult.valid || positionResult.quantity <= 0) {
            const reason = !Number.isFinite(positionResult.quantity) || positionResult.quantity <= 0 ? 'SIZE_TOO_SMALL' : 'EXCHANGE_CONSTRAINT';
            this.debug('SKIP_ENTRY', { 
              reason, 
              baseQty: positionResult.quantity, 
              price: roundedPrice,
              validation: positionResult.reason,
              constraints: {
                stepSize: constraints.stepSize,
                minQty: constraints.minQty,
                minNotional: constraints.minNotional,
                priceTick: constraints.priceTick
              }
            });
            continue; // Skip entry due to constraints
          } else {
            position = this.openPosition(
              signal,
              roundedPrice,
              positionResult.quantity,
              currentCandle.open_time || currentCandle.timestamp || 0
            );
            
            if (this.config.trailingStopPercent && trailingStopManager) {
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
      
      const drawdown = maxBalance > 0 ? (maxBalance - currentBalance) / maxBalance : 0;
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
    const confidence = clamp(signal.confidence ?? 50, 30, 100);
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
    const baseSize = safeDiv(balance * evaluation.position_size, 100);
    const maxSize = balance * 0.10; // Max 10% of balance
    const minSize = balance * 0.01; // Min 1% of balance
    const clamped = clamp(baseSize, minSize, maxSize);
    return Number.isFinite(clamped) ? clamped : 0;
  }

  // Centralized position sizing with minNotional bump logic
  private calculatePositionWithConstraints(
    evaluation: StrategyEvaluation,
    balance: number,
    entryPrice: number,
    constraints: any
  ): { quantity: number; notional: number; valid: boolean; reason?: string } {
    // Calculate base exposure
    const usdExposure = this.calculatePositionSize(evaluation, balance) * Math.max(1, this.config.leverage || 1);
    
    // Convert to base quantity and quantize
    let baseQty = roundToStepSize(safeDiv(usdExposure, entryPrice), constraints.stepSize);
    let notional = baseQty * entryPrice;
    
    // Check if we meet minimum notional
    if (notional < constraints.minNotional) {
      // Bump to minimum notional if within balance limits
      const minQtyForNotional = safeDiv(constraints.minNotional, entryPrice);
      const bumpedQty = roundToStepSize(minQtyForNotional, constraints.stepSize);
      const bumpedNotional = bumpedQty * entryPrice;
      
      // Check if we can afford the bumped position
      const requiredMargin = safeDiv(bumpedNotional, this.config.leverage || 1);
      
      if (requiredMargin <= balance) {
        baseQty = bumpedQty;
        notional = bumpedNotional;
        this.debug('POSITION_BUMP', { 
          reason: 'MIN_NOTIONAL_BUMP', 
          originalQty: safeDiv(usdExposure, entryPrice),
          bumpedQty: baseQty,
          notional: notional,
          minNotional: constraints.minNotional
        });
      } else {
        return { 
          quantity: 0, 
          notional: 0, 
          valid: false, 
          reason: 'INSUFFICIENT_MARGIN_FOR_MIN_NOTIONAL' 
        };
      }
    }
    
    // Final validation
    const validation = validateOrder(baseQty, entryPrice, constraints);
    if (!validation.valid) {
      return { 
        quantity: 0, 
        notional: 0, 
        valid: false, 
        reason: validation.reason 
      };
    }
    
    return { 
      quantity: baseQty, 
      notional: notional, 
      valid: true 
    };
  }

  // Open position
  private openPosition(
    signal: BaseSignal, 
    price: number, 
    quantity: number, 
    timestamp: number
  ): Trade {
    // Apply slippage to entry price (worse for entry)
    const entryPrice = signal.signal_type === 'BUY'
      ? price * (1 + this.config.slippage / 100)  // Long: worse entry (higher price)
      : price * (1 - this.config.slippage / 100); // Short: worse entry (lower price)
    
    // Calculate position details
    const notional = quantity * entryPrice;
    const margin = notional / (this.config.leverage || 1);
    const stopLoss = signal.stop_loss || (signal.signal_type === 'BUY' 
      ? entryPrice * (1 - (this.config.stopLossPercent || 2) / 100)
      : entryPrice * (1 + (this.config.stopLossPercent || 2) / 100));
    const takeProfit = signal.take_profit || (signal.signal_type === 'BUY'
      ? entryPrice * (1 + (this.config.takeProfitPercent || 4) / 100)
      : entryPrice * (1 - (this.config.takeProfitPercent || 4) / 100));
    
    // Enhanced entry logging
    console.log('[BACKTEST] 🟢 ENTRY:', JSON.stringify({
      timestamp: new Date(timestamp).toISOString(),
      type: signal.signal_type,
      price: entryPrice.toFixed(2),
      quantity: quantity.toFixed(4),
      notional: notional.toFixed(2),
      margin_required: margin.toFixed(2),
      leverage: this.config.leverage,
      stop_loss: stopLoss.toFixed(2),
      take_profit: takeProfit.toFixed(2),
      sl_distance_percent: (Math.abs(entryPrice - stopLoss) / entryPrice * 100).toFixed(2),
      tp_distance_percent: (Math.abs(takeProfit - entryPrice) / entryPrice * 100).toFixed(2),
      indicators: {
        confidence: signal.confidence?.toFixed(1) || 'N/A',
        adx: signal.adx?.toFixed(1) || 'N/A',
        bollinger_position: signal.bollinger_position?.toFixed(2) || 'N/A',
        momentum_score: signal.momentum_score?.toFixed(1) || 'N/A',
        session_strength: signal.session_strength?.toFixed(1) || 'N/A'
      },
      reason: signal.reason
    }));
    
    return {
      entry_price: entryPrice,
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
    // Apply slippage to exit price (worse for exit)
    const exitPrice = position.type === 'buy' 
      ? price * (1 - this.config.slippage / 100)  // Long: worse exit (lower price)
      : price * (1 + this.config.slippage / 100); // Short: worse exit (higher price)
    
    // Calculate gross profit before fees
    const grossProfit = position.type === 'buy' 
      ? (exitPrice - position.entry_price) * position.quantity
      : (position.entry_price - exitPrice) * position.quantity;
    
    // Apply fees: entry fee (maker), exit fee (taker)
    const entryFee = (position.entry_price * position.quantity * this.config.makerFee) / 100;
    const exitFee = (exitPrice * position.quantity * this.config.takerFee) / 100;
    const netProfit = grossProfit - entryFee - exitFee;
    
    // Calculate P&L percentages
    const profitPercent = position.type === 'buy'
      ? ((exitPrice - position.entry_price) / position.entry_price) * 100
      : ((position.entry_price - exitPrice) / position.entry_price) * 100;
    
    const positionDuration = (Date.now() - position.entry_time) / 60000; // minutes
    
    // Enhanced exit logging
    console.log('[BACKTEST] 🔴 EXIT:', JSON.stringify({
      timestamp: new Date().toISOString(),
      reason: reason,
      entry_price: position.entry_price.toFixed(2),
      exit_price: exitPrice.toFixed(2),
      pnl_usd: netProfit.toFixed(2),
      pnl_percent: profitPercent.toFixed(2),
      position_duration_minutes: positionDuration.toFixed(1),
      fees: {
        entry: entryFee.toFixed(2),
        exit: exitFee.toFixed(2),
        total: (entryFee + exitFee).toFixed(2)
      },
      indicators_at_exit: {
        confidence: position.confidence?.toFixed(1) || 'N/A',
        adx: position.adx?.toFixed(1) || 'N/A'
      }
    }));
    
    const trade: Trade = {
      ...position,
      exit_price: exitPrice,
      exit_time: Date.now(),
      profit: netProfit,
      exit_reason: reason
    };
    
    return { trade, netProfit };
  }

  // Debug logging helpers (enabled via user_settings.debug_mode)
  private debugEnabled: boolean = false;
  
  public setDebugMode(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  private debug(event: string, data: Record<string, unknown>): void {
    if (!this.debugEnabled) return;
    try {
      console.log(JSON.stringify({ type: 'debug', scope: 'UNIFIED-BACKTEST', event, ...data }));
    } catch {
      // no-op
    }
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
    // Safe division guards for all metrics
    const totalReturn = safeDiv(finalBalance - initialBalance, initialBalance) * 100;
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? safeDiv(winningTrades, totalTrades) * 100 : 0;
    
    const profits = trades.map(t => t.profit || 0);
    const wins = profits.filter(p => p > 0);
    const losses = profits.filter(p => p < 0);
    
    const avgWin = wins.length > 0 ? safeDiv(wins.reduce((a, b) => a + b, 0), wins.length) : 0;
    const avgLoss = losses.length > 0 ? safeDiv(losses.reduce((a, b) => a + b, 0), losses.length) : 0;
    
    const totalWins = wins.reduce((a, b) => a + b, 0);
    const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = totalLosses > 0 ? safeDiv(totalWins, totalLosses) : 0;
    
    // Clamp all metrics to prevent NaN/Infinity
    const clampedTotalReturn = clamp(totalReturn, -100, 10000);
    const clampedWinRate = clamp(winRate, 0, 100);
    const clampedProfitFactor = clamp(profitFactor, 0, 100);
    
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
    
    // Calculate exit reason summary
    const exitReasons = {
      stop_loss: trades.filter(t => t.exit_reason?.includes('STOP_LOSS')).length,
      take_profit: trades.filter(t => t.exit_reason?.includes('TAKE_PROFIT')).length,
      trailing_stop: trades.filter(t => t.exit_reason?.includes('trailing_stop')).length,
      time_exit: trades.filter(t => t.exit_reason?.includes('time_expired')).length,
      opposite_signal: trades.filter(t => t.exit_reason && !t.exit_reason.includes('STOP_LOSS') && !t.exit_reason.includes('TAKE_PROFIT') && !t.exit_reason.includes('trailing') && !t.exit_reason.includes('time')).length
    };
    
    // Enhanced summary logging
    console.log('[BACKTEST] 📈 EXIT SUMMARY:', JSON.stringify({
      stop_loss_exits: exitReasons.stop_loss,
      take_profit_exits: exitReasons.take_profit,
      trailing_stop_exits: exitReasons.trailing_stop,
      time_exits: exitReasons.time_exit,
      opposite_signal_exits: exitReasons.opposite_signal,
      sl_tp_ratio: `${exitReasons.stop_loss}:${exitReasons.take_profit}`
    }));
    
    console.log('[BACKTEST] 📊 FINAL RESULTS:', JSON.stringify({
      initial_balance: initialBalance.toFixed(2),
      final_balance: finalBalance.toFixed(2),
      total_return: clampedTotalReturn.toFixed(2) + '%',
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: clampedWinRate.toFixed(2) + '%',
      avg_win: avgWin.toFixed(2),
      avg_loss: avgLoss.toFixed(2),
      profit_factor: clampedProfitFactor.toFixed(2),
      max_drawdown: (maxDrawdown * 100).toFixed(2) + '%'
    }));
    
    return {
      initial_balance: initialBalance,
      final_balance: finalBalance,
      total_return: clampedTotalReturn,
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: clampedWinRate,
      avg_win: avgWin,
      avg_loss: avgLoss,
      max_drawdown: maxDrawdown * 100,
      sharpe_ratio: this.calculateSharpeRatio(balanceHistory),
      profit_factor: clampedProfitFactor,
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
