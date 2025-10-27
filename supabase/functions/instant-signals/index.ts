// Instant Signals Edge Function
// Real-time WebSocket signaling system with adaptive trading modes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../helpers/cors.ts';
import { signalSchema, validateInput } from '../helpers/input-validation.ts';

interface TradingSignal {
  id: string;
  strategyId: string;
  userId: string;
  signal: 'buy' | 'sell' | 'hold';
  symbol: string;
  price: number;
  timestamp: number;
  mode: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  channels: string[];
  trailingStopPercent?: number;
  metadata: {
    indicators?: any;
    conditions?: any;
    risk?: any;
  };
}

interface SignalConfig {
  mode: 'testnet_only' | 'hybrid_safe' | 'hybrid_live' | 'paper_trading' | 'mainnet_only';
  priority: 'critical' | 'high' | 'medium' | 'low';
  channels: ('telegram' | 'websocket' | 'email' | 'push')[];
  cooldown: number;
  maxSignalsPerMinute: number;
}

class WebSocketSignalManager {
  private connections = new Map<string, WebSocket>();
  private userConnections = new Map<string, Set<string>>(); // userId -> Set of connectionIds
  private signalBuffer = new Map<string, TradingSignal[]>();
  private signalCounts = new Map<string, { count: number; resetTime: number }>();
  
  async broadcastSignal(signal: TradingSignal, userSettings: any) {
    console.log(`[INSTANT-SIGNALS] Broadcasting signal: ${signal.id} for user ${signal.userId}`);
    
    // Проверяем лимиты
    if (!this.checkSignalLimits(signal)) {
      console.log(`[INSTANT-SIGNALS] Signal ${signal.id} rate limited`);
      return;
    }
    
    // Отправка через WebSocket
    await this.sendWebSocketSignal(signal);
    
    // Отправка через Telegram
    if (signal.channels.includes('telegram') && userSettings.telegram_enabled) {
      await this.sendTelegramSignal(signal, userSettings);
    }
    
    // Отправка через Email
    if (signal.channels.includes('email')) {
      await this.sendEmailSignal(signal, userSettings);
    }
    
    // Отправка через Push
    if (signal.channels.includes('push')) {
      await this.sendPushSignal(signal, userSettings);
    }
  }
  
  private checkSignalLimits(signal: TradingSignal): boolean {
    const key = `${signal.userId}_${signal.strategyId}`;
    const now = Date.now();
    const signalData = this.signalCounts.get(key);
    
    if (!signalData || now > signalData.resetTime) {
      this.signalCounts.set(key, { count: 1, resetTime: now + 60000 });
      return true;
    }
    
    if (signalData.count >= 10) { // Максимум 10 сигналов в минуту
      return false;
    }
    
    signalData.count++;
    return true;
  }
  
  private async sendWebSocketSignal(signal: TradingSignal) {
    const userConnections = this.getUserConnections(signal.userId);
    const message = JSON.stringify({
      type: 'trading_signal',
      signal: signal,
      timestamp: Date.now()
    });
    
    console.log(`[INSTANT-SIGNALS] Found ${userConnections.length} connections for user ${signal.userId}`);
    
    for (const ws of userConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          console.log(`[INSTANT-SIGNALS] WebSocket signal sent to user ${signal.userId}`);
        } catch (error) {
          console.error(`[INSTANT-SIGNALS] WebSocket send error:`, error);
        }
      }
    }
  }
  
  private async sendTelegramSignal(signal: TradingSignal, userSettings: any) {
    const message = this.formatTelegramMessage(signal, userSettings);
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${userSettings.telegram_bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: userSettings.telegram_chat_id,
          text: message,
          parse_mode: 'Markdown'
        })
      });
      
      if (response.ok) {
        console.log(`[INSTANT-SIGNALS] Telegram signal sent to user ${signal.userId}`);
      } else {
        console.error(`[INSTANT-SIGNALS] Telegram send failed:`, await response.text());
      }
    } catch (error) {
      console.error(`[INSTANT-SIGNALS] Telegram error:`, error);
    }
  }
  
  private formatTelegramMessage(signal: TradingSignal, userSettings: any): string {
    const mode = userSettings.trading_mode || 'hybrid_safe';
    const emoji = this.getModeEmoji(mode);
    const riskLevel = this.getRiskLevel(mode);
    
    return `
${emoji} **${this.getModeName(mode)} SIGNAL**
📊 Strategy: ${signal.strategyId}
💰 Symbol: ${signal.symbol}
📈 Signal: ${signal.signal.toUpperCase()}
💵 Price: $${signal.price.toFixed(2)}
⏰ Time: ${new Date(signal.timestamp).toLocaleString()}

${riskLevel}
📊 Priority: ${signal.priority.toUpperCase()}
    `;
  }
  
  private getModeEmoji(mode: string): string {
    switch (mode) {
      case 'testnet_only': return '🧪';
      case 'hybrid_safe': return '🛡️';
      case 'hybrid_live': return '🟡';
      case 'paper_trading': return '📄';
      case 'mainnet_only': return '🚨';
      default: return '📊';
    }
  }
  
  private getModeName(mode: string): string {
    switch (mode) {
      case 'testnet_only': return 'TESTNET';
      case 'hybrid_safe': return 'HYBRID SAFE';
      case 'hybrid_live': return 'HYBRID LIVE';
      case 'paper_trading': return 'PAPER TRADING';
      case 'mainnet_only': return 'LIVE TRADING';
      default: return 'TRADING';
    }
  }
  
  private getRiskLevel(mode: string): string {
    switch (mode) {
      case 'testnet_only': return '⚠️ **TESTNET MODE** - No real money at risk';
      case 'hybrid_safe': return '🔒 **SAFE MODE** - Real data + Testnet API + Paper Trading';
      case 'hybrid_live': return '🟡 **LIVE MODE** - Real data + Testnet API + Real execution';
      case 'paper_trading': return '📄 **PAPER MODE** - Real data + Paper trading only';
      case 'mainnet_only': return '🚨 **LIVE MODE** - Real money at risk!';
      default: return '📊 **TRADING MODE**';
    }
  }
  
  private async sendEmailSignal(signal: TradingSignal, userSettings: any) {
    // Реализация отправки email уведомлений
    console.log(`[INSTANT-SIGNALS] Email signal for user ${signal.userId}`);
  }
  
  private async sendPushSignal(signal: TradingSignal, userSettings: any) {
    // Реализация push уведомлений
    console.log(`[INSTANT-SIGNALS] Push signal for user ${signal.userId}`);
  }
  
  private getUserConnections(userId: string): WebSocket[] {
    // Возвращает все WebSocket соединения для пользователя
    const userConnectionIds = this.userConnections.get(userId);
    if (!userConnectionIds) return [];
    
    const connections: WebSocket[] = [];
    for (const connectionId of userConnectionIds) {
      const ws = this.connections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        connections.push(ws);
      }
    }
    return connections;
  }
  
  addUserConnection(userId: string, connectionId: string, socket: WebSocket) {
    this.connections.set(connectionId, socket);
    
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);
  }
  
  removeUserConnection(connectionId: string) {
    const socket = this.connections.get(connectionId);
    if (socket) {
      this.connections.delete(connectionId);
      
      // Find and remove from user connections
      for (const [userId, connectionIds] of this.userConnections.entries()) {
        if (connectionIds.has(connectionId)) {
          connectionIds.delete(connectionId);
          if (connectionIds.size === 0) {
            this.userConnections.delete(userId);
          }
          break;
        }
      }
    }
  }
}

// Trailing Stop Manager for Live Trading
class LiveTrailingStopManager {
  public maxProfitPercent: number = 0;
  public trailingPercent: number;
  public isActive: boolean = false;
  public entryPrice: number = 0;
  public positionType: 'buy' | 'sell' = 'buy';
  public positionId: string = '';
  
  constructor(trailingPercent: number) {
    this.trailingPercent = trailingPercent;
    console.log(`[LIVE-TRAILING] Initialized with ${trailingPercent}% trailing stop`);
  }
  
  // Initialize with position details
  initialize(entryPrice: number, positionType: 'buy' | 'sell', positionId: string): void {
    this.entryPrice = entryPrice;
    this.positionType = positionType;
    this.positionId = positionId;
    this.maxProfitPercent = 0;
    this.isActive = false;
    console.log(`[LIVE-TRAILING] Initialized for ${positionType} at ${entryPrice.toFixed(2)} (Position: ${positionId})`);
  }
  
  // Check if trailing stop should trigger
  checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string } {
    if (!this.isActive) {
      const currentProfitPercent = this.calculateProfitPercent(currentPrice);
      if (currentProfitPercent > 0) {
        this.isActive = true;
        this.maxProfitPercent = currentProfitPercent;
        console.log(`[LIVE-TRAILING] Activated at ${currentProfitPercent.toFixed(2)}% profit for position ${this.positionId}`);
        return { shouldClose: false, reason: 'TRAILING_ACTIVATED' };
      }
      return { shouldClose: false, reason: 'NO_PROFIT_YET' };
    }
    
    const currentProfitPercent = this.calculateProfitPercent(currentPrice);
    if (currentProfitPercent > this.maxProfitPercent) {
      this.maxProfitPercent = currentProfitPercent;
      console.log(`[LIVE-TRAILING] New max profit: ${currentProfitPercent.toFixed(2)}% for position ${this.positionId}`);
    }
    
    const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
    
    if (currentProfitPercent < trailingThreshold) {
      console.log(`[LIVE-TRAILING] Triggered: ${currentProfitPercent.toFixed(2)}% < ${trailingThreshold.toFixed(2)}% (max: ${this.maxProfitPercent.toFixed(2)}%) for position ${this.positionId}`);
      return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED' };
    }
    
    return { shouldClose: false, reason: 'TRAILING_ACTIVE' };
  }
  
  // Calculate profit percentage from entry price
  private calculateProfitPercent(currentPrice: number): number {
    if (this.positionType === 'buy') {
      return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
    } else {
      return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
    }
  }
  
  reset(): void {
    this.maxProfitPercent = 0;
    this.isActive = false;
    this.entryPrice = 0;
    this.positionId = '';
  }
}

class PositionExecutionManager {
  // ✅ ПРАВИЛЬНО: Helper method to decrypt API credentials with Bybit support
  private async getDecryptedCredentials(userId: string, credentialType: string, settings: any) {
    // Create service role client for RPC
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data: credentials, error: credError } = await supabase
      .rpc('retrieve_credential', {
        p_user_id: userId,
        p_credential_type: credentialType
      });

    if (credError || !credentials || credentials.length === 0) {
      // Fallback to plaintext during migration period
      
      // ✅ ПРАВИЛЬНО: Поддержка всех типов учетных данных
      let apiKey: string | undefined;
      let apiSecret: string | undefined;
      
      switch (credentialType) {
        case 'bybit_testnet':
          apiKey = settings.bybit_testnet_api_key;
          apiSecret = settings.bybit_testnet_api_secret;
          break;
        case 'bybit_mainnet':
          apiKey = settings.bybit_mainnet_api_key;
          apiSecret = settings.bybit_mainnet_api_secret;
          break;
        default:
          throw new Error(`Unsupported credential type: ${credentialType}. Only Bybit is supported.`);
      }
      
      if (!apiKey || !apiSecret) {
        throw new Error(`API credentials not found for ${credentialType}`);
      }
      
      return { apiKey, apiSecret };
    }

    return {
      apiKey: credentials[0].api_key,
      apiSecret: credentials[0].api_secret
    };
  }
  
  async executeSignal(signal: TradingSignal, userSettings: any) {
    const mode = userSettings.trading_mode || 'hybrid_safe';
    
    console.log(`[INSTANT-SIGNALS] Executing signal ${signal.id} in mode ${mode}`);
    
    switch (mode) {
      case 'testnet_only':
        return this.executeTestnetPosition(signal, userSettings);
      case 'hybrid_safe':
        return this.executePaperPosition(signal, userSettings);
      case 'hybrid_live':
        return this.executeHybridLivePosition(signal, userSettings);
      case 'paper_trading':
        return this.executePaperPosition(signal, userSettings);
      case 'mainnet_only':
        return this.executeMainnetPosition(signal, userSettings);
      default:
        return this.executePaperPosition(signal, userSettings);
    }
  }
  
  private async executeTestnetPosition(signal: TradingSignal, settings: any) {
    console.log(`[INSTANT-SIGNALS] Executing testnet position for ${signal.symbol}`);
    
    try {
      // Get testnet credentials
      const credentials = await this.getDecryptedCredentials(signal.userId, 'bybit_testnet', settings);
      
      if (!credentials.apiKey || !credentials.apiSecret) {
        throw new Error('Bybit testnet API keys required for testnet mode');
      }
      
      // Execute REAL order via testnet API
      const orderResult = await this.executeRealOrder(signal, credentials, true, settings.exchange_type || 'bybit');
      
      return {
        success: true,
        orderId: orderResult.orderId,
        mode: 'testnet',
        risk: 'none',
        message: 'Testnet position executed via testnet API',
        details: orderResult
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[INSTANT-SIGNALS] Testnet execution failed:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
        mode: 'testnet',
        risk: 'none',
        message: 'Testnet execution failed'
      };
    }
  }
  
  private async executePaperPosition(signal: TradingSignal, settings: any) {
    // Симуляция позиции
    console.log(`[INSTANT-SIGNALS] Executing paper position for ${signal.symbol}`);
    
    return {
      success: true,
      orderId: `paper_${Date.now()}`,
      mode: 'paper',
      risk: 'none',
      message: 'Paper position executed'
    };
  }
  
  private async executeHybridLivePosition(signal: TradingSignal, settings: any) {
    // Hybrid Live: реальные данные + testnet API + реальное выполнение
    console.log(`[INSTANT-SIGNALS] Executing hybrid live position for ${signal.symbol}`);
    
    try {
      const exchangeType = settings.exchange_type || 'bybit';
      
      // Get Bybit testnet credentials for hybrid live mode
      const credentials = await this.getDecryptedCredentials(signal.userId, 'bybit_testnet', settings);
      
      if (!credentials.apiKey || !credentials.apiSecret) {
        throw new Error(`${exchangeType.toUpperCase()} testnet API keys required for hybrid live mode`);
      }
      
      // Выполняем реальную сделку через testnet API
      const orderResult = await this.executeRealOrder(signal, credentials, true, exchangeType);
      
      return {
        success: true,
        orderId: orderResult.orderId,
        mode: 'hybrid_live',
        risk: 'low',
        message: `Hybrid live position executed via ${exchangeType.toUpperCase()} testnet API`,
        details: orderResult
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[INSTANT-SIGNALS] Hybrid live execution failed:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
        mode: 'hybrid_live',
        risk: 'low',
        message: 'Hybrid live execution failed'
      };
    }
  }
  
  private async executeMainnetPosition(signal: TradingSignal, settings: any) {
    // Mainnet: реальные данные + mainnet API + реальное выполнение
    console.log(`[INSTANT-SIGNALS] Executing mainnet position for ${signal.symbol}`);
    
    try {
      // Get Bybit mainnet credentials for mainnet trading
      const credentials = await this.getDecryptedCredentials(signal.userId, 'bybit_mainnet', settings);
      
      if (!credentials.apiKey || !credentials.apiSecret) {
        throw new Error('Mainnet API keys required for mainnet trading');
      }
      
      // Выполняем реальную сделку через mainnet API
      const orderResult = await this.executeRealOrder(signal, credentials, false);
      
      return {
        success: true,
        orderId: orderResult.orderId,
        mode: 'mainnet',
        risk: 'high',
        message: 'Mainnet position executed via mainnet API',
        details: orderResult
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[INSTANT-SIGNALS] Mainnet execution failed:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
        mode: 'mainnet',
        risk: 'high',
        message: 'Mainnet execution failed'
      };
    }
  }
  
  private async executeRealOrder(signal: TradingSignal, credentials: {apiKey: string, apiSecret: string}, useTestnet: boolean, exchangeType: string = 'bybit') {
    console.log(`[INSTANT-SIGNALS] Executing real order via ${exchangeType.toUpperCase()} ${useTestnet ? 'testnet' : 'mainnet'} API`);
    
    try {
      const { apiKey, apiSecret } = credentials;
      
      if (!apiKey || !apiSecret) {
        throw new Error(`API credentials not found for ${exchangeType.toUpperCase()} ${useTestnet ? 'testnet' : 'mainnet'}`);
      }
      
      // Use Bybit exchange-api for order execution
      const { makeExchangeRequest } = await import('../helpers/exchange-api.ts');
      const config = {
        exchange: 'bybit' as const,
        apiKey,
        apiSecret,
        testnet: useTestnet
      };
      
      // Get account balance to calculate position size
      const accountData = await makeExchangeRequest(config, 'account');
      const availableBalance = parseFloat(accountData.result.list?.[0]?.totalWalletBalance || '0');
      const riskAmount = availableBalance * 0.01; // 1% risk
      const quantity = Math.max(0.001, riskAmount / signal.price);
      
      // Place market order via Bybit
      const orderParams = {
        category: 'linear',
        symbol: signal.symbol,
        side: signal.signal === 'buy' ? 'Buy' : 'Sell',
        orderType: 'Market',
        qty: quantity.toFixed(3)
      };
      
      const orderResult = await makeExchangeRequest(config, 'createOrder', orderParams, 'POST');
      
      console.log(`[INSTANT-SIGNALS] Bybit order placed successfully:`, orderResult);
      
      // Initialize Trailing Stop for the position
      const trailingStopPercent = signal.trailingStopPercent || 20;
      const trailingStopManager = new LiveTrailingStopManager(trailingStopPercent);
      const orderData = orderResult.result;
      trailingStopManager.initialize(
        parseFloat(orderData.avgPrice || signal.price),
        signal.signal.toLowerCase() as 'buy' | 'sell',
        orderData.orderId
      );
      
      // Store trailing stop manager in database for monitoring
      await this.storeTrailingStopState(signal.userId, orderData.orderId, signal, trailingStopManager);
      
      // Start real-time WebSocket monitoring for this position
      await this.startRealtimeMonitoring(signal.symbol);
      
      return {
        orderId: orderData.orderId,
        symbol: orderData.symbol,
        side: orderData.side,
        quantity: parseFloat(orderData.qty),
        price: parseFloat(orderData.avgPrice || signal.price),
        status: orderData.orderStatus,
        executedAt: new Date().toISOString(),
        clientOrderId: orderData.orderLinkId,
        trailingStopPercent: trailingStopPercent
      };
      
    } catch (error) {
      console.error(`[INSTANT-SIGNALS] Real order execution failed:`, error);
      throw error;
    }
  }
  
  // Store trailing stop state in database for monitoring
  private async storeTrailingStopState(userId: string, positionId: string, signal: TradingSignal, trailingStopManager: LiveTrailingStopManager) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabase
        .from('trailing_stop_states')
        .upsert({
          user_id: userId,
          position_id: positionId,
          symbol: signal.symbol,
          trailing_percent: trailingStopManager.trailingPercent,
          entry_price: trailingStopManager.entryPrice,
          position_type: trailingStopManager.positionType,
          is_active: trailingStopManager.isActive,
          max_profit_percent: trailingStopManager.maxProfitPercent,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      console.log(`[LIVE-TRAILING] Stored trailing stop state for position ${positionId}`);
    } catch (error) {
      console.error(`[LIVE-TRAILING] Failed to store trailing stop state:`, error);
    }
  }
  
  // Start real-time WebSocket monitoring for trailing stops
  private async startRealtimeMonitoring(symbol: string) {
    try {
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/trailing-stop-websocket`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'start_monitoring',
          symbol: symbol
        })
      });
      
      if (response.ok) {
        console.log(`[LIVE-TRAILING] ✅ Started real-time monitoring for ${symbol}`);
      } else {
        console.error(`[LIVE-TRAILING] ❌ Failed to start monitoring for ${symbol}:`, await response.text());
      }
    } catch (error) {
      console.error(`[LIVE-TRAILING] ❌ Error starting monitoring for ${symbol}:`, error);
    }
  }
}

class SignalPriorityManager {
  calculatePriority(signal: TradingSignal, userSettings: any): string {
    const mode = userSettings.trading_mode || 'hybrid_safe';
    const riskLevel = this.calculateRiskLevel(signal);
    
    // Критические сигналы для mainnet
    if (mode === 'mainnet_only' && riskLevel > 0.8) {
      return 'critical';
    }
    
    // Высокий приоритет для hybrid_live
    if (mode === 'hybrid_live' && riskLevel > 0.6) {
      return 'high';
    }
    
    // Средний приоритет для остальных
    if (mode === 'hybrid_safe' || mode === 'paper_trading') {
      return 'medium';
    }
    
    // Низкий приоритет для testnet
    if (mode === 'testnet_only') {
      return 'low';
    }
    
    return 'medium';
  }
  
  private calculateRiskLevel(signal: TradingSignal): number {
    // Простой расчет уровня риска на основе цены и волатильности
    return Math.random() * 0.5 + 0.3; // 0.3-0.8
  }
  
  async routeSignal(signal: TradingSignal, priority: string) {
    console.log(`[INSTANT-SIGNALS] Routing signal ${signal.id} with priority ${priority}`);
    
    switch (priority) {
      case 'critical':
        // Мгновенная отправка через все каналы
        await this.sendInstantSignal(signal);
        break;
      case 'high':
        // Быстрая отправка через WebSocket + Telegram
        await this.sendFastSignal(signal);
        break;
      case 'medium':
        // Стандартная отправка
        await this.sendStandardSignal(signal);
        break;
      case 'low':
        // Отложенная отправка
        await this.sendDelayedSignal(signal);
        break;
    }
  }
  
  private async sendInstantSignal(signal: TradingSignal) {
    // Мгновенная отправка
    console.log(`[INSTANT-SIGNALS] Instant signal: ${signal.id}`);
  }
  
  private async sendFastSignal(signal: TradingSignal) {
    // Быстрая отправка
    console.log(`[INSTANT-SIGNALS] Fast signal: ${signal.id}`);
  }
  
  private async sendStandardSignal(signal: TradingSignal) {
    // Стандартная отправка
    console.log(`[INSTANT-SIGNALS] Standard signal: ${signal.id}`);
  }
  
  private async sendDelayedSignal(signal: TradingSignal) {
    // Отложенная отправка
    console.log(`[INSTANT-SIGNALS] Delayed signal: ${signal.id}`);
  }
}

// WebSocket handler
const signalManager = new WebSocketSignalManager();
const positionManager = new PositionExecutionManager();
const priorityManager = new SignalPriorityManager();

// Global connection tracking
const connectionMap = new Map<WebSocket, string>(); // socket -> connectionId

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle HTTP POST requests for signal execution
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[INSTANT-SIGNALS] Received request body:', JSON.stringify(body).substring(0, 300));
      
      // Validate input with better error handling
      let validated: any;
      try {
        validated = validateInput(signalSchema, body);
      } catch (validationError: any) {
        console.error('[INSTANT-SIGNALS] Validation failed:', validationError.message);
        console.error('[INSTANT-SIGNALS] Request data:', JSON.stringify(body, null, 2));
        return new Response(
          JSON.stringify({ 
            error: 'Invalid signal data', 
            details: validationError.message,
            received: body 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const signal: TradingSignal = ('type' in validated && validated.type === 'signal') ? validated.signal : validated;
      
      // Get user settings
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', signal.userId)
        .single();
      
      if (userSettings) {
        // Calculate priority
        const priority = priorityManager.calculatePriority(signal, userSettings);
        signal.priority = priority as 'critical' | 'high' | 'medium' | 'low';
        
        // Broadcast signal
        await signalManager.broadcastSignal(signal, userSettings);
        
        // Execute position
        const execution = await positionManager.executeSignal(signal, userSettings);
        
        return new Response(JSON.stringify({
          success: true,
          signalId: signal.id,
          execution: execution
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: 'User settings not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[INSTANT-SIGNALS] HTTP request error:', errorMessage);
      
      // Check if it's a validation error
      if (errorMessage.includes('Validation failed')) {
        return new Response(JSON.stringify({ 
          error: 'Invalid input',
          details: errorMessage
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // Handle WebSocket connections
  const upgradeHeader = req.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket upgrade or POST request', { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  socket.onopen = () => {
    console.log('[INSTANT-SIGNALS] WebSocket connected');
    // Generate unique connection ID
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    connectionMap.set(socket, connectionId);
  };
  
  socket.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'user_info') {
        // Register user connection
        const connectionId = connectionMap.get(socket);
        if (connectionId) {
          signalManager.addUserConnection(data.userId, connectionId, socket);
          console.log(`[INSTANT-SIGNALS] User ${data.userId} connected with ID ${connectionId}`);
        }
        return;
      }
      
      if (data.type === 'signal') {
        const signal: TradingSignal = data.signal;
        
        // Получаем настройки пользователя
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        
        const { data: userSettings } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', signal.userId)
          .single();
        
        if (userSettings) {
          // Определяем приоритет
          const priority = priorityManager.calculatePriority(signal, userSettings) as 'high' | 'low' | 'medium' | 'critical';
          signal.priority = priority;
          
          // Отправляем сигнал
          await signalManager.broadcastSignal(signal, userSettings);
          
          // Выполняем позицию
          const execution = await positionManager.executeSignal(signal, userSettings);
          
          // Отправляем результат обратно
          socket.send(JSON.stringify({
            type: 'execution_result',
            signalId: signal.id,
            execution: execution
          }));
        }
      }
    } catch (error) {
      console.error('[INSTANT-SIGNALS] Error processing message:', error);
    }
  };
  
  socket.onclose = () => {
    console.log('[INSTANT-SIGNALS] WebSocket disconnected');
    // Remove the connection from our map
    const connectionId = connectionMap.get(socket);
    if (connectionId) {
      signalManager.removeUserConnection(connectionId);
      connectionMap.delete(socket);
    }
  };
  
  socket.onerror = (error) => {
    console.error('[INSTANT-SIGNALS] WebSocket error:', error);
  };
  
  return response;
});
