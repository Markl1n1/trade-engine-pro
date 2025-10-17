// Risk Management Dashboard
// Advanced risk management interface with partial closing and adaptive stops

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Target,
  Settings,
  BarChart3,
  DollarSign,
  Percent,
  Activity,
  Zap,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface RiskConfig {
  maxRiskPerTrade: number;
  maxDailyRisk: number;
  maxDrawdown: number;
  positionSizing: {
    method: 'fixed' | 'kelly' | 'volatility' | 'atr';
    baseSize: number;
    maxSize: number;
    minSize: number;
  };
  partialClosing: {
    enabled: boolean;
    levels: Array<{
      profitPercent: number;
      closePercent: number;
    }>;
  };
  adaptiveStops: {
    enabled: boolean;
    atrMultiplier: number;
    volatilityAdjustment: boolean;
    trendAdjustment: boolean;
  };
}

interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;
  partialCloses?: Array<{
    level: number;
    closedSize: number;
    profit: number;
  }>;
  riskMetrics: {
    riskAmount: number;
    riskPercent: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
}

interface RiskMetrics {
  totalRisk: number;
  dailyPnL: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  var95: number;
  expectedReturn: number;
  volatility: number;
}

export const RiskManagementDashboard = () => {
  const [config, setConfig] = useState<RiskConfig>({
    maxRiskPerTrade: 2,
    maxDailyRisk: 10,
    maxDrawdown: 20,
    positionSizing: {
      method: 'fixed',
      baseSize: 1000,
      maxSize: 10000,
      minSize: 100
    },
    partialClosing: {
      enabled: true,
      levels: [
        { profitPercent: 25, closePercent: 25 },
        { profitPercent: 50, closePercent: 50 },
        { profitPercent: 75, closePercent: 75 }
      ]
    },
    adaptiveStops: {
      enabled: true,
      atrMultiplier: 2,
      volatilityAdjustment: true,
      trendAdjustment: true
    }
  });
  
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load risk management data
  const loadRiskData = async () => {
    try {
      setLoading(true);
      
      // Get risk report
      const { data: reportData, error: reportError } = await supabase.functions.invoke('risk-management', {
        body: { action: 'get_risk_report' }
      });

      if (reportError) throw reportError;
      if (reportData?.success) {
        // Extract report with safe fallback
        const report = reportData?.data?.report || reportData?.data || {};
        
        // Always set an array for positions
        const nextPositions = Array.isArray(report.positions) ? report.positions : [];
        setPositions(nextPositions);
        
        // Build a safe metrics object from report with defaults
        const nextMetrics: RiskMetrics = {
          totalRisk: typeof report.riskPercent === 'number' ? report.riskPercent : (typeof report.totalRisk === 'number' ? report.totalRisk : 0),
          dailyPnL: 0,
          maxDrawdown: Number(report.maxDrawdown ?? 0),
          winRate: 0,
          profitFactor: 0,
          sharpeRatio: Number(report.sharpeRatio ?? 0),
          var95: 0,
          expectedReturn: 0,
          volatility: 0
        };
        setMetrics(nextMetrics);
      }

    } catch (error) {
      console.error('Error loading risk data:', error);
      toast({
        title: "Error",
        description: "Failed to load risk management data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Save risk configuration
  const saveConfig = async () => {
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          risk_config: config
        });

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Risk configuration saved",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error",
        description: "Failed to save risk configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle partial closing
  const handlePartialClose = async (positionId: string, closePercent: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('risk-management', {
        body: {
          action: 'close_position_partial',
          positionId,
          closePercent
        }
      });

      if (error) throw error;
      if (data.success) {
        toast({
          title: "Success",
          description: `Closed ${closePercent}% of position`,
        });
        loadRiskData(); // Refresh data
      }
    } catch (error) {
      console.error('Error closing position partially:', error);
      toast({
        title: "Error",
        description: "Failed to close position partially",
        variant: "destructive",
      });
    }
  };

  // Update adaptive stops
  const updateAdaptiveStops = async (positionId: string, atr: number, trend: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('risk-management', {
        body: {
          action: 'update_adaptive_stops',
          positionId,
          atr,
          trend
        }
      });

      if (error) throw error;
      if (data.success) {
        toast({
          title: "Success",
          description: "Adaptive stops updated",
        });
        loadRiskData(); // Refresh data
      }
    } catch (error) {
      console.error('Error updating adaptive stops:', error);
      toast({
        title: "Error",
        description: "Failed to update adaptive stops",
        variant: "destructive",
      });
    }
  };

  // Initial load
  useEffect(() => {
    loadRiskData();
  }, []);

  const getRiskColor = (risk: number, maxRisk: number) => {
    const percentage = (risk / maxRisk) * 100;
    if (percentage > 80) return 'text-red-500';
    if (percentage > 60) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getPositionSideColor = (side: string) => {
    return side === 'LONG' ? 'text-green-500' : 'text-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Risk Management</h2>
          <p className="text-gray-600">Advanced risk management with partial closing and adaptive stops</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadRiskData} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={saveConfig} disabled={saving} size="sm">
            <Settings className="h-4 w-4 mr-1" />
            {saving ? 'Saving...' : 'Save Config'}
          </Button>
        </div>
      </div>

      {/* Risk Overview */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4" />
                Total Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Portfolio Risk</span>
                  <span className={`font-medium ${getRiskColor(metrics.totalRisk, config.maxDailyRisk)}`}>
                    {metrics.totalRisk.toFixed(2)}%
                  </span>
                </div>
                <Progress value={metrics.totalRisk} max={config.maxDailyRisk} className="h-2" />
                <div className="text-xs text-gray-500">
                  Limit: {config.maxDailyRisk}%
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4" />
                Daily P&L
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Today's P&L</span>
                  <span className={`font-medium ${metrics.dailyPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${metrics.dailyPnL.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Win Rate</span>
                  <span>{(metrics.winRate * 100).toFixed(1)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4" />
                Max Drawdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Current DD</span>
                  <span className={`font-medium ${getRiskColor(Math.abs(metrics.maxDrawdown), config.maxDrawdown)}`}>
                    {metrics.maxDrawdown.toFixed(2)}%
                  </span>
                </div>
                <Progress value={Math.abs(metrics.maxDrawdown)} max={config.maxDrawdown} className="h-2" />
                <div className="text-xs text-gray-500">
                  Limit: {config.maxDrawdown}%
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Sharpe Ratio</span>
                  <span className="font-medium">{metrics.sharpeRatio.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Profit Factor</span>
                  <span className="font-medium">{metrics.profitFactor.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>VaR 95%</span>
                  <span className="font-medium">{metrics.var95.toFixed(2)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="positions" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="partial-closing">Partial Closing</TabsTrigger>
          <TabsTrigger value="adaptive-stops">Adaptive Stops</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="space-y-4">
          <div className="space-y-4">
            {positions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No open positions
              </div>
            ) : (
              positions.map((position) => (
                <Card key={position.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{position.symbol}</span>
                          <Badge variant="outline" className={getPositionSideColor(position.side)}>
                            {position.side}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-500">
                          Size: {position.size.toFixed(2)} | Entry: ${position.entryPrice.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm">
                          <span className="text-gray-500">Current: </span>
                          <span className="font-medium">${position.currentPrice.toFixed(2)}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">SL: </span>
                          <span className="font-medium">${position.stopLoss.toFixed(2)}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">TP: </span>
                          <span className="font-medium">${position.takeProfit.toFixed(2)}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handlePartialClose(position.id, 25)}
                          size="sm"
                          variant="outline"
                        >
                          25%
                        </Button>
                        <Button
                          onClick={() => handlePartialClose(position.id, 50)}
                          size="sm"
                          variant="outline"
                        >
                          50%
                        </Button>
                        <Button
                          onClick={() => handlePartialClose(position.id, 75)}
                          size="sm"
                          variant="outline"
                        >
                          75%
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {(position.partialCloses?.length ?? 0) > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="text-sm font-medium mb-2">Partial Closes:</div>
                      <div className="space-y-1">
                        {(position.partialCloses || []).map((close, index) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span>Level {close.level}%: {close.closedSize.toFixed(2)}</span>
                            <span className="text-green-500">+${close.profit.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Risk Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Limits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="max-risk-per-trade">Max Risk Per Trade (%)</Label>
                  <Input
                    id="max-risk-per-trade"
                    type="number"
                    value={config.maxRiskPerTrade}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      maxRiskPerTrade: parseFloat(e.target.value)
                    }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="max-daily-risk">Max Daily Risk (%)</Label>
                  <Input
                    id="max-daily-risk"
                    type="number"
                    value={config.maxDailyRisk}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      maxDailyRisk: parseFloat(e.target.value)
                    }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="max-drawdown">Max Drawdown (%)</Label>
                  <Input
                    id="max-drawdown"
                    type="number"
                    value={config.maxDrawdown}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      maxDrawdown: parseFloat(e.target.value)
                    }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Position Sizing */}
            <Card>
              <CardHeader>
                <CardTitle>Position Sizing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="sizing-method">Method</Label>
                  <Select
                    value={config.positionSizing.method}
                    onValueChange={(value) => setConfig(prev => ({
                      ...prev,
                      positionSizing: {
                        ...prev.positionSizing,
                        method: value as any
                      }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="kelly">Kelly Criterion</SelectItem>
                      <SelectItem value="volatility">Volatility Based</SelectItem>
                      <SelectItem value="atr">ATR Based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="base-size">Base Size</Label>
                  <Input
                    id="base-size"
                    type="number"
                    value={config.positionSizing.baseSize}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      positionSizing: {
                        ...prev.positionSizing,
                        baseSize: parseFloat(e.target.value)
                      }
                    }))}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="min-size">Min Size</Label>
                    <Input
                      id="min-size"
                      type="number"
                      value={config.positionSizing.minSize}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        positionSizing: {
                          ...prev.positionSizing,
                          minSize: parseFloat(e.target.value)
                        }
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="max-size">Max Size</Label>
                    <Input
                      id="max-size"
                      type="number"
                      value={config.positionSizing.maxSize}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        positionSizing: {
                          ...prev.positionSizing,
                          maxSize: parseFloat(e.target.value)
                        }
                      }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="partial-closing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Partial Closing Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="partial-closing-enabled">Enable Partial Closing</Label>
                  <p className="text-sm text-gray-500">Automatically close portions of positions at profit levels</p>
                </div>
                <Switch
                  id="partial-closing-enabled"
                  checked={config.partialClosing.enabled}
                  onCheckedChange={(checked) => setConfig(prev => ({
                    ...prev,
                    partialClosing: {
                      ...prev.partialClosing,
                      enabled: checked
                    }
                  }))}
                />
              </div>
              
              {config.partialClosing.enabled && (
                <div className="space-y-4">
                  <div className="text-sm font-medium">Profit Levels:</div>
                  {config.partialClosing.levels.map((level, index) => (
                    <div key={index} className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label>Profit Level {index + 1}</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={level.profitPercent}
                            onChange={(e) => {
                              const newLevels = [...config.partialClosing.levels];
                              newLevels[index].profitPercent = parseFloat(e.target.value);
                              setConfig(prev => ({
                                ...prev,
                                partialClosing: {
                                  ...prev.partialClosing,
                                  levels: newLevels
                                }
                              }));
                            }}
                            placeholder="Profit %"
                          />
                          <Input
                            type="number"
                            value={level.closePercent}
                            onChange={(e) => {
                              const newLevels = [...config.partialClosing.levels];
                              newLevels[index].closePercent = parseFloat(e.target.value);
                              setConfig(prev => ({
                                ...prev,
                                partialClosing: {
                                  ...prev.partialClosing,
                                  levels: newLevels
                                }
                              }));
                            }}
                            placeholder="Close %"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adaptive-stops" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Adaptive Stop Loss Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="adaptive-stops-enabled">Enable Adaptive Stops</Label>
                  <p className="text-sm text-gray-500">Automatically adjust stop loss based on market conditions</p>
                </div>
                <Switch
                  id="adaptive-stops-enabled"
                  checked={config.adaptiveStops.enabled}
                  onCheckedChange={(checked) => setConfig(prev => ({
                    ...prev,
                    adaptiveStops: {
                      ...prev.adaptiveStops,
                      enabled: checked
                    }
                  }))}
                />
              </div>
              
              {config.adaptiveStops.enabled && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="atr-multiplier">ATR Multiplier</Label>
                    <Input
                      id="atr-multiplier"
                      type="number"
                      value={config.adaptiveStops.atrMultiplier}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        adaptiveStops: {
                          ...prev.adaptiveStops,
                          atrMultiplier: parseFloat(e.target.value)
                        }
                      }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="volatility-adjustment">Volatility Adjustment</Label>
                      <p className="text-sm text-gray-500">Adjust stops based on market volatility</p>
                    </div>
                    <Switch
                      id="volatility-adjustment"
                      checked={config.adaptiveStops.volatilityAdjustment}
                      onCheckedChange={(checked) => setConfig(prev => ({
                        ...prev,
                        adaptiveStops: {
                          ...prev.adaptiveStops,
                          volatilityAdjustment: checked
                        }
                      }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="trend-adjustment">Trend Adjustment</Label>
                      <p className="text-sm text-gray-500">Adjust stops based on market trend</p>
                    </div>
                    <Switch
                      id="trend-adjustment"
                      checked={config.adaptiveStops.trendAdjustment}
                      onCheckedChange={(checked) => setConfig(prev => ({
                        ...prev,
                        adaptiveStops: {
                          ...prev.adaptiveStops,
                          trendAdjustment: checked
                        }
                      }))}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
