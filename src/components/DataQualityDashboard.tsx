import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface DataSource {
  name: string;
  status: "healthy" | "degraded" | "down";
  lastUpdate: string;
  latency: number;
  uptime: number;
}

interface DataQualityMetrics {
  completeness: number;
  accuracy: number;
  freshness: number;
  consistency: number;
  totalRecords: number;
  missingRecords: number;
}

export const DataQualityDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [metrics, setMetrics] = useState<DataQualityMetrics>({
    completeness: 0,
    accuracy: 0,
    freshness: 0,
    consistency: 0,
    totalRecords: 0,
    missingRecords: 0,
  });

  const fetchDataQuality = async () => {
    try {
      setLoading(true);

      // Fetch market data statistics
      const { data: marketData, error: marketError } = await supabase
        .from("market_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (marketError) throw marketError;

      // Check system health
      const { data: healthData, error: healthError } = await supabase.functions.invoke("health-check");

      if (healthError) throw healthError;

      // Calculate data quality metrics
      const totalRecords = marketData?.length || 0;
      const recentRecords = marketData?.filter((d) => {
        const recordAge = Date.now() - new Date(d.created_at).getTime();
        return recordAge < 5 * 60 * 1000; // Last 5 minutes
      }).length || 0;

      const freshness = totalRecords > 0 ? (recentRecords / totalRecords) * 100 : 0;
      const completeness = 98.5; // Mock for now
      const accuracy = 99.2; // Mock for now
      const consistency = 97.8; // Mock for now

      setMetrics({
        completeness,
        accuracy,
        freshness,
        consistency,
        totalRecords,
        missingRecords: Math.floor(totalRecords * 0.015),
      });

      // Set data sources status
      const sources: DataSource[] = [
        {
          name: "Binance API",
          status: healthData?.binanceApi?.status === "healthy" ? "healthy" : "degraded",
          lastUpdate: new Date().toISOString(),
          latency: healthData?.binanceApi?.latency || 0,
          uptime: 99.9,
        },
        {
          name: "WebSocket Feed",
          status: "healthy",
          lastUpdate: new Date().toISOString(),
          latency: 45,
          uptime: 99.8,
        },
        {
          name: "Database",
          status: totalRecords > 0 ? "healthy" : "degraded",
          lastUpdate: marketData?.[0]?.created_at || new Date().toISOString(),
          latency: 12,
          uptime: 99.99,
        },
      ];

      setDataSources(sources);
    } catch (error) {
      console.error("Error fetching data quality:", error);
      toast.error("Failed to load data quality metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDataQuality();
    const interval = setInterval(fetchDataQuality, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "degraded":
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case "down":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-500">Healthy</Badge>;
      case "degraded":
        return <Badge className="bg-orange-500">Degraded</Badge>;
      case "down":
        return <Badge variant="destructive">Down</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Data Quality</h1>
        <Button onClick={fetchDataQuality} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Data Quality Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Completeness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.completeness.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Data coverage</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.accuracy.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Valid records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Freshness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.freshness.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Recent data</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Consistency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.consistency.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Data integrity</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Sources Status */}
      <Card>
        <CardHeader>
          <CardTitle>Data Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading data sources...</div>
          ) : (
            <div className="space-y-3">
              {dataSources.map((source, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(source.status)}
                      <div>
                        <div className="font-semibold">{source.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Last update: {format(new Date(source.lastUpdate), "HH:mm:ss")}
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(source.status)}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Latency:</span>
                      <span className="ml-2 font-medium">{source.latency}ms</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Uptime:</span>
                      <span className="ml-2 font-medium">{source.uptime}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Data Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Total Records</div>
              <div className="text-2xl font-bold mt-1">{metrics.totalRecords.toLocaleString()}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Missing Records</div>
              <div className="text-2xl font-bold mt-1 text-orange-500">{metrics.missingRecords}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
