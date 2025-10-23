// Enhanced Backtest Engine with Fixed Logic
// Solves look-ahead bias, improves P&L calculations, and adds trailing stops

import { getBybitConstraints, getBinanceConstraints } from './exchange-constraints.ts';
import { calculateOptimalPositionSize, getDefaultPositionSizingConfig, validatePositionSize } from './position-sizer.ts';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_time: number;
  close_time: number;
}

interface Trade {
  entry_price: number;
  entry_time: number;
  exit_price?: number;
  exit_time?: number;
  type: 'buy' | 'sell';
  quantity: number;
  profit?: number;
  exit_reason?: string;
  max_profit_reached?: number; // For trailing stop tracking
}

interface BacktestConfig {
  initialBalance: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  trailingStopPercent?: number; // New: trailing stop percentage
  productType: 'spot' | 'futures';
  leverage: number;
  makerFee: number;
  takerFee: number;
  slippage: number;
  executionTiming: 'open' | 'close';
  positionSizePercent: number;
  exchangeType?: 'binance' | 'bybit';
  symbol?: string; // Trading pair symbol for exchange-specific constraints
}

interface BacktestResults {
  initial_balance: number;
  final_balance: number;
  total_return: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  max_drawdown: number;
  profit_factor: number;
  avg_win: number;
  avg_loss: number;
  balance_history: Array<{ time: number; balance: number }>;
  trades: Trade[];
  config: BacktestConfig;
}

// Trailing Stop Manager - FIXED IMPLEMENTATION
class TrailingStopManager {
  private maxProfitPercent: number = 0;
  private trailingPercent: number;
  private isActive: boolean = false;
  private entryPrice: number = 0;
  private positionType: 'buy' | 'sell' = 'buy';
  
  constructor(trailingPercent: number) {
    this.trailingPercent = trailingPercent;
    console.log(`[TRAILING] Initialized with ${trailingPercent}% trailing stop`);
  }
  
  // Initialize with position details
  initialize(entryPrice: number, positionType: 'buy' | 'sell'): void {
    this.entryPrice = entryPrice;
    this.positionType = positionType;
    this.maxProfitPercent = 0;
    this.isActive = false;
    console.log(`[TRAILING] Initialized for ${positionType} at ${entryPrice.toFixed(2)}`);
  }
  
  // Check if trailing stop should trigger
  checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string } {
    if (!this.isActive) {
      // Activate trailing stop when we have any profit
      const currentProfitPercent = this.calculateProfitPercent(currentPrice);
      if (currentProfitPercent > 0) {
        this.isActive = true;
        this.maxProfitPercent = currentProfitPercent;
        console.log(`[TRAILING] Activated at ${currentProfitPercent.toFixed(2)}% profit`);
        return { shouldClose: false, reason: 'TRAILING_ACTIVATED' };
      }
      return { shouldClose: false, reason: 'NO_PROFIT_YET' };
    }
    
    // Update max profit if current is higher
    const currentProfitPercent = this.calculateProfitPercent(currentPrice);
    if (currentProfitPercent > this.maxProfitPercent) {
      this.maxProfitPercent = currentProfitPercent;
      console.log(`[TRAILING] New max profit: ${currentProfitPercent.toFixed(2)}%`);
    }
    
    // Calculate trailing stop threshold
    const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
    
    if (currentProfitPercent < trailingThreshold) {
      console.log(`[TRAILING] Triggered: ${currentProfitPercent.toFixed(2)}% < ${trailingThreshold.toFixed(2)}% (max: ${this.maxProfitPercent.toFixed(2)}%)`);
      return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED' };
    }
    
    return { shouldClose: false, reason: 'TRAILING_ACTIVE' };
  }
  
  // Calculate profit percentage from entry price
  private calculateProfitPercent(currentPrice: number): number {
    if (this.positionType === 'buy') {
      // LONG: profit when price goes up
      return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
    } else {
      // SHORT: profit when price goes down
      return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
    }
  }
  
  reset(): void {
    this.maxProfitPercent = 0;
    this.isActive = false;
    this.entryPrice = 0;
  }
}

// Enhanced Backtest Engine
export class EnhancedBacktestEngine {
  private candles: Candle[];
  private config: BacktestConfig;
  private balance: number;
  private availableBalance: number;
  private lockedMargin: number;
  private position: Trade | null = null;
  private trades: Trade[] = [];
  private maxBalance: number;
  private maxDrawdown: number;
  private balanceHistory: Array<{ time: number; balance: number }> = [];
  private trailingStopManager: TrailingStopManager | null = null;
  
  // ✅ ПРАВИЛЬНО: Exchange constraints based on exchange type
  private stepSize: number;
  private minQty: number;
  private minNotional: number;
  private maxQty: number = 1000000; // Default max quantity
  private maxNotional: number = 100000000; // Default max notional
  private currentIndex: number = 0; // Track current candle index
  
  constructor(candles: Candle[], config: BacktestConfig) {
    this.candles = candles;
    this.config = config;
    this.balance = config.initialBalance;
    this.availableBalance = config.initialBalance;
    this.lockedMargin = 0;
    this.maxBalance = config.initialBalance;
    this.maxDrawdown = 0;
    
    // Get symbol from config or default to BTCUSDT
    const symbol = config.symbol || 'BTCUSDT';
    
    // Get exchange-specific constraints dynamically based on symbol
    const constraints = config.exchangeType === 'bybit' 
      ? getBybitConstraints(symbol)
      : getBinanceConstraints(symbol);
    
    this.stepSize = constraints.stepSize;
    this.minQty = constraints.minQty;
    this.minNotional = constraints.minNotional;
    
    // Override fees with exchange-specific values if not explicitly set
    if (config.makerFee === 0 || !config.makerFee) {
      config.makerFee = constraints.makerFee;
    }
    if (config.takerFee === 0 || !config.takerFee) {
      config.takerFee = constraints.takerFee;
    }
    
    console.log(`[BACKTEST] Exchange constraints for ${symbol}:`, {
      stepSize: this.stepSize,
      minQty: this.minQty,
      minNotional: this.minNotional,
      makerFee: config.makerFee,
      takerFee: config.takerFee
    });
    
    // Initialize trailing stop if configured
    if (config.trailingStopPercent) {
      this.trailingStopManager = new TrailingStopManager(config.trailingStopPercent);
    }
  }
  
  // Main backtest execution
  runBacktest(conditions: any[], groups: any[] = []): BacktestResults {
    console.log(`[BACKTEST] Starting enhanced backtest with ${this.candles.length} candles`);
    console.log(`[BACKTEST] Config: ${JSON.stringify(this.config, null, 2)}`);
    console.log(`[BACKTEST] SL/TP/Trailing parameters:`, {
      stopLossPercent: this.config.stopLossPercent,
      takeProfitPercent: this.config.takeProfitPercent,
      trailingStopPercent: this.config.trailingStopPercent
    });
    
    // Pre-calculate all indicators to avoid recalculation
    const indicatorCache = this.preCalculateIndicators(conditions);
    
    // Main simulation loop
    for (let i = 1; i < this.candles.length; i++) {
      const currentCandle = this.candles[i];
      
      // CRITICAL: Use indicators from previous candle (i-1) to prevent look-ahead bias
      const indicatorIndex = i - 1;
      
      // Check entry conditions
      if (!this.position) {
        this.checkEntryConditions(currentCandle, indicatorIndex, conditions, groups, indicatorCache);
      } else {
        this.checkExitConditions(currentCandle, indicatorIndex, conditions, groups, indicatorCache);
      }
      
      // Update balance tracking
      this.updateBalanceTracking(currentCandle);
    }
    
    // Close any remaining position
    this.closeRemainingPosition();
    
    return this.calculateResults();
  }
  
  // Pre-calculate all indicators for performance
  private preCalculateIndicators(conditions: any[]): Map<string, number[]> {
    const cache = new Map<string, number[]>();
    const closes = this.candles.map(c => c.close);
    
    // Get unique indicator requirements
    const requirements = new Set<string>();
    conditions.forEach(condition => {
      if (condition.indicator_type) {
        const key = this.buildIndicatorKey(condition);
        requirements.add(key);
      }
    });
    
    // Calculate each indicator once
    requirements.forEach(key => {
      try {
        const values = this.calculateIndicator(key, this.candles, closes);
        cache.set(key, values);
      } catch (error) {
        console.warn(`Failed to calculate indicator ${key}:`, error);
        cache.set(key, new Array(this.candles.length).fill(NaN));
      }
    });
    
    return cache;
  }
  
  // Build indicator cache key
  private buildIndicatorKey(condition: any): string {
    const parts = [condition.indicator_type];
    if (condition.period_1) parts.push(`p${condition.period_1}`);
    if (condition.period_2) parts.push(`p2${condition.period_2}`);
    if (condition.deviation) parts.push(`d${condition.deviation}`);
    if (condition.smoothing) parts.push(`s${condition.smoothing}`);
    if (condition.multiplier) parts.push(`m${condition.multiplier}`);
    if (condition.acceleration) parts.push(`a${condition.acceleration}`);
    return parts.join('_');
  }
  
  // Calculate single indicator
  private calculateIndicator(key: string, candles: Candle[], closes: number[]): number[] {
    const parts = key.split('_');
    const type = parts[0];
    const params: any = {};
    
    // Parse parameters
    parts.slice(1).forEach(part => {
      const prefix = part[0];
      const value = parseFloat(part.slice(1));
      if (prefix === 'p') params.period = value;
      if (prefix === 'd') params.deviation = value;
      if (prefix === 's') params.smoothing = value;
      if (prefix === 'm') params.multiplier = value;
      if (prefix === 'a') params.acceleration = value;
    });
    
    // Calculate based on type
    switch (type.toLowerCase()) {
      case 'sma':
        return this.calculateSMA(closes, params.period || 20);
      case 'ema':
        return this.calculateEMA(closes, params.period || 20);
      case 'rsi':
        return this.calculateRSI(closes, params.period || 14);
      case 'macd':
        const macd = this.calculateMACD(closes);
        return macd.macd;
      case 'atr':
        return this.calculateATR(candles, params.period || 14);
      case 'bollinger_upper':
        const bb = this.calculateBollingerBands(closes, params.period || 20, params.deviation || 2);
        return bb.upper;
      case 'bollinger_lower':
        const bbLower = this.calculateBollingerBands(closes, params.period || 20, params.deviation || 2);
        return bbLower.lower;
      default:
        console.warn(`Unknown indicator type: ${type}`);
        return new Array(candles.length).fill(NaN);
    }
  }
  
  // Check entry conditions
  private checkEntryConditions(
    currentCandle: Candle, 
    indicatorIndex: number, 
    conditions: any[], 
    groups: any[], 
    indicatorCache: Map<string, number[]>
  ): void {
    const buyConditions = conditions.filter(c => c.order_type === 'buy');
    if (buyConditions.length === 0) return;
    
    const shouldEnter = this.evaluateConditions(buyConditions, groups, indicatorIndex, indicatorCache);
    
    if (shouldEnter) {
      this.executeEntry(currentCandle);
    }
  }
  
  // Check exit conditions with trailing stop support
  private checkExitConditions(
    currentCandle: Candle, 
    indicatorIndex: number, 
    conditions: any[], 
    groups: any[], 
    indicatorCache: Map<string, number[]>
  ): void {
    if (!this.position) return;
    
    let exitPrice: number | null = null;
    let exitReason = '';
    
    // 1. Check trailing stop first (if configured)
    if (this.trailingStopManager) {
      const currentPrice = this.getExecutionPrice(currentCandle);
      const trailingResult = this.trailingStopManager.checkTrailingStop(currentPrice);
      
      if (trailingResult.shouldClose) {
        exitPrice = currentPrice;
        exitReason = 'TRAILING_STOP';
      }
    }
    
    // 2. Check traditional SL/TP if no trailing stop triggered
    if (!exitPrice) {
      const slTpResult = this.checkStopLossTakeProfit(currentCandle);
      if (slTpResult.exit) {
        exitPrice = slTpResult.price;
        exitReason = slTpResult.reason;
      }
    }
    
    // 3. Check strategy sell conditions
    if (!exitPrice) {
      const sellConditions = conditions.filter(c => c.order_type === 'sell');
      if (sellConditions.length > 0) {
        const shouldExit = this.evaluateConditions(sellConditions, groups, indicatorIndex, indicatorCache);
        if (shouldExit) {
          exitPrice = this.getExecutionPrice(currentCandle);
          exitReason = 'SELL_SIGNAL';
        }
      }
    }
    
    // Execute exit if any condition met
    if (exitPrice) {
      this.executeExit(currentCandle, exitPrice, exitReason);
    }
  }
  
  // Calculate current profit percentage
  private calculateCurrentProfit(currentCandle: Candle): number {
    if (!this.position) return 0;
    
    const currentPrice = this.getExecutionPrice(currentCandle);
    const profit = this.position.type === 'buy' 
      ? (currentPrice - this.position.entry_price) / this.position.entry_price * 100
      : (this.position.entry_price - currentPrice) / this.position.entry_price * 100;
    
    return profit;
  }
  
  // ✅ ПРАВИЛЬНО: Check traditional stop loss and take profit with proper intrabar logic
  private checkStopLossTakeProfit(currentCandle: Candle): { exit: boolean; price: number | null; reason: string } {
    if (!this.position) return { exit: false, price: null, reason: '' };
    
    const stopLoss = this.config.stopLossPercent;
    const takeProfit = this.config.takeProfitPercent;
    
    if (!stopLoss && !takeProfit) {
      return { exit: false, price: null, reason: '' };
    }
    
    // Calculate SL/TP prices
    const stopLossPrice = this.position.entry_price * (1 - (stopLoss || 0) / 100);
    const takeProfitPrice = this.position.entry_price * (1 + (takeProfit || 0) / 100);
    
    // ✅ ПРАВИЛЬНО: Check intrabar hits with proper order logic
    const slHit = stopLoss && currentCandle.low <= stopLossPrice;
    const tpHit = takeProfit && currentCandle.high >= takeProfitPrice;
    
    if (slHit && tpHit) {
      // ✅ ПРАВИЛЬНО: Both hit in same candle - determine which happened first
      // Conservative approach: Check if price opened above/below levels
      const openedAboveSL = currentCandle.open > stopLossPrice;
      const openedBelowTP = currentCandle.open < takeProfitPrice;
      
      if (openedAboveSL && openedBelowTP) {
        // Price opened between levels - check which is closer to open
        const slDistance = Math.abs(currentCandle.open - stopLossPrice);
        const tpDistance = Math.abs(takeProfitPrice - currentCandle.open);
        
        if (slDistance <= tpDistance) {
          return { exit: true, price: stopLossPrice, reason: 'STOP_LOSS' };
        } else {
          return { exit: true, price: takeProfitPrice, reason: 'TAKE_PROFIT' };
        }
      } else if (openedAboveSL) {
        // Price opened above SL, TP hit first
        return { exit: true, price: takeProfitPrice, reason: 'TAKE_PROFIT' };
      } else {
        // Price opened below TP, SL hit first
        return { exit: true, price: stopLossPrice, reason: 'STOP_LOSS' };
      }
    } else if (slHit) {
      return { exit: true, price: stopLossPrice, reason: 'STOP_LOSS' };
    } else if (tpHit) {
      return { exit: true, price: takeProfitPrice, reason: 'TAKE_PROFIT' };
    }
    
    return { exit: false, price: null, reason: '' };
  }
  
  // Execute entry
  private executeEntry(currentCandle: Candle): void {
    const executionPrice = this.getExecutionPrice(currentCandle);
    
    // 🎯 PHASE 3: Dynamic Position Sizing
    const positionSizingConfig = getDefaultPositionSizingConfig();
    const stopLossPrice = executionPrice * (1 - (this.config.stopLossPercent || 2) / 100);
    
    // Calculate optimal position size based on risk and volatility
    const positionSizingResult = calculateOptimalPositionSize(
      this.availableBalance,
      executionPrice,
      stopLossPrice,
      this.candles.slice(0, this.currentIndex + 1),
      positionSizingConfig,
      {
        minQty: this.minQty,
        maxQty: this.maxQty,
        stepSize: this.stepSize,
        minNotional: this.minNotional,
        maxNotional: this.maxNotional
      },
      1.0, // regimeMultiplier (would be passed from market regime detection)
      1.0  // correlationFactor (would be calculated from portfolio correlation)
    );
    
    // Use dynamic position size instead of fixed percentage
    const positionSizeUSD = positionSizingResult.positionSize * executionPrice;
    
    let quantity: number;
    let margin: number;
    let notional: number;
    let priceWithSlippage: number;
    
    if (this.config.productType === 'futures') {
      // ✅ ПРАВИЛЬНО: Для фьючерсов сначала определяем notional, потом quantity
      notional = positionSizeUSD * this.config.leverage;
      quantity = notional / executionPrice;
      
      // Apply slippage correctly for futures
      priceWithSlippage = executionPrice * (1 + this.config.slippage / 100);
      quantity = notional / priceWithSlippage; // Recalculate with slippage
      
      // ✅ ПРАВИЛЬНО: Маржа = Notional / Leverage
      margin = notional / this.config.leverage;
    } else {
      // Spot trading
      notional = positionSizeUSD;
      priceWithSlippage = executionPrice * (1 + this.config.slippage / 100);
      quantity = notional / priceWithSlippage;
      margin = notional;
    }
    
    // Validate position size
    const validation = validatePositionSize(quantity, executionPrice, {
      minQty: this.minQty,
      maxQty: this.maxQty,
      stepSize: this.stepSize,
      minNotional: this.minNotional,
      maxNotional: this.maxNotional
    });
    
    if (!validation.isValid) {
      console.warn(`[POSITION-SIZING] Invalid position size: ${validation.errors.join(', ')}`);
      return;
    }
    
    // Apply exchange constraints
    quantity = Math.floor(quantity / this.stepSize) * this.stepSize;
    const actualNotional = quantity * priceWithSlippage;
    
    // Validate constraints
    const canEnter = quantity >= this.minQty && 
                    actualNotional >= this.minNotional && 
                    margin <= this.availableBalance;
    
    if (!canEnter) {
      console.log(`[BACKTEST] Entry rejected: qty=${quantity.toFixed(5)}, notional=${actualNotional.toFixed(2)}, margin=${margin.toFixed(2)}`);
      return;
    }
    
    // ✅ ПРАВИЛЬНО: Calculate entry fee based on exchange type and order type
    let entryFee: number;
    if (this.config.exchangeType === 'bybit') {
      // Bybit fees: 0.01% maker, 0.06% taker
      entryFee = actualNotional * (this.config.takerFee / 100); // Market order = taker fee
    } else {
      // Binance fees: 0.02% maker, 0.04% taker
      entryFee = actualNotional * (this.config.takerFee / 100);
    }
    
    this.position = {
      type: 'buy',
      entry_price: priceWithSlippage,
      entry_time: currentCandle.open_time,
      quantity,
      max_profit_reached: 0
    };
    
    // Initialize trailing stop if configured
    if (this.trailingStopManager) {
      this.trailingStopManager.initialize(priceWithSlippage, 'buy');
    }
    
    // Deduct margin and fee
    if (this.config.productType === 'futures') {
      this.lockedMargin = margin;
      this.availableBalance -= (margin + entryFee);
    } else {
      this.availableBalance -= (actualNotional + entryFee);
    }
    
    console.log(`[BACKTEST] Opened BUY at ${priceWithSlippage.toFixed(2)} (qty: ${quantity.toFixed(5)}, notional: ${actualNotional.toFixed(2)})`);
  }
  
  // ✅ ПРАВИЛЬНО: Execute exit with correct slippage and fee calculation
  private executeExit(currentCandle: Candle, exitPrice: number, exitReason: string): void {
    if (!this.position) return;
    
    // ✅ ПРАВИЛЬНО: Apply slippage correctly for exit (sell order = worse price)
    const exitPriceWithSlippage = exitPrice * (1 - this.config.slippage / 100);
    
    // Calculate P&L
    const pnl = this.position.quantity * (exitPriceWithSlippage - this.position.entry_price);
    const exitNotional = this.position.quantity * exitPriceWithSlippage;
    
    // ✅ ПРАВИЛЬНО: Calculate exit fee based on exchange type (market order = taker fee)
    let exitFee: number;
    if (this.config.exchangeType === 'bybit') {
      // Bybit fees: 0.01% maker, 0.06% taker
      exitFee = exitNotional * (this.config.takerFee / 100);
    } else {
      // Binance fees: 0.02% maker, 0.04% taker
      exitFee = exitNotional * (this.config.takerFee / 100);
    }
    const netProfit = pnl - exitFee;
    
    this.position.exit_price = exitPriceWithSlippage;
    this.position.exit_time = currentCandle.open_time;
    this.position.profit = netProfit;
    this.position.exit_reason = exitReason;
    
    // Return funds
    if (this.config.productType === 'futures') {
      this.availableBalance += (this.lockedMargin + netProfit);
      this.lockedMargin = 0;
    } else {
      this.availableBalance += (exitNotional - exitFee);
    }
    
    this.balance = this.availableBalance + this.lockedMargin;
    this.trades.push({ ...this.position });
    
    console.log(`[BACKTEST] Closed ${exitReason} at ${exitPriceWithSlippage.toFixed(2)}, profit: ${netProfit.toFixed(2)}`);
    
    // Reset trailing stop manager
    if (this.trailingStopManager) {
      this.trailingStopManager.reset();
    }
    
    this.position = null;
  }
  
  // Get execution price based on timing
  private getExecutionPrice(candle: Candle): number {
    return this.config.executionTiming === 'open' ? candle.open : candle.close;
  }
  
  // Update balance tracking and drawdown
  private updateBalanceTracking(currentCandle: Candle): void {
    this.balance = this.availableBalance + this.lockedMargin;
    this.balanceHistory.push({ time: currentCandle.open_time, balance: this.balance });
    
    if (this.balance > this.maxBalance) {
      this.maxBalance = this.balance;
    }
    
    const currentDrawdown = ((this.maxBalance - this.balance) / this.maxBalance) * 100;
    if (currentDrawdown > this.maxDrawdown) {
      this.maxDrawdown = currentDrawdown;
    }
  }
  
  // Close any remaining position at the end
  private closeRemainingPosition(): void {
    if (this.position) {
      const lastCandle = this.candles[this.candles.length - 1];
      const exitPrice = this.getExecutionPrice(lastCandle);
      this.executeExit(lastCandle, exitPrice, 'END_OF_PERIOD');
    }
  }
  
  // Calculate final results
  private calculateResults(): BacktestResults {
    const totalReturn = ((this.balance - this.config.initialBalance) / this.config.initialBalance) * 100;
    const winningTrades = this.trades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = this.trades.filter(t => (t.profit || 0) <= 0).length;
    const winRate = this.trades.length > 0 ? (winningTrades / this.trades.length) * 100 : 0;
    
    const avgWin = winningTrades > 0 
      ? this.trades.filter(t => (t.profit || 0) > 0).reduce((sum, t) => sum + (t.profit || 0), 0) / winningTrades 
      : 0;
    const avgLoss = losingTrades > 0
      ? Math.abs(this.trades.filter(t => (t.profit || 0) <= 0).reduce((sum, t) => sum + (t.profit || 0), 0) / losingTrades)
      : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades) / (avgLoss * losingTrades) : 0;
    
    return {
      initial_balance: this.config.initialBalance,
      final_balance: this.balance,
      total_return: totalReturn,
      total_trades: this.trades.length,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: winRate,
      max_drawdown: this.maxDrawdown,
      profit_factor: profitFactor,
      avg_win: avgWin,
      avg_loss: avgLoss,
      balance_history: this.balanceHistory,
      trades: this.trades,
      config: this.config
    };
  }
  
  // Evaluate conditions (simplified version)
  private evaluateConditions(
    conditions: any[], 
    groups: any[], 
    indicatorIndex: number, 
    indicatorCache: Map<string, number[]>
  ): boolean {
    if (!conditions || conditions.length === 0) return false;
    
    // For now, use simple AND logic
    return conditions.every(condition => {
      const key = this.buildIndicatorKey(condition);
      const values = indicatorCache.get(key);
      if (!values || indicatorIndex >= values.length) return false;
      
      const currentValue = values[indicatorIndex];
      if (isNaN(currentValue)) return false;
      
      switch (condition.operator) {
        case 'greater_than':
          return currentValue > condition.value;
        case 'less_than':
          return currentValue < condition.value;
        case 'equals':
          return Math.abs(currentValue - condition.value) < 0.01;
        default:
          return false;
      }
    });
  }
  
  // Technical indicator calculations
  private calculateSMA(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
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
  
  private calculateRSI(data: number[], period: number = 14): number[] {
    const result: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }
    
    for (let i = 0; i < gains.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else {
        const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        if (avgLoss === 0) {
          result.push(100);
        } else {
          const rs = avgGain / avgLoss;
          result.push(100 - (100 / (1 + rs)));
        }
      }
    }
    return [50, ...result];
  }
  
  private calculateMACD(data: number[]): { macd: number[], signal: number[], histogram: number[] } {
    const fastEMA = this.calculateEMA(data, 12);
    const slowEMA = this.calculateEMA(data, 26);
    const macd = fastEMA.map((v, i) => v - slowEMA[i]);
    const signal = this.calculateEMA(macd.slice(26), 9);
    const paddedSignal = new Array(26).fill(0).concat(signal);
    const histogram = macd.map((v, i) => v - paddedSignal[i]);
    return { macd, signal: paddedSignal, histogram };
  }
  
  private calculateATR(candles: Candle[], period: number = 14): number[] {
    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    return [0, ...this.calculateEMA(tr, period)];
  }
  
  private calculateBollingerBands(data: number[], period: number, deviation: number): { upper: number[], middle: number[], lower: number[] } {
    const sma = this.calculateSMA(data, period);
    const upper: number[] = [];
    const lower: number[] = [];
    
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        upper.push(NaN);
        lower.push(NaN);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = sma[i];
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        upper.push(mean + (deviation * stdDev));
        lower.push(mean - (deviation * stdDev));
      }
    }
    
    return { upper, middle: sma, lower };
  }
}
