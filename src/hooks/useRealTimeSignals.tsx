// Real-time Signals Hook
// WebSocket connection for instant trading signals

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

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

interface ExecutionResult {
  signalId: string;
  execution: {
    success: boolean;
    orderId: string;
    mode: string;
    risk: string;
    message: string;
  };
}

interface ConnectionInfo {
  type: 'connected' | 'disconnected' | 'connecting';
  timestamp: number;
  signals: number;
  strategies: number;
}

export const useRealTimeSignals = (userId: string) => {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [executionResults, setExecutionResults] = useState<ExecutionResult[]>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const maxReconnectAttempts = 5;
  const reconnectDelay = 5000; // 5 seconds
  
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    
    setConnectionStatus('connecting');
    console.log('[REAL-TIME-SIGNALS] Connecting to WebSocket...');
    
    try {
      const ws = new WebSocket('wss://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/instant-signals');
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('[REAL-TIME-SIGNALS] WebSocket connected');
        setConnectionStatus('connected');
        setReconnectAttempts(0);
        
        // Отправляем информацию о пользователе
        ws.send(JSON.stringify({
          type: 'user_info',
          userId: userId,
          timestamp: Date.now()
        }));
        
        // Запускаем heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'heartbeat',
              timestamp: Date.now()
            }));
          }
        }, 30000); // 30 seconds
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[REAL-TIME-SIGNALS] Received:', data);
          
          switch (data.type) {
            case 'trading_signal':
              handleTradingSignal(data.signal);
              break;
            case 'execution_result':
              handleExecutionResult(data);
              break;
            case 'connection_info':
              setConnectionInfo(data);
              break;
            case 'heartbeat':
              // Обновляем timestamp последнего heartbeat
              break;
            default:
              console.log('[REAL-TIME-SIGNALS] Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('[REAL-TIME-SIGNALS] Error parsing message:', error);
        }
      };
      
      ws.onclose = (event) => {
        console.log('[REAL-TIME-SIGNALS] WebSocket closed:', event.code, event.reason);
        setConnectionStatus('disconnected');
        
        // Очищаем heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        // Автоматическое переподключение
        if (reconnectAttempts < maxReconnectAttempts) {
          setReconnectAttempts(prev => prev + 1);
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`[REAL-TIME-SIGNALS] Reconnecting... (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
            connectWebSocket();
          }, reconnectDelay);
        } else {
          console.log('[REAL-TIME-SIGNALS] Max reconnection attempts reached');
          toast({
            title: "Connection Lost",
            description: "Unable to reconnect to real-time signals. Please refresh the page.",
            variant: "destructive",
          });
        }
      };
      
      ws.onerror = (error) => {
        console.error('[REAL-TIME-SIGNALS] WebSocket error:', error);
        setConnectionStatus('disconnected');
      };
      
    } catch (error) {
      console.error('[REAL-TIME-SIGNALS] Connection error:', error);
      setConnectionStatus('disconnected');
    }
  }, [userId, reconnectAttempts]);
  
  const handleTradingSignal = (signal: TradingSignal) => {
    console.log('[REAL-TIME-SIGNALS] New trading signal:', signal);
    
    // Добавляем сигнал в список
    setSignals(prev => {
      const exists = prev.some(s => s.id === signal.id);
      if (exists) return prev;
      
      // Ограничиваем количество сигналов (последние 100)
      const newSignals = [signal, ...prev].slice(0, 100);
      return newSignals;
    });
    
    // Показываем уведомление
    const signalEmoji = signal.signal === 'buy' ? '📈' : signal.signal === 'sell' ? '📉' : '⏸️';
    const priorityEmoji = signal.priority === 'critical' ? '🚨' : 
                          signal.priority === 'high' ? '⚠️' : 
                          signal.priority === 'medium' ? '📊' : 'ℹ️';
    
    toast({
      title: `${signalEmoji} ${priorityEmoji} Trading Signal`,
      description: `${signal.symbol} ${signal.signal.toUpperCase()} at $${signal.price.toFixed(2)}`,
      duration: 5000,
    });
  };
  
  const handleExecutionResult = (data: ExecutionResult) => {
    console.log('[REAL-TIME-SIGNALS] Execution result:', data);
    
    setExecutionResults(prev => {
      const exists = prev.some(r => r.signalId === data.signalId);
      if (exists) return prev;
      
      return [data, ...prev].slice(0, 50); // Последние 50 результатов
    });
    
    // Показываем уведомление о результате исполнения
    if (data.execution.success) {
      toast({
        title: "✅ Position Executed",
        description: `${data.execution.mode} - ${data.execution.message}`,
        duration: 3000,
      });
    } else {
      toast({
        title: "❌ Execution Failed",
        description: data.execution.message,
        variant: "destructive",
        duration: 5000,
      });
    }
  };
  
  const sendSignal = useCallback((signal: Partial<TradingSignal>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'signal',
        signal: {
          id: `signal_${Date.now()}`,
          timestamp: Date.now(),
          ...signal
        }
      }));
    } else {
      console.warn('[REAL-TIME-SIGNALS] WebSocket not connected, cannot send signal');
    }
  }, []);
  
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    
    setConnectionStatus('disconnected');
    setReconnectAttempts(0);
  }, []);
  
  const reconnect = useCallback(() => {
    disconnect();
    setReconnectAttempts(0);
    connectWebSocket();
  }, [disconnect, connectWebSocket]);
  
  // Подключение при монтировании
  useEffect(() => {
    connectWebSocket();
    
    return () => {
      disconnect();
    };
  }, [connectWebSocket, disconnect]);
  
  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);
  
  return {
    signals,
    connectionStatus,
    connectionInfo,
    executionResults,
    reconnectAttempts,
    maxReconnectAttempts,
    sendSignal,
    disconnect,
    reconnect,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
    isDisconnected: connectionStatus === 'disconnected'
  };
};
