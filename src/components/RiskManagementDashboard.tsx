import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  riskPercent: number;
  partialCloses?: Array<{ price: number; size: number }>;
}

interface RiskMetrics {
  totalRiskPercent: number;
  dailyPnl: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  var95: number;
  expectedReturn: number;
  volatility: number;
}

export const RiskManagementDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<RiskMetrics>({
    totalRiskPercent: 0,
    dailyPnl: 0,
    maxDrawdown: 0,
    winRate: 0,
    profitFactor: 0,
    sharpeRatio: 0,
    var95: 0,
    expectedReturn: 0,
    volatility: 0,
  });

  const fetchRiskData = async () => {
    try {
      setLoading(true);
      const { data: reportData, error } = await supabase.functions.invoke("get-account-data");

      if (error) throw error;

      // Safe data extraction
      const report = reportData?.data?.report || reportData?.data || {};
      const positionsArray = Array.isArray(report.positions) ? report.positions : [];

      setPositions(positionsArray);
      setMetrics({
        totalRiskPercent: report.totalRiskPercent || 0,
        dailyPnl: report.dailyPnl || 0,
        maxDrawdown: report.maxDrawdown || 0,
        winRate: report.winRate || 0,
        profitFactor: report.profitFactor || 0,
        sharpeRatio: report.sharpeRatio || 0,
        var95: report.var95 || 0,
        expectedReturn: report.expectedReturn || 0,
        volatility: report.volatility || 0,
      });
    } catch (error) {
      console.error("Error fetching risk data:", error);
      toast.error("Failed to load risk management data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Risk Management</h1>
        <Button onClick={fetchRiskData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Risk Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalRiskPercent.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Portfolio exposure</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Daily P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.dailyPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${metrics.dailyPnl.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Today's profit/loss</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{metrics.maxDrawdown.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Peak to trough</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Successful trades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Sharpe Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.sharpeRatio.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Risk-adjusted return</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">VaR (95%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics.var95.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Value at risk</p>
          </CardContent>
        </Card>
      </div>

      {/* Current Positions */}
      <Card>
        <CardHeader>
          <CardTitle>Current Positions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading positions...</div>
          ) : positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No open positions</div>
          ) : (
            <div className="space-y-3">
              {positions.map((position, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{position.symbol}</span>
                      <Badge variant={position.side === "LONG" ? "default" : "destructive"}>
                        {position.side}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {position.pnl >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <span className={position.pnl >= 0 ? "text-green-500" : "text-red-500"}>
                        ${position.pnl.toFixed(2)} ({position.pnlPercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Size:</span>
                      <span className="ml-2 font-medium">{position.size}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Entry:</span>
                      <span className="ml-2 font-medium">${position.entryPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Current:</span>
                      <span className="ml-2 font-medium">${position.currentPrice.toFixed(2)}</span>
                    </div>
                  </div>
                  {position.riskPercent > 5 && (
                    <div className="flex items-center gap-2 text-orange-500 text-sm mt-2">
                      <AlertTriangle className="h-4 w-4" />
                      <span>High risk: {position.riskPercent.toFixed(1)}% of portfolio</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
