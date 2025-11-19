// Enhanced Telegram Signaler
// Advanced signaling system with trading mode support and signal references

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface TradingSignal {
  id: string;
  userId: string;
  strategyId: string;
  strategyName: string;
  signalType: 'BUY' | 'SELL' | 'LONG' | 'SHORT';
  symbol: string;
  price: number;
  stopLoss?: number;
  takeProfit?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  reason?: string;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tradingMode: 'testnet_only' | 'hybrid_live' | 'paper_trading' | 'mainnet_only';
  originalSignalId?: string; // Reference to original signal for closing
}

export interface PositionEvent {
  id: string;
  signalId: string;
  originalSignalId?: string;
  eventType: 'opened' | 'closed' | 'partial_closed' | 'liquidated';
  symbol: string;
  entryPrice?: number;
  exitPrice?: number;
  positionSize?: number;
  pnlPercent?: number;
  pnlAmount?: number;
  reason?: string;
  timestamp: number;
  tradingMode: string;
}

export class EnhancedTelegramSignaler {
  private supabase: any;

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }

  /**
   * Send trading signal based on trading mode
   */
  async sendTradingSignal(signal: TradingSignal, userSettings: any): Promise<boolean> {
    try {
      const message = this.formatTradingSignal(signal, userSettings);
      const success = await this.sendTelegramMessage(
        userSettings.telegram_bot_token,
        userSettings.telegram_chat_id,
        message,
        signal.priority
      );

      if (success) {
        // Store signal reference for future position tracking
        await this.storeSignalReference(signal);
      }

      return success;
    } catch (error) {
      console.error('[ENHANCED-TELEGRAM] Error sending trading signal:', error);
      return false;
    }
  }

  /**
   * Send position event (opened/closed) with reference to original signal
   */
  async sendPositionEvent(event: PositionEvent, userSettings: any): Promise<boolean> {
    try {
      const message = this.formatPositionEvent(event, userSettings);
      const success = await this.sendTelegramMessage(
        userSettings.telegram_bot_token,
        userSettings.telegram_chat_id,
        message,
        this.getEventPriority(event)
      );

      return success;
    } catch (error) {
      console.error('[ENHANCED-TELEGRAM] Error sending position event:', error);
      return false;
    }
  }

  /**
   * Format trading signal message based on trading mode
   */
  private formatTradingSignal(signal: TradingSignal, userSettings: any): string {
    const isLong = signal.signalType === 'BUY' || signal.signalType === 'LONG';
    const emoji = isLong ? '🟢' : '🔴';
    const signalLabel = isLong ? 'LONG SIGNAL' : 'SHORT SIGNAL';
    
    const modeEmoji = this.getTradingModeEmoji(signal.tradingMode);
    const modeInfo = this.getTradingModeInfo(signal.tradingMode);
    
    // Calculate TP/SL percentages
    const tpPercent = this.calculateTakeProfitPercent(signal);
    const slPercent = this.calculateStopLossPercent(signal);
    
    const timeStr = new Date(signal.timestamp).toLocaleString();
    
    let message = `${emoji} **${signalLabel}** ${modeEmoji}\n\n`;
    message += `📊 **Strategy:** ${signal.strategyName}\n`;
    message += `💰 **Symbol:** ${signal.symbol}\n`;
    message += `💵 **Price:** $${signal.price.toLocaleString()}\n`;
    message += `⏰ **Time:** ${timeStr}\n\n`;
    
    // Add TP/SL info if available
    if (tpPercent > 0) {
      message += `🎯 **Take Profit:** ${tpPercent.toFixed(2)}%\n`;
    }
    if (slPercent > 0) {
      message += `🛡️ **Stop Loss:** ${slPercent.toFixed(2)}%\n`;
    }
    
    // Add reason if available
    if (signal.reason) {
      message += `📝 **Reason:** ${signal.reason}\n`;
    }
    
    message += `\n${modeInfo}\n`;
    
    // Add signal ID for reference
    message += `🔗 **Signal ID:** \`${signal.id}\`\n`;
    
    return message;
  }

  /**
   * Format position event message with reference to original signal
   */
  private formatPositionEvent(event: PositionEvent, userSettings: any): string {
    const modeEmoji = this.getTradingModeEmoji(event.tradingMode);
    const timeStr = new Date(event.timestamp).toLocaleString();
    
    let message = '';
    let emoji = '';
    
    switch (event.eventType) {
      case 'opened':
        emoji = '🟢';
        message = `${emoji} **POSITION OPENED** ${modeEmoji}\n\n`;
        message += `📊 **Symbol:** ${event.symbol}\n`;
        message += `💰 **Entry:** $${event.entryPrice?.toLocaleString()}\n`;
        message += `📏 **Size:** ${event.positionSize?.toFixed(4)}\n`;
        message += `⏰ **Time:** ${timeStr}\n`;
        break;
        
      case 'closed':
        emoji = (event.pnlPercent ?? 0) >= 0 ? '✅' : '❌';
        message = `${emoji} **POSITION CLOSED** ${modeEmoji}\n\n`;
        message += `📊 **Symbol:** ${event.symbol}\n`;
        message += `💰 **Entry:** $${event.entryPrice?.toLocaleString()}\n`;
        message += `💰 **Exit:** $${event.exitPrice?.toLocaleString()}\n`;
        message += `📈 **P&L:** ${event.pnlPercent?.toFixed(2)}%\n`;
        if (event.pnlAmount) {
          message += `💵 **Amount:** $${event.pnlAmount.toFixed(2)}\n`;
        }
        if (event.reason) {
          message += `📝 **Reason:** ${event.reason}\n`;
        }
        message += `⏰ **Time:** ${timeStr}\n`;
        break;
        
      case 'partial_closed':
        emoji = '🔄';
        message = `${emoji} **POSITION PARTIALLY CLOSED** ${modeEmoji}\n\n`;
        message += `📊 **Symbol:** ${event.symbol}\n`;
        message += `💰 **Entry:** $${event.entryPrice?.toLocaleString()}\n`;
        message += `💰 **Exit:** $${event.exitPrice?.toLocaleString()}\n`;
        message += `📈 **P&L:** ${event.pnlPercent?.toFixed(2)}%\n`;
        if (event.reason) {
          message += `📝 **Reason:** ${event.reason}\n`;
        }
        message += `⏰ **Time:** ${timeStr}\n`;
        break;
        
      case 'liquidated':
        emoji = '⚠️';
        message = `${emoji} **POSITION LIQUIDATED** ${modeEmoji}\n\n`;
        message += `📊 **Symbol:** ${event.symbol}\n`;
        message += `💰 **Entry:** $${event.entryPrice?.toLocaleString()}\n`;
        message += `💰 **Exit:** $${event.exitPrice?.toLocaleString()}\n`;
        message += `📉 **Loss:** ${event.pnlPercent?.toFixed(2)}%\n`;
        message += `⏰ **Time:** ${timeStr}\n`;
        break;
    }
    
    // Add reference to original signal
    if (event.originalSignalId) {
      message += `\n🔗 **Original Signal:** \`${event.originalSignalId}\`\n`;
    }
    
    // Add current signal reference
    message += `🔗 **Event ID:** \`${event.id}\`\n`;
    
    return message;
  }

  /**
   * Get trading mode emoji and info
   */
  private getTradingModeEmoji(mode: string): string {
    switch (mode) {
      case 'testnet_only': return '🧪';
      case 'hybrid_live': return '⚡';
      case 'paper_trading': return '📄';
      case 'mainnet_only': return '🚨';
      default: return '📊';
    }
  }

  private getTradingModeInfo(mode: string): string {
    switch (mode) {
      case 'testnet_only':
        return '⚠️ **TESTNET MODE** - No real money at risk';
      case 'hybrid_live':
        return '⚡ **HYBRID LIVE** - Real data + Testnet API + Real execution';
      case 'paper_trading':
        return '📄 **PAPER TRADING** - Real data, no real execution';
      case 'mainnet_only':
        return '🚨 **LIVE TRADING** - Real money at risk!';
      default:
        return '📊 **TRADING MODE** - Unknown mode';
    }
  }

  /**
   * Calculate take profit percentage
   */
  private calculateTakeProfitPercent(signal: TradingSignal): number {
    if (!signal.price) return 0;
    
    const tpPrice = signal.takeProfit1 || signal.takeProfit;
    if (!tpPrice) return 0;
    
    const isLong = signal.signalType === 'BUY' || signal.signalType === 'LONG';
    if (isLong) {
      return ((tpPrice - signal.price) / signal.price) * 100;
    } else {
      return ((signal.price - tpPrice) / signal.price) * 100;
    }
  }

  /**
   * Calculate stop loss percentage
   */
  private calculateStopLossPercent(signal: TradingSignal): number {
    if (!signal.price || !signal.stopLoss) return 0;
    
    const isLong = signal.signalType === 'BUY' || signal.signalType === 'LONG';
    if (isLong) {
      return ((signal.price - signal.stopLoss) / signal.price) * 100;
    } else {
      return ((signal.stopLoss - signal.price) / signal.price) * 100;
    }
  }

  /**
   * Get event priority based on type
   */
  private getEventPriority(event: PositionEvent): 'low' | 'medium' | 'high' | 'critical' {
    switch (event.eventType) {
      case 'liquidated': return 'critical';
      case 'closed': return 'high';
      case 'partial_closed': return 'medium';
      case 'opened': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Send Telegram message with priority-based formatting
   */
  private async sendTelegramMessage(
    botToken: string,
    chatId: string,
    message: string,
    priority: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<boolean> {
    try {
      // Add priority indicator
      const priorityEmoji = this.getPriorityEmoji(priority);
      const formattedMessage = `${priorityEmoji}\n\n${message}`;
      
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formattedMessage,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[ENHANCED-TELEGRAM] Telegram API error:', errorData);
        return false;
      }

      console.log(`[ENHANCED-TELEGRAM] Message sent successfully (${priority})`);
      return true;
    } catch (error) {
      console.error('[ENHANCED-TELEGRAM] Error sending message:', error);
      return false;
    }
  }

  /**
   * Get priority emoji
   */
  private getPriorityEmoji(priority: string): string {
    switch (priority) {
      case 'critical': return '🚨';
      case 'high': return '⚡';
      case 'medium': return '📊';
      case 'low': return '📝';
      default: return '📊';
    }
  }

  /**
   * Store signal reference for position tracking
   */
  private async storeSignalReference(signal: TradingSignal): Promise<void> {
    try {
      await this.supabase
        .from('signal_references')
        .insert({
          signal_id: signal.id,
          user_id: signal.userId,
          strategy_id: signal.strategyId,
          symbol: signal.symbol,
          signal_type: signal.signalType,
          price: signal.price,
          timestamp: new Date(signal.timestamp).toISOString(),
          trading_mode: signal.tradingMode
        });
    } catch (error) {
      console.error('[ENHANCED-TELEGRAM] Error storing signal reference:', error);
    }
  }

  /**
   * Get original signal reference for position event
   */
  async getOriginalSignalReference(signalId: string): Promise<string | null> {
    try {
      const { data } = await this.supabase
        .from('signal_references')
        .select('signal_id')
        .eq('signal_id', signalId)
        .single();
      
      return data?.signal_id || null;
    } catch (error) {
      console.error('[ENHANCED-TELEGRAM] Error getting signal reference:', error);
      return null;
    }
  }
}

export const enhancedTelegramSignaler = new EnhancedTelegramSignaler();
