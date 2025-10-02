import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, PlayCircle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function MonitoringStatus() {
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [recentSignals, setRecentSignals] = useState<any[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    loadMonitoringStatus();
    const interval = setInterval(loadMonitoringStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadMonitoringStatus = async () => {
    try {
      // Get active strategies count
      const { data: strategies } = await supabase
        .from("strategies")
        .select("id")
        .eq("status", "active");
      
      setActiveCount(strategies?.length || 0);

      // Get recent signals (last 10)
      const { data: signals } = await supabase
        .from("strategy_signals")
        .select("*, strategies(name)")
        .order("created_at", { ascending: false })
        .limit(10);
      
      setRecentSignals(signals || []);

      // Try to get last monitoring run (requires admin role)
      const { data: settings } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "last_monitoring_run")
        .maybeSingle();

      if (settings) {
        setLastRun(settings.setting_value);
        setMonitoringEnabled(true);
      }
    } catch (error) {
      // Silently fail for non-admin users
      console.log("Monitoring status not accessible (admin only)");
    }
  };

  const runManualCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("monitor-strategies");
      
      if (error) throw error;
      
      toast({
        title: "Monitoring Complete",
        description: `Checked ${activeCount} active strategies. ${data.signals?.length || 0} signals generated.`,
      });
      
      await loadMonitoringStatus();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setChecking(false);
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

  return (
    <Card className="p-6 bg-card/50 backdrop-blur border-primary/10">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Strategy Monitoring</h3>
            <p className="text-xs text-muted-foreground">
              Automated checks every 5 minutes
            </p>
          </div>
        </div>
        <Badge variant={monitoringEnabled ? "default" : "secondary"} className="gap-1">
          <div className={`h-2 w-2 rounded-full ${monitoringEnabled ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />
          {monitoringEnabled ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
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
            <Clock className="h-3 w-3" />
            Last Check
          </div>
          <div className="text-sm font-medium">
            {lastRun ? getTimeAgo(lastRun) : "Never"}
          </div>
        </div>
      </div>

      {recentSignals.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="text-xs font-medium text-muted-foreground">Recent Signals</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {recentSignals.slice(0, 5).map((signal) => (
              <div key={signal.id} className="flex items-center justify-between text-xs p-2 rounded bg-secondary/30">
                <div className="flex items-center gap-2">
                  <Badge variant={signal.signal_type === "buy" ? "default" : "secondary"} className="text-xs px-1.5 py-0">
                    {signal.signal_type}
                  </Badge>
                  <span className="font-medium">{signal.symbol}</span>
                  <span className="text-muted-foreground">${signal.price}</span>
                </div>
                <span className="text-muted-foreground">{getTimeAgo(signal.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button 
        onClick={runManualCheck} 
        disabled={checking || activeCount === 0}
        className="w-full gap-2"
        size="sm"
        variant="outline"
      >
        <PlayCircle className="h-4 w-4" />
        {checking ? "Checking..." : "Run Manual Check"}
      </Button>
    </Card>
  );
}
