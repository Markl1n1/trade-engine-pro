import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Trade {
  id: string;
  symbol: string;
  signal_type: string;
  price: number;
  created_at: string;
  status: string;
}

interface PerformanceMetrics {
  totalPnl: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
}

export const PerformanceDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    totalPnl: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    profitFactor: 0,
  });

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);

      // Fetch recent trades
      const { data: tradesData, error: tradesError } = await supabase
        .from("strategy_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (tradesError) throw tradesError;

      // Fetch position events for P&L calculation
      const { data: positionsData, error: positionsError } = await supabase
        .from("position_events")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(100);

      if (positionsError) throw positionsError;

      setTrades(tradesData || []);

      // Calculate metrics from position events
      const exitEvents = (positionsData || []).filter((p) => p.event_type === "exit");
      const totalPnl = exitEvents.reduce((sum, p) => sum + (p.pnl_amount || 0), 0);
      const winningTrades = exitEvents.filter((p) => (p.pnl_amount || 0) > 0).length;
      const losingTrades = exitEvents.filter((p) => (p.pnl_amount || 0) < 0).length;
      const totalTrades = exitEvents.length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

      const wins = exitEvents.filter((p) => (p.pnl_amount || 0) > 0);
      const losses = exitEvents.filter((p) => (p.pnl_amount || 0) < 0);
      const avgWin = wins.length > 0 ? wins.reduce((sum, p) => sum + (p.pnl_amount || 0), 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((sum, p) => sum + (p.pnl_amount || 0), 0) / losses.length : 0;
      const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

      setMetrics({
        totalPnl,
        winRate,
        avgWin,
        avgLoss,
        totalTrades,
        winningTrades,
        losingTrades,
        profitFactor,
      });
    } catch (error) {
      console.error("Error fetching performance data:", error);
      toast.error("Failed to load performance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformanceData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Performance Analytics</h1>
        <Button onClick={fetchPerformanceData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Performance Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${metrics.totalPnl.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All-time profit/loss</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.winningTrades}W / {metrics.losingTrades}L
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Win/Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.avgWin.toFixed(2)} / ${Math.abs(metrics.avgLoss).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per trade average</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.profitFactor.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Gross profit / loss</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Signals</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading trades...</div>
          ) : trades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No trades yet</div>
          ) : (
            <div className="space-y-2">
              {trades.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div>
                      {trade.signal_type === "LONG" || trade.signal_type === "entry" ? (
                        <TrendingUp className="h-5 w-5 text-green-500" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold">{trade.symbol}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(trade.created_at), "MMM dd, yyyy HH:mm")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={trade.signal_type === "LONG" || trade.signal_type === "entry" ? "default" : "destructive"}>
                      {trade.signal_type}
                    </Badge>
                    <div className="text-right">
                      <div className="font-medium">${trade.price.toFixed(2)}</div>
                      <Badge variant={trade.status === "delivered" ? "default" : "secondary"} className="text-xs">
                        {trade.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
