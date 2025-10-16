// Data Quality Dashboard
// Comprehensive data quality monitoring and management

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Settings,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Shield,
  Clock,
  Target
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface DataQualityReport {
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  score: number;
  issues: DataIssue[];
  recommendations: string[];
  metrics: {
    completeness: number;
    accuracy: number;
    consistency: number;
    timeliness: number;
  };
}

interface DataIssue {
  type: 'missing' | 'duplicate' | 'outlier' | 'invalid' | 'gap' | 'delay';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  count: number;
  affectedData: any[];
  suggestions: string[];
}

interface QualityAlert {
  symbol: string;
  timeframe: string;
  score: number;
  issues: number;
  severity: 'warning' | 'critical';
}

interface DataQualityConfig {
  validation: {
    priceRange: { min: number; max: number };
    volumeRange: { min: number; max: number };
    timeRange: { maxGap: number; maxAge: number };
    outliers: { enabled: boolean; threshold: number };
  };
  cleaning: {
    removeDuplicates: boolean;
    fillGaps: boolean;
    smoothSpikes: boolean;
    normalizeVolume: boolean;
  };
  monitoring: {
    realTimeValidation: boolean;
    alertThresholds: {
      errorRate: number;
      dataGaps: number;
      outliers: number;
    };
  };
}

export const DataQualityDashboard = () => {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [alerts, setAlerts] = useState<QualityAlert[]>([]);
  const [config, setConfig] = useState<DataQualityConfig>({
    validation: {
      priceRange: { min: 0.01, max: 1000000 },
      volumeRange: { min: 0, max: 1000000000 },
      timeRange: { maxGap: 3600000, maxAge: 86400000 },
      outliers: { enabled: true, threshold: 3 }
    },
    cleaning: {
      removeDuplicates: true,
      fillGaps: true,
      smoothSpikes: false,
      normalizeVolume: false
    },
    monitoring: {
      realTimeValidation: true,
      alertThresholds: {
        errorRate: 0.05,
        dataGaps: 0.1,
        outliers: 0.02
      }
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1h');
  const [autoFix, setAutoFix] = useState(false);

  // Load data quality data
  const loadQualityData = async () => {
    try {
      setLoading(true);
      
      // Get quality report
      const { data: reportData, error: reportError } = await supabase.functions.invoke('data-quality', {
        body: { 
          action: 'get_quality_report',
          symbol: selectedSymbol || 'BTCUSDT',
          timeframe: selectedTimeframe
        }
      });

      if (reportError) throw reportError;
      if (reportData.success) {
        setReport(reportData.data.report);
      }

      // Get quality alerts
      const { data: alertsData, error: alertsError } = await supabase.functions.invoke('data-quality', {
        body: { action: 'monitor_quality' }
      });

      if (alertsError) throw alertsError;
      if (alertsData.success) {
        setAlerts(alertsData.data.qualityAlerts);
      }

    } catch (error) {
      console.error('Error loading quality data:', error);
      toast({
        title: "Error",
        description: "Failed to load data quality information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Validate data
  const validateData = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('data-quality', {
        body: { 
          action: 'validate_data',
          symbol: selectedSymbol || 'BTCUSDT',
          timeframe: selectedTimeframe
        }
      });

      if (error) throw error;
      if (data.success) {
        setReport(data.data.report);
        toast({
          title: "Success",
          description: "Data validation completed",
        });
      }
    } catch (error) {
      console.error('Error validating data:', error);
      toast({
        title: "Error",
        description: "Failed to validate data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Clean data
  const cleanData = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('data-quality', {
        body: { 
          action: 'clean_data',
          symbol: selectedSymbol || 'BTCUSDT',
          timeframe: selectedTimeframe
        }
      });

      if (error) throw error;
      if (data.success) {
        toast({
          title: "Success",
          description: `Data cleaned: ${data.data.removedCount} removed, ${data.data.filledCount} filled`,
        });
        loadQualityData(); // Refresh data
      }
    } catch (error) {
      console.error('Error cleaning data:', error);
      toast({
        title: "Error",
        description: "Failed to clean data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Fix issues
  const fixIssues = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('data-quality', {
        body: { 
          action: 'fix_issues',
          symbol: selectedSymbol || 'BTCUSDT',
          timeframe: selectedTimeframe,
          autoFix: autoFix
        }
      });

      if (error) throw error;
      if (data.success) {
        toast({
          title: "Success",
          description: `Issues fixed: ${data.data.cleanedCount} cleaned`,
        });
        loadQualityData(); // Refresh data
      }
    } catch (error) {
      console.error('Error fixing issues:', error);
      toast({
        title: "Error",
        description: "Failed to fix issues",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Save configuration
  const saveConfig = async () => {
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          data_quality_config: config
        });

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Data quality configuration saved",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadQualityData();
  }, [selectedSymbol, selectedTimeframe]);

  const getQualityColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 75) return 'text-blue-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getQualityIcon = (overall: string) => {
    switch (overall) {
      case 'excellent': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'good': return <CheckCircle className="h-5 w-5 text-blue-500" />;
      case 'fair': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'poor': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <Activity className="h-5 w-5 text-gray-500" />;
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
          <h2 className="text-2xl font-bold">Data Quality Dashboard</h2>
          <p className="text-gray-600">Monitor and improve data quality across all sources</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Symbol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BTCUSDT">BTCUSDT</SelectItem>
              <SelectItem value="ETHUSDT">ETHUSDT</SelectItem>
              <SelectItem value="ADAUSDT">ADAUSDT</SelectItem>
              <SelectItem value="SOLUSDT">SOLUSDT</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
            <SelectTrigger className="w-24">
              <SelectValue placeholder="TF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">1m</SelectItem>
              <SelectItem value="5m">5m</SelectItem>
              <SelectItem value="15m">15m</SelectItem>
              <SelectItem value="1h">1h</SelectItem>
              <SelectItem value="4h">4h</SelectItem>
              <SelectItem value="1d">1d</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={loadQualityData} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quality Overview */}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                {getQualityIcon(report.overall)}
                Overall Quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Score</span>
                  <span className={`font-medium ${getQualityColor(report.score)}`}>
                    {report.score.toFixed(1)}%
                  </span>
                </div>
                <Progress value={report.score} className="h-2" />
                <div className="text-xs text-gray-500 capitalize">
                  {report.overall} quality
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4" />
                Completeness
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Data Coverage</span>
                  <span className="font-medium">{report.metrics.completeness.toFixed(1)}%</span>
                </div>
                <Progress value={report.metrics.completeness} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4" />
                Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Data Accuracy</span>
                  <span className="font-medium">{report.metrics.accuracy.toFixed(1)}%</span>
                </div>
                <Progress value={report.metrics.accuracy} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                Timeliness
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Data Freshness</span>
                  <span className="font-medium">{report.metrics.timeliness.toFixed(1)}%</span>
                </div>
                <Progress value={report.metrics.timeliness} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quality Alerts */}
      {alerts.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription>
            <div className="font-medium text-yellow-800">
              {alerts.length} data quality alert{alerts.length > 1 ? 's' : ''} detected
            </div>
            <div className="text-sm text-yellow-700 mt-1">
              {alerts.map(alert => `${alert.symbol} ${alert.timeframe}: ${alert.score.toFixed(1)}%`).join(', ')}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {report && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Quality Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Completeness</span>
                      <span className="font-medium">{report.metrics.completeness.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Accuracy</span>
                      <span className="font-medium">{report.metrics.accuracy.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Consistency</span>
                      <span className="font-medium">{report.metrics.consistency.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Timeliness</span>
                      <span className="font-medium">{report.metrics.timeliness.toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {report.recommendations.length > 0 ? (
                      report.recommendations.map((recommendation, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <TrendingUp className="h-4 w-4 text-blue-500 mt-0.5" />
                          <span className="text-sm">{recommendation}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">No recommendations at this time</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          {report && report.issues.length > 0 ? (
            <div className="space-y-4">
              {report.issues.map((issue, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-2">
                        {issue.severity === 'critical' ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        )}
                        <Badge className={getSeverityColor(issue.severity)}>
                          {issue.severity}
                        </Badge>
                      </div>
                      <div>
                        <p className="font-medium">{issue.description}</p>
                        <p className="text-sm text-gray-500">
                          {issue.count} affected data point{issue.count > 1 ? 's' : ''}
                        </p>
                        {issue.suggestions.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">Suggestions:</p>
                            <ul className="text-sm text-gray-600 mt-1">
                              {issue.suggestions.map((suggestion, idx) => (
                                <li key={idx} className="flex items-start gap-1">
                                  <span className="text-gray-400">•</span>
                                  <span>{suggestion}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No issues detected
            </div>
          )}
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Validation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Validate data quality and identify issues
                </p>
                <Button onClick={validateData} disabled={loading} className="w-full">
                  <Shield className="h-4 w-4 mr-2" />
                  Validate Data
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data Cleaning</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Clean data by removing duplicates and filling gaps
                </p>
                <Button onClick={cleanData} disabled={loading} className="w-full">
                  <Database className="h-4 w-4 mr-2" />
                  Clean Data
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auto Fix Issues</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-fix"
                    checked={autoFix}
                    onCheckedChange={setAutoFix}
                  />
                  <Label htmlFor="auto-fix">Enable auto-fix</Label>
                </div>
                <Button onClick={fixIssues} disabled={loading} className="w-full">
                  <Zap className="h-4 w-4 mr-2" />
                  Fix Issues
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quality Monitoring</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Monitor data quality in real-time
                </p>
                <Button onClick={loadQualityData} disabled={loading} className="w-full">
                  <Activity className="h-4 w-4 mr-2" />
                  Monitor Quality
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Validation Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Validation Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="price-min">Price Range (Min)</Label>
                  <Input
                    id="price-min"
                    type="number"
                    value={config.validation.priceRange.min}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      validation: {
                        ...prev.validation,
                        priceRange: {
                          ...prev.validation.priceRange,
                          min: parseFloat(e.target.value)
                        }
                      }
                    }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="price-max">Price Range (Max)</Label>
                  <Input
                    id="price-max"
                    type="number"
                    value={config.validation.priceRange.max}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      validation: {
                        ...prev.validation,
                        priceRange: {
                          ...prev.validation.priceRange,
                          max: parseFloat(e.target.value)
                        }
                      }
                    }))}
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="outliers-enabled"
                    checked={config.validation.outliers.enabled}
                    onCheckedChange={(checked) => setConfig(prev => ({
                      ...prev,
                      validation: {
                        ...prev.validation,
                        outliers: {
                          ...prev.validation.outliers,
                          enabled: checked
                        }
                      }
                    }))}
                  />
                  <Label htmlFor="outliers-enabled">Enable outlier detection</Label>
                </div>
              </CardContent>
            </Card>

            {/* Cleaning Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Cleaning Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="remove-duplicates"
                    checked={config.cleaning.removeDuplicates}
                    onCheckedChange={(checked) => setConfig(prev => ({
                      ...prev,
                      cleaning: {
                        ...prev.cleaning,
                        removeDuplicates: checked
                      }
                    }))}
                  />
                  <Label htmlFor="remove-duplicates">Remove duplicates</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="fill-gaps"
                    checked={config.cleaning.fillGaps}
                    onCheckedChange={(checked) => setConfig(prev => ({
                      ...prev,
                      cleaning: {
                        ...prev.cleaning,
                        fillGaps: checked
                      }
                    }))}
                  />
                  <Label htmlFor="fill-gaps">Fill gaps</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="smooth-spikes"
                    checked={config.cleaning.smoothSpikes}
                    onCheckedChange={(checked) => setConfig(prev => ({
                      ...prev,
                      cleaning: {
                        ...prev.cleaning,
                        smoothSpikes: checked
                      }
                    }))}
                  />
                  <Label htmlFor="smooth-spikes">Smooth spikes</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="normalize-volume"
                    checked={config.cleaning.normalizeVolume}
                    onCheckedChange={(checked) => setConfig(prev => ({
                      ...prev,
                      cleaning: {
                        ...prev.cleaning,
                        normalizeVolume: checked
                      }
                    }))}
                  />
                  <Label htmlFor="normalize-volume">Normalize volume</Label>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving}>
              <Settings className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
