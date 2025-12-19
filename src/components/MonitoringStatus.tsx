import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, PlayCircle, Zap, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
// Removed StrategyDebugPanel import - using PerformanceDashboard instead

export function MonitoringStatus() {
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [recentSignals, setRecentSignals] = useState<any[]>([]);
  const [checking, setChecking] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [debugLogs, setDebugLogs] = useState<any[]>([]);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [showDisconnectBanner, setShowDisconnectBanner] = useState(false);

  // New monitoring system status
  const [cronStatus, setCronStatus] = useState<'active' | 'inactive' | 'unknown'>('unknown');
  const [cronLastRun, setCronLastRun] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  useEffect(() => {
    loadMonitoringStatus();
    loadCronStatus();
    loadSystemHealth();
    const interval = setInterval(() => {
      loadMonitoringStatus();
      loadCronStatus();
      loadSystemHealth();
    }, 30000);

    // Connect to WebSocket monitor
    const connectWebSocket = () => {
      setWsStatus('connecting');
      const ws = new WebSocket(`wss://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/exchange-websocket-monitor`);
      ws.onopen = () => {
        console.log('[MONITOR] WebSocket connected');
        setWsStatus('connected');
        setShowDisconnectBanner(false);
      };
      ws.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log('[MONITOR] Received:', data);
        if (data.type === 'heartbeat' || data.type === 'connected') {
          setLastUpdate(data.timestamp);
          setWsStatus('connected');
          setShowDisconnectBanner(false);
          if (data.type === 'connected' && data.strategyDetails) {
            setConnectionInfo(data);
          }
        } else if (data.type === 'disconnected') {
          setWsStatus('disconnected');
          setShowDisconnectBanner(true);
        } else if (data.type === 'debug') {
          // Add debug log
          setDebugLogs(prev => [...prev.slice(-99), {
            timestamp: Date.now(),
            strategy: data.strategy || 'System',
            type: data.subtype || 'info',
            message: data.message,
            data: data.data
          }]);
        }
      };
      ws.onerror = () => {
        setWsStatus('disconnected');
        setShowDisconnectBanner(true);
      };
      ws.onclose = () => {
        setWsStatus('disconnected');
        setShowDisconnectBanner(true);
        setTimeout(connectWebSocket, 5000);
      };
      return ws;
    };
    const ws = connectWebSocket();
    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, []);
  const loadCronStatus = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'last_monitoring_run')
      .single();

    if (data) {
      const lastRun = new Date(data.updated_at);
      const now = new Date();
      const diffMs = now.getTime() - lastRun.getTime();
      // FIXED: Cron runs every minute, give 3 minutes grace period for processing delays
      const isActive = diffMs < 180000; // Active if updated within last 3 minutes (was 2)
      
      setCronStatus(isActive ? 'active' : 'inactive');
      setCronLastRun(lastRun.toLocaleString());
      
      // Debug log only on error - reduce noise
    } else {
      // No need to log every time - this is expected for new installations
      setCronStatus('unknown');
    }
  };
  const loadSystemHealth = async () => {
    try {
      // System health logs table was removed - using strategy status instead
      const { data: strategies } = await supabase
        .from('strategies')
        .select('status')
        .eq('status', 'active');
      
      setSystemHealth({
        activeStrategies: strategies?.length || 0,
        status: 'healthy'
      });
    } catch (error) {
      console.error('[MONITOR] Error loading system health:', error);
    }
  };
  const loadMonitoringStatus = async () => {
    try {
      // Get active strategies count
      const {
        data: strategies
      } = await supabase.from("strategies").select("id").eq("status", "active");
      setActiveCount(strategies?.length || 0);

      // Get recent signals (last 10)
      const {
        data: signals
      } = await supabase.from("strategy_signals").select("*, strategies(name)").order("created_at", {
        ascending: false
      }).limit(10);
      setRecentSignals(signals || []);

      // Try to get last monitoring run (requires admin role)
      const {
        data: settings
      } = await supabase.from("system_settings").select("setting_value").eq("setting_key", "last_monitoring_run").maybeSingle();
      if (settings) {
        setLastRun(settings.setting_value);
        setMonitoringEnabled(true);
      }
    } catch (error) {
      // Silently fail for non-admin users
      console.log("Monitoring status not accessible (admin only)");
    }
  };
  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };
  return <div className="space-y-4">
      {showDisconnectBanner && wsStatus === 'disconnected' && <Card className="p-4 bg-destructive/10 border-destructive/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-destructive">WebSocket Disconnected</h4>
              <p className="text-xs text-muted-foreground">
                Real-time monitoring is offline. Attempting to reconnect... Backup monitoring still active.
              </p>
            </div>
          </div>
        </Card>}

      <Card className="p-6 bg-card/50 backdrop-blur border-primary/10">
        <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Strategy Monitoring</h3>
            <p className="text-xs text-muted-foreground">
              Multi-tier monitoring system status
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={wsStatus === 'connected' ? "default" : wsStatus === 'connecting' ? "secondary" : "destructive"} className="gap-2 px-3 py-1">
            <div className={`h-3 w-3 rounded-full ${wsStatus === 'connected' ? "bg-green-400 shadow-lg shadow-green-400/50 animate-pulse" : wsStatus === 'connecting' ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`} />
            <span className="font-bold">
              {wsStatus === 'connected' ? '⚡ Real-time Active' : wsStatus === 'connecting' ? 'Connecting...' : '⚠️ Offline'}
            </span>
          </Badge>
        </div>
      </div>

      {/* System Status Overview */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3 w-3" />
            Cron Job (Auto)
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${cronStatus === 'active' ? 'bg-green-400' : cronStatus === 'inactive' ? 'bg-red-400' : 'bg-yellow-400'}`} />
            <span className="text-sm font-medium">
              {cronStatus === 'active' ? 'Active' : cronStatus === 'inactive' ? 'Inactive' : 'Unknown'}
            </span>
          </div>
          {cronLastRun && <div className="text-xs text-muted-foreground mt-1">
              Last: {getTimeAgo(cronLastRun)}
            </div>}
        </div>

        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Activity className="h-3 w-3" />
            WebSocket (Real-time)
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-400' : wsStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            <span className="text-sm font-medium">
              {wsStatus === 'connected' ? 'Connected' : wsStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
            </span>
          </div>
          {lastUpdate && <div className="text-xs text-muted-foreground mt-1">
              Last: {getTimeAgo(new Date(lastUpdate).toISOString())}
            </div>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Zap className="h-3 w-3" />
            Active Strategies
          </div>
          <div className="text-2xl font-bold">{activeCount}</div>
        </div>

        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <PlayCircle className="h-3 w-3" />
            Recent Signals
          </div>
          <div className="text-2xl font-bold">{recentSignals.length}</div>
        </div>

        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Activity className="h-3 w-3" />
            Real-time Updates
          </div>
          <div className="text-sm font-medium">
            {wsStatus === 'connected' && lastUpdate ? getTimeAgo(new Date(lastUpdate).toISOString()) : 'N/A'}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3 w-3" />
            Auto Monitoring
          </div>
          <div className="text-sm font-medium">
            {cronLastRun ? getTimeAgo(cronLastRun) : "Never"}
          </div>
        </div>
      </div>

      {recentSignals.length > 0 && <div className="space-y-2 mb-4">
          <div className="text-xs font-medium text-muted-foreground">Recent Signals</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {recentSignals.slice(0, 5).map(signal => <div key={signal.id} className="flex items-center justify-between text-xs p-2 rounded bg-secondary/30">
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs px-1.5 py-0 ${
                    signal.signal_type?.toUpperCase() === "BUY" 
                      ? "bg-green-500 text-white hover:bg-green-600" 
                      : "bg-red-500 text-white hover:bg-red-600"
                  }`}>
                    {signal.signal_type?.toUpperCase()}
                  </Badge>
                  <span className="font-medium">{signal.symbol}</span>
                  <span className="text-muted-foreground">${signal.price}</span>
                  <span className="text-xs text-muted-foreground">• {signal.strategies?.name || 'Unknown'}</span>
                </div>
                <span className="text-muted-foreground">{getTimeAgo(signal.created_at)}</span>
              </div>)}
          </div>
        </div>}

        
      </Card>

      {/* Removed StrategyDebugPanel - using PerformanceDashboard instead */}
    </div>;
}