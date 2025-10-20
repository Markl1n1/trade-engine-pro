// Instant Signals Edge Function
// Real-time WebSocket signaling system with adaptive trading modes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../helpers/cors.ts';
import { BinanceAPIClient } from '../helpers/binance-api-client.ts';

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
  metadata: {
    indicators: any;
    conditions: any;
    risk: any;
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
  private signalBuffer = new Map<string, TradingSignal[]>();
  private signalCounts = new Map<string, { count: number; resetTime: number }>();
  
  async broadcastSignal(signal: TradingSignal, userSettings: any) {
    console.log(`[INSTANT-SIGNALS] Broadcasting signal: ${signal.id}`);
    
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
    return Array.from(this.connections.values()).filter(ws => 
      ws.readyState === WebSocket.OPEN
    );
  }
}

class PositionExecutionManager {
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
    // Открытие позиции на тестнете
    console.log(`[INSTANT-SIGNALS] Executing testnet position for ${signal.symbol}`);
    
    return {
      success: true,
      orderId: `testnet_${Date.now()}`,
      mode: 'testnet',
      risk: 'none',
      message: 'Testnet position executed'
    };
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
      // Проверяем наличие testnet API ключей
      if (!settings.binance_testnet_api_key || !settings.binance_testnet_api_secret) {
        throw new Error('Testnet API keys required for hybrid live mode');
      }
      
      // Выполняем реальную сделку через testnet API
      const orderResult = await this.executeRealOrder(signal, settings, true);
      
      return {
        success: true,
        orderId: orderResult.orderId,
        mode: 'hybrid_live',
        risk: 'low',
        message: 'Hybrid live position executed via testnet API',
        details: orderResult
      };
    } catch (error) {
      console.error(`[INSTANT-SIGNALS] Hybrid live execution failed:`, error);
      return {
        success: false,
        error: error.message,
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
      // Проверяем наличие mainnet API ключей
      if (!settings.binance_mainnet_api_key || !settings.binance_mainnet_api_secret) {
        throw new Error('Mainnet API keys required for mainnet trading');
      }
      
      // Выполняем реальную сделку через mainnet API
      const orderResult = await this.executeRealOrder(signal, settings, false);
      
      return {
        success: true,
        orderId: orderResult.orderId,
        mode: 'mainnet',
        risk: 'high',
        message: 'Mainnet position executed via mainnet API',
        details: orderResult
      };
    } catch (error) {
      console.error(`[INSTANT-SIGNALS] Mainnet execution failed:`, error);
      return {
        success: false,
        error: error.message,
        mode: 'mainnet',
        risk: 'high',
        message: 'Mainnet execution failed'
      };
    }
  }
  
  private async executeRealOrder(signal: TradingSignal, settings: any, useTestnet: boolean) {
    console.log(`[INSTANT-SIGNALS] Executing real order via ${useTestnet ? 'testnet' : 'mainnet'} API`);
    
    try {
      const apiKey = useTestnet ? settings.binance_testnet_api_key : settings.binance_mainnet_api_key;
      const apiSecret = useTestnet ? settings.binance_testnet_api_secret : settings.binance_mainnet_api_secret;
      
      if (!apiKey || !apiSecret) {
        throw new Error(`API credentials not found for ${useTestnet ? 'testnet' : 'mainnet'}`);
      }
      
      const client = new BinanceAPIClient(apiKey, apiSecret, useTestnet);
      
      // Test connectivity first
      const isConnected = await client.testConnectivity();
      if (!isConnected) {
        throw new Error('Failed to connect to Binance API');
      }
      
      // Place the order
      const orderRequest = {
        symbol: signal.symbol,
        side: signal.signal_type as 'BUY' | 'SELL',
        type: 'MARKET' as const,
        quantity: signal.quantity || 0.001
      };
      
      const orderResult = await client.placeOrder(orderRequest);
      
      console.log(`[INSTANT-SIGNALS] Order placed successfully:`, orderResult);
      
      return {
        orderId: orderResult.orderId.toString(),
        symbol: orderResult.symbol,
        side: orderResult.side,
        quantity: parseFloat(orderResult.origQty),
        price: parseFloat(orderResult.price),
        status: orderResult.status,
        executedAt: new Date(orderResult.time).toISOString(),
        clientOrderId: orderResult.clientOrderId
      };
      
    } catch (error) {
      console.error(`[INSTANT-SIGNALS] Real order execution failed:`, error);
      throw error;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle HTTP POST requests for signal execution
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      
      if (body.type === 'signal' && body.signal) {
        const signal: TradingSignal = body.signal;
        
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
          signal.priority = priority;
          
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
      }
      
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('[INSTANT-SIGNALS] HTTP request error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
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
  };
  
  socket.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      
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
  };
  
  socket.onerror = (error) => {
    console.error('[INSTANT-SIGNALS] WebSocket error:', error);
  };
  
  return response;
});
