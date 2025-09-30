import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";

const Dashboard = () => {

  const mockStats = [
    { label: "Balance", value: "$1,000.00", change: "+0.00%", trend: "neutral" },
    { label: "Open Positions", value: "0", change: "—", trend: "neutral" },
    { label: "Win Rate", value: "—", change: "—", trend: "neutral" },
    { label: "Today's P&L", value: "$0.00", change: "—", trend: "neutral" },
  ];

  const mockPositions: any[] = [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Real-time overview of your trading activity
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockStats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
              {stat.trend === "up" && <ArrowUp className="h-4 w-4 text-success" />}
              {stat.trend === "down" && <ArrowDown className="h-4 w-4 text-destructive" />}
              {stat.trend === "neutral" && <TrendingUp className="h-4 w-4 text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground mt-2">{stat.change}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Open Positions</h3>
        {mockPositions.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No open positions</p>
            <p className="text-xs text-muted-foreground mt-1">
              Positions will appear here when strategies generate signals
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {mockPositions.map((position, idx) => (
              <div key={idx} className="p-3 bg-secondary rounded border border-border">
                Position data here
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Market Data</h3>
        <div className="text-center py-12">
          <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Waiting for Lovable Cloud to provision...</p>
          <p className="text-xs text-muted-foreground mt-1">
            Refresh the page in a moment to see live market data
          </p>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
