import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TickerData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
}

const Dashboard = () => {
  const [marketData, setMarketData] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('binance-ticker', {
          body: { symbols: ['BTCUSDT', 'ETHUSDT'] }
        });

        if (error) throw error;
        if (data?.success && data?.data) {
          setMarketData(data.data);
        }
      } catch (error) {
        console.error('Error fetching market data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 10000); // Update every 10s

    return () => clearInterval(interval);
  }, []);

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
        <h3 className="text-lg font-bold mb-4">Market Data (Live)</h3>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading market data...</div>
        ) : marketData.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {marketData.map((ticker) => (
              <div key={ticker.symbol} className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold">{ticker.symbol}</h4>
                  <span className={ticker.changePercent >= 0 ? "text-success" : "text-destructive"}>
                    {ticker.changePercent >= 0 ? "+" : ""}{ticker.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="text-2xl font-bold mb-1">
                  ${ticker.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-3">
                  <div>
                    <span className="block">24h High</span>
                    <span className="font-medium text-foreground">${ticker.high.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block">24h Low</span>
                    <span className="font-medium text-foreground">${ticker.low.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block">24h Volume</span>
                    <span className="font-medium text-foreground">{ticker.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="block">Quote Volume</span>
                    <span className="font-medium text-foreground">${(ticker.quoteVolume / 1000000).toFixed(2)}M</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Unable to load market data</p>
            <p className="text-xs text-muted-foreground mt-1">
              Check your internet connection
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
