// Performance Dashboard Component
// Real-time performance monitoring and optimization

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Cpu, 
  Database, 
  Memory, 
  Network, 
  Settings,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface PerformanceMetrics {
  optimizer: {
    executionTime: number;
    memoryUsage: number;
    cacheHits: number;
    cacheMisses: number;
    indicatorsCalculated: number;
    candlesProcessed: number;
  };
  monitor: {
    cpu: { usage: number; load: number };
    memory: { used: number; total: number; percentage: number };
    network: { requests: number; latency: number; errors: number };
    database: { connections: number; queries: number; slowQueries: number };
  };
  cache: {
    size: number;
    hitRate: number;
    memoryUsage: number;
  };
}

interface PerformanceAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  metrics: any;
}

interface PerformanceReport {
  status: 'healthy' | 'warning' | 'critical';
  metrics: any;
  alerts: PerformanceAlert[];
  recommendations: string[];
}

export const PerformanceDashboard = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Load performance data
  const loadPerformanceData = async () => {
    try {
      setLoading(true);
      
      // Get metrics
      const { data: metricsData, error: metricsError } = await supabase.functions.invoke('performance-dashboard', {
        body: { action: 'get_metrics' }
      });

      if (metricsError) throw metricsError;
      if (metricsData.success) {
        setMetrics(metricsData.data);
      }

      // Get alerts
      const { data: alertsData, error: alertsError } = await supabase.functions.invoke('performance-dashboard', {
        body: { action: 'get_alerts' }
      });

      if (alertsError) throw alertsError;
      if (alertsData.success) {
        setAlerts(alertsData.data.alerts);
      }

      // Get report
      const { data: reportData, error: reportError } = await supabase.functions.invoke('performance-dashboard', {
        body: { action: 'get_report' }
      });

      if (reportError) throw reportError;
      if (reportData.success) {
        setReport(reportData.data.report);
      }

    } catch (error) {
      console.error('Error loading performance data:', error);
      toast({
        title: "Error",
        description: "Failed to load performance data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Start monitoring
  const startMonitoring = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('performance-dashboard', {
        body: { action: 'start_monitoring' }
      });

      if (error) throw error;
      if (data.success) {
        setMonitoring(true);
        toast({
          title: "Success",
          description: "Performance monitoring started",
        });
      }
    } catch (error) {
      console.error('Error starting monitoring:', error);
      toast({
        title: "Error",
        description: "Failed to start monitoring",
        variant: "destructive",
      });
    }
  };

  // Stop monitoring
  const stopMonitoring = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('performance-dashboard', {
        body: { action: 'stop_monitoring' }
      });

      if (error) throw error;
      if (data.success) {
        setMonitoring(false);
        toast({
          title: "Success",
          description: "Performance monitoring stopped",
        });
      }
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      toast({
        title: "Error",
        description: "Failed to stop monitoring",
        variant: "destructive",
      });
    }
  };

  // Optimize system
  const optimizeSystem = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('performance-dashboard', {
        body: { action: 'optimize' }
      });

      if (error) throw error;
      if (data.success) {
        toast({
          title: "Success",
          description: "System optimization completed",
        });
        loadPerformanceData(); // Refresh data
      }
    } catch (error) {
      console.error('Error optimizing system:', error);
      toast({
        title: "Error",
        description: "Failed to optimize system",
        variant: "destructive",
      });
    }
  };

  // Auto refresh effect
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadPerformanceData, 5000); // 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Initial load
  useEffect(() => {
    loadPerformanceData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Performance Dashboard</h2>
          <p className="text-gray-600">Monitor system performance and optimize operations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={loadPerformanceData}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={optimizeSystem}
            variant="outline"
            size="sm"
          >
            <Zap className="h-4 w-4 mr-1" />
            Optimize
          </Button>
          <Button
            onClick={monitoring ? stopMonitoring : startMonitoring}
            variant={monitoring ? "destructive" : "default"}
            size="sm"
          >
            {monitoring ? "Stop Monitoring" : "Start Monitoring"}
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(report.status)}`} />
                <span className="font-medium capitalize">{report.status}</span>
              </div>
              <Badge variant="outline">
                {alerts.length} alerts
              </Badge>
              <Badge variant="outline">
                {metrics?.cache.size || 0} cache entries
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4">
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* CPU Metrics */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4" />
                    CPU Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Usage</span>
                      <span>{metrics.monitor.cpu.usage.toFixed(1)}%</span>
                    </div>
                    <Progress value={metrics.monitor.cpu.usage} className="h-2" />
                    <div className="flex justify-between text-sm">
                      <span>Load</span>
                      <span>{metrics.monitor.cpu.load.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Memory Metrics */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Memory className="h-4 w-4" />
                    Memory Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Usage</span>
                      <span>{metrics.monitor.memory.percentage.toFixed(1)}%</span>
                    </div>
                    <Progress value={metrics.monitor.memory.percentage} className="h-2" />
                    <div className="text-xs text-gray-500">
                      {(metrics.monitor.memory.used / 1024 / 1024 / 1024).toFixed(2)} GB / {(metrics.monitor.memory.total / 1024 / 1024 / 1024).toFixed(2)} GB
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Network Metrics */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Network className="h-4 w-4" />
                    Network
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Requests</span>
                      <span>{metrics.monitor.network.requests}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Latency</span>
                      <span>{metrics.monitor.network.latency.toFixed(1)}ms</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Errors</span>
                      <span className="text-red-500">{metrics.monitor.network.errors}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Database Metrics */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Database className="h-4 w-4" />
                    Database
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Connections</span>
                      <span>{metrics.monitor.database.connections}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Queries</span>
                      <span>{metrics.monitor.database.queries}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Slow Queries</span>
                      <span className="text-yellow-500">{metrics.monitor.database.slowQueries}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Optimizer Metrics */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4" />
                    Optimizer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Execution Time</span>
                      <span>{metrics.optimizer.executionTime.toFixed(0)}ms</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Indicators</span>
                      <span>{metrics.optimizer.indicatorsCalculated}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Candles</span>
                      <span>{metrics.optimizer.candlesProcessed}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cache Metrics */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Settings className="h-4 w-4" />
                    Cache
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Hit Rate</span>
                      <span>{(metrics.cache.hitRate * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={metrics.cache.hitRate * 100} className="h-2" />
                    <div className="flex justify-between text-sm">
                      <span>Size</span>
                      <span>{metrics.cache.size} entries</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="space-y-2">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No alerts at this time
              </div>
            ) : (
              alerts.map((alert) => (
                <Card key={alert.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-2">
                        {alert.severity === 'critical' ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-yellow-500" />
                        )}
                        <Badge className={getSeverityColor(alert.severity)}>
                          {alert.severity}
                        </Badge>
                      </div>
                      <div>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4">
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Cache Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Hit Rate</span>
                      <span className="font-medium">{(metrics.cache.hitRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cache Size</span>
                      <span className="font-medium">{metrics.cache.size} entries</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Memory Usage</span>
                      <span className="font-medium">{(metrics.cache.memoryUsage / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cache Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Cache Hits</span>
                      <span className="font-medium text-green-600">{metrics.optimizer.cacheHits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cache Misses</span>
                      <span className="font-medium text-red-600">{metrics.optimizer.cacheMisses}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Requests</span>
                      <span className="font-medium">{metrics.optimizer.cacheHits + metrics.optimizer.cacheMisses}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          {report && report.recommendations.length > 0 ? (
            <div className="space-y-2">
              {report.recommendations.map((recommendation, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Recommendation {index + 1}</p>
                      <p className="text-sm text-gray-600">{recommendation}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No recommendations at this time
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
