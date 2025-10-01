import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Play, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const Backtest = () => {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [initialBalance, setInitialBalance] = useState<string>("1000");
  const [stopLossPercent, setStopLossPercent] = useState<string>("3");
  const [takeProfitPercent, setTakeProfitPercent] = useState<string>("6");
  const [isStrategyDefaults, setIsStrategyDefaults] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{
    current: number;
    total: number;
    percentage: number;
  } | null>(null);
  const [dataStats, setDataStats] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadStrategies();
    checkDataAvailability();
    
    // Set default dates (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

  // Auto-populate backtest parameters from selected strategy
  useEffect(() => {
    if (selectedStrategy && strategies.length > 0) {
      const strategy = strategies.find(s => s.id === selectedStrategy);
      if (strategy && isStrategyDefaults) {
        setInitialBalance(String(strategy.initial_capital || 1000));
        setStopLossPercent(String(strategy.stop_loss_percent || 3));
        setTakeProfitPercent(String(strategy.take_profit_percent || 6));
      }
    }
  }, [selectedStrategy, strategies, isStrategyDefaults]);

  const loadStrategies = async () => {
    const { data, error } = await supabase
      .from('strategies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error loading strategies",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setStrategies(data || []);
  };

  const checkDataAvailability = async () => {
    const { data, error } = await supabase
      .from('market_data')
      .select('symbol, timeframe, open_time')
      .order('open_time', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking data availability:', error);
      return;
    }

    if (data && data.length > 0) {
      const { count } = await supabase
        .from('market_data')
        .select('*', { count: 'exact', head: true });
      
      setDataStats({
        available: true,
        totalRecords: count || 0,
        lastUpdate: new Date(data[0].open_time),
      });
    } else {
      setDataStats({ available: false, totalRecords: 0 });
    }
  };

  const loadHistoricalData = async (months: number = 1) => {
    if (!selectedStrategy) {
      toast({
        title: "Please select a strategy first",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingData(true);
    setLoadingProgress(null);
    
    try {
      const strategy = strategies.find(s => s.id === selectedStrategy);
      const endTimestamp = new Date().getTime();
      const startTimestamp = endTimestamp - (months * 30 * 24 * 60 * 60 * 1000);

      toast({
        title: "Loading historical data",
        description: `Fetching ${months} month(s) of ${strategy.symbol} data. This may take a moment...`,
      });

      const { data, error } = await supabase.functions.invoke('binance-market-data', {
        body: {
          symbol: strategy.symbol,
          interval: strategy.timeframe,
          startTime: startTimestamp,
          endTime: endTimestamp,
          batchMode: true
        }
      });

      if (error) throw error;

      const totalCandles = data.totalCandles || 0;
      const batches = data.batches || { total: 0, successful: 0, failed: 0 };

      if (batches.failed > 0) {
        toast({
          title: "Partial data load",
          description: `Loaded ${totalCandles.toLocaleString()} candles. ${batches.failed} batches failed.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Historical data loaded successfully",
          description: `Loaded ${totalCandles.toLocaleString()} candles for ${strategy.symbol} (${batches.successful} batches)`,
        });
      }

      await checkDataAvailability();
    } catch (error: any) {
      console.error('Error loading historical data:', error);
      toast({
        title: "Failed to load historical data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
      setLoadingProgress(null);
    }
  };

  const runBacktest = async () => {
    if (!selectedStrategy) {
      toast({
        title: "Please select a strategy",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('run-backtest', {
        body: {
          strategyId: selectedStrategy,
          startDate,
          endDate,
          initialBalance: parseFloat(initialBalance),
          stopLossPercent: parseFloat(stopLossPercent),
          takeProfitPercent: parseFloat(takeProfitPercent),
        },
      });

      if (error) throw error;

      if (data.success) {
        setResults(data.results);
        toast({
          title: "Backtest completed",
          description: `Processed ${data.results.total_trades} trades`,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Backtest failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const selectedStrategyData = strategies.find(s => s.id === selectedStrategy);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Backtest</h2>
        <p className="text-sm text-muted-foreground">
          Test your strategies against historical data
        </p>
      </div>

      {dataStats && !dataStats.available && (
        <Card className="p-4 bg-yellow-500/10 border-yellow-500/20">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-1">No Historical Data Available</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Load historical market data before running backtests. Select a strategy and date range below, then click "Load Historical Data".
              </p>
            </div>
          </div>
        </Card>
      )}

      {dataStats && dataStats.available && (
        <Card className="p-4 bg-green-500/10 border-green-500/20">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-1">Data Available</h4>
              <p className="text-xs text-muted-foreground">
                {dataStats.totalRecords.toLocaleString()} candles loaded. Last update: {dataStats.lastUpdate?.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 p-6">
          <h3 className="text-lg font-bold mb-4">Configuration</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Strategy</Label>
              <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a strategy" />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((strategy) => (
                    <SelectItem key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedStrategyData && (
              <div className="p-3 bg-secondary/50 rounded text-xs space-y-1">
                <p><span className="font-medium">Symbol:</span> {selectedStrategyData.symbol}</p>
                <p><span className="font-medium">Timeframe:</span> {selectedStrategyData.timeframe}</p>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-2">
                Initial Balance ($)
                {isStrategyDefaults && (
                  <span className="text-[10px] text-primary">(from strategy)</span>
                )}
              </Label>
              <Input
                type="number"
                value={initialBalance}
                onChange={(e) => {
                  setInitialBalance(e.target.value);
                  setIsStrategyDefaults(false);
                }}
                className="mt-1"
                min="0"
                step="100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  Stop Loss (%)
                  {isStrategyDefaults && (
                    <span className="text-[10px] text-primary">(from strategy)</span>
                  )}
                </Label>
                <Input
                  type="number"
                  value={stopLossPercent}
                  onChange={(e) => {
                    setStopLossPercent(e.target.value);
                    setIsStrategyDefaults(false);
                  }}
                  className="mt-1"
                  min="0.1"
                  max="100"
                  step="0.1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  Take Profit (%)
                  {isStrategyDefaults && (
                    <span className="text-[10px] text-primary">(from strategy)</span>
                  )}
                </Label>
                <Input
                  type="number"
                  value={takeProfitPercent}
                  onChange={(e) => {
                    setTakeProfitPercent(e.target.value);
                    setIsStrategyDefaults(false);
                  }}
                  className="mt-1"
                  min="0.1"
                  max="1000"
                  step="0.1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Load Historical Data</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={() => loadHistoricalData(1)}
                  disabled={!selectedStrategy || isLoadingData}
                  variant="outline"
                  size="sm"
                >
                  1 Month
                </Button>
                <Button
                  onClick={() => loadHistoricalData(3)}
                  disabled={!selectedStrategy || isLoadingData}
                  variant="outline"
                  size="sm"
                >
                  3 Months
                </Button>
                <Button
                  onClick={() => loadHistoricalData(6)}
                  disabled={!selectedStrategy || isLoadingData}
                  variant="outline"
                  size="sm"
                >
                  6 Months
                </Button>
              </div>
              {isLoadingData && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading historical data... This may take a few moments.</span>
                </div>
              )}
            </div>

            <Button 
              className="w-full gap-2" 
              onClick={runBacktest}
              disabled={isRunning || !selectedStrategy || !dataStats?.available}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Backtest
                </>
              )}
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6">
          <h3 className="text-lg font-bold mb-4">Results</h3>
          {results ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={results.trades.map((trade: any, idx: number) => ({
                  trade: idx + 1,
                  price: trade.exit_price || trade.entry_price,
                  profit: trade.profit || 0,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="trade" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" name="Price" />
                </LineChart>
              </ResponsiveContainer>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">Total Trades</p>
                  <p className="text-xl font-bold mt-1">{results.total_trades}</p>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className="text-xl font-bold mt-1">{results.win_rate.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Configure and run a backtest to see results
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Backtest Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Final Balance</p>
            <p className="text-xl font-bold mt-1">
              {results ? `$${results.final_balance.toFixed(2)}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Return</p>
            <p className={`text-xl font-bold mt-1 ${results && results.total_return >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {results ? `${results.total_return >= 0 ? '+' : ''}${results.total_return.toFixed(2)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-xl font-bold mt-1">
              {results ? `${results.win_rate.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Max Drawdown</p>
            <p className="text-xl font-bold mt-1 text-red-500">
              {results ? `${results.max_drawdown.toFixed(2)}%` : "—"}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Backtest;
