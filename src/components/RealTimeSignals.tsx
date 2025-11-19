// Real-time Signals Component
// Displays live trading signals with WebSocket connection

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Pause,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Target
} from 'lucide-react';
import { useRealTimeSignals } from '@/hooks/useRealTimeSignals';
import { useAuth } from '@/hooks/useAuth';

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

export const RealTimeSignals = () => {
  const { user } = useAuth();
  const {
    signals,
    connectionStatus,
    connectionInfo,
    executionResults,
    reconnectAttempts,
    maxReconnectAttempts,
    sendSignal,
    disconnect,
    reconnect,
    isConnected,
    isConnecting,
    isDisconnected
  } = useRealTimeSignals(user?.id || '');
  
  const [selectedTab, setSelectedTab] = useState('signals');
  const [autoScroll, setAutoScroll] = useState(true);
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
  
  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'buy': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'sell': return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'hold': return <Pause className="h-4 w-4 text-yellow-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };
  
  const getModeEmoji = (mode: string) => {
    switch (mode) {
      case 'testnet_only': return '🛡️';
      case 'hybrid_live': return '🟡';
      case 'paper_trading': return '📄';
      case 'mainnet_only': return '🚨';
      default: return '📊';
    }
  };
  
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };
  
  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };
  
  const getConnectionStatusIcon = () => {
    if (isConnected) return <Wifi className="h-4 w-4 text-green-500" />;
    if (isConnecting) return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />;
    return <WifiOff className="h-4 w-4 text-red-500" />;
  };
  
  const getConnectionStatusText = () => {
    if (isConnected) return 'Connected';
    if (isConnecting) return 'Connecting...';
    if (reconnectAttempts > 0) return `Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`;
    return 'Disconnected';
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Real-time Signals</h2>
          <p className="text-gray-600">Live trading signals and execution results</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {getConnectionStatusIcon()}
            <span className="text-sm font-medium">{getConnectionStatusText()}</span>
          </div>
          {isDisconnected && (
            <Button onClick={reconnect} size="sm" variant="outline">
              <RefreshCw className="h-4 w-4 mr-1" />
              Reconnect
            </Button>
          )}
          {isConnected && (
            <Button onClick={disconnect} size="sm" variant="outline">
              Disconnect
            </Button>
          )}
        </div>
      </div>
      
      {/* Connection Info */}
      {connectionInfo && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Connection Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Signals:</span>
                <span className="ml-2 font-medium">{signals.length}</span>
              </div>
              <div>
                <span className="text-gray-500">Strategies:</span>
                <span className="ml-2 font-medium">{connectionInfo.strategies || 0}</span>
              </div>
              <div>
                <span className="text-gray-500">Last Update:</span>
                <span className="ml-2 font-medium">{formatTimestamp(connectionInfo.timestamp)}</span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>
                <span className="ml-2 font-medium capitalize">{connectionInfo.type}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="signals">Signals ({signals.length})</TabsTrigger>
          <TabsTrigger value="executions">Executions ({executionResults.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="signals" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Trading Signals</h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded"
                />
                Auto-scroll
              </label>
            </div>
          </div>
          
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {signals.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No signals received yet
                </div>
              ) : (
                signals.map((signal) => (
                  <Card key={signal.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {getSignalIcon(signal.signal)}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{signal.symbol}</span>
                            <Badge className={getPriorityColor(signal.priority)}>
                              {signal.priority}
                            </Badge>
                            <Badge variant="outline">
                              {getModeEmoji(signal.mode)} {signal.mode}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {formatPrice(signal.price)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTimestamp(signal.timestamp)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Target className="h-3 w-3" />
                              {signal.strategyId}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {signal.signal.toUpperCase()}
                        </div>
                        <div className="text-xs text-gray-500">
                          {signal.channels.join(', ')}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="executions" className="space-y-4">
          <h3 className="text-lg font-semibold">Execution Results</h3>
          
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {executionResults.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No executions yet
                </div>
              ) : (
                executionResults.map((result) => (
                  <Card key={result.signalId} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {result.execution.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <div className="space-y-1">
                          <div className="font-medium">
                            Signal {result.signalId}
                          </div>
                          <div className="text-sm text-gray-600">
                            {result.execution.message}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="outline">
                              {result.execution.mode}
                            </Badge>
                            <Badge variant="outline">
                              {result.execution.risk} risk
                            </Badge>
                            <span className="text-gray-500">
                              Order: {result.execution.orderId}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${
                          result.execution.success ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {result.execution.success ? 'Success' : 'Failed'}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="settings" className="space-y-4">
          <h3 className="text-lg font-semibold">Signal Settings</h3>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Connection Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Max Signals</label>
                  <input
                    type="number"
                    defaultValue={100}
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Auto-clear (minutes)</label>
                  <input
                    type="number"
                    defaultValue={60}
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    placeholder="60"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm">Enable sound notifications</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm">Show priority badges</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">Auto-execute signals</span>
                </label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
