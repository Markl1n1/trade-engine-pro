import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap, Edit, Trash2, Play, Pause, TrendingUp, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { StrategyBuilder } from "@/components/StrategyBuilder";
import { StrategyCloner } from "@/components/StrategyCloner";
import { MonitoringStatus } from "@/components/MonitoringStatus";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLiveMonitoring } from "@/hooks/useLiveMonitoring";

const Strategies = () => {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editStrategy, setEditStrategy] = useState<any>(null);
  const [liveMonitoringEnabled, setLiveMonitoringEnabled] = useState(false);
  const { isActive, lastCheck, inFlight } = useLiveMonitoring(liveMonitoringEnabled);

  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("strategies")
        .select(`
          *,
          strategy_conditions (*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStrategies(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const deleteStrategy = async (id: string) => {
    if (!confirm("Are you sure you want to delete this strategy?")) return;

    try {
      const { error } = await supabase.from("strategies").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Strategy deleted" });
      loadStrategies();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleStatus = async (strategy: any) => {
    const newStatus = strategy.status === "active" ? "paused" : "active";
    try {
      const { error } = await supabase
        .from("strategies")
        .update({ status: newStatus })
        .eq("id", strategy.id);

      if (error) throw error;
      toast({ title: "Success", description: `Strategy ${newStatus}` });
      loadStrategies();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500";
      case "paused": return "bg-yellow-500";
      case "draft": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading strategies...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Strategies</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage your trading strategies
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="live-monitoring"
                  checked={liveMonitoringEnabled}
                  onCheckedChange={setLiveMonitoringEnabled}
                />
                <Label htmlFor="live-monitoring" className="flex items-center gap-2 cursor-pointer">
                  {isActive && <Radio className="h-3 w-3 text-green-500 animate-pulse" />}
                  <span className="text-sm">Live ({isActive ? 'ON' : 'OFF'})</span>
                </Label>
              </div>
              {lastCheck && (
                <span className="text-xs text-muted-foreground">
                  {lastCheck.toLocaleTimeString()}
                </span>
              )}
              {inFlight && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  Checking...
                </span>
              )}
            </div>
          </Card>
          <Button className="gap-2" onClick={() => setBuilderOpen(true)}>
            <Plus className="h-4 w-4" />
            New Strategy
          </Button>
        </div>
      </div>

      <MonitoringStatus />

      {strategies.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Zap className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">No strategies yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Get started by creating your first trading strategy
            </p>
            <Button className="gap-2" onClick={() => setBuilderOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Strategy
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {strategies.map((strategy) => (
            <Card key={strategy.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold">{strategy.name}</h3>
                    <Badge className={getStatusColor(strategy.status)}>
                      {strategy.status}
                    </Badge>
                  </div>
                  
                  {strategy.description && (
                    <p className="text-sm text-muted-foreground">{strategy.description}</p>
                  )}

                  <div className="grid grid-cols-5 gap-4 mt-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Type</div>
                      <div className="font-medium capitalize">
                        {strategy.strategy_type === "4h_reentry" 
                          ? "4h Reentry" 
                          : strategy.strategy_type === "market_sentiment_trend_gauge"
                          ? "MSTG"
                          : strategy.strategy_type === "ath_guard_scalping"
                          ? "ATH Guard - 1min Scalping"
                          : strategy.strategy_type || "Standard"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Symbol</div>
                      <div className="font-medium">{strategy.symbol}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Timeframe</div>
                      <div className="font-medium">{strategy.timeframe}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Capital</div>
                      <div className="font-medium">${strategy.initial_capital}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">
                        {(strategy.strategy_type === "4h_reentry" || strategy.strategy_type === "market_sentiment_trend_gauge" || strategy.strategy_type === "ath_guard_scalping") ? "Logic" : "Conditions"}
                      </div>
                      <div className="font-medium">
                        {(strategy.strategy_type === "4h_reentry" || strategy.strategy_type === "market_sentiment_trend_gauge" || strategy.strategy_type === "ath_guard_scalping")
                          ? "Custom" 
                          : strategy.strategy_conditions?.length || 0}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleStatus(strategy)}
                  >
                    {strategy.status === "active" ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <StrategyCloner 
                    strategy={strategy} 
                    onCloneComplete={loadStrategies}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditStrategy(strategy);
                      setBuilderOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteStrategy(strategy.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-6 bg-secondary/50">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h3 className="text-sm font-bold mb-2">Strategy Features</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>✓ Multi-timeframe analysis with custom indicators</li>
              <li>✓ Visual condition builder with technical indicators</li>
              <li>✓ Position sizing & risk management rules</li>
              <li>✓ Real-time strategy execution (coming soon)</li>
              <li>✓ Performance tracking & optimization</li>
            </ul>
          </div>
        </div>
      </Card>

      <StrategyBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onSuccess={loadStrategies}
        editStrategy={editStrategy}
      />
    </div>
  );
};

export default Strategies;
