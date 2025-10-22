import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart3, Play, Loader2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { BacktestTradeLog } from "@/components/BacktestTradeLog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Backtest = () => {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [initialBalance, setInitialBalance] = useState<string>("1000");
  const [stopLossPercent, setStopLossPercent] = useState<string>("3");
  const [takeProfitPercent, setTakeProfitPercent] = useState<string>("6");
  const [trailingStopPercent, setTrailingStopPercent] = useState<string>("20");
  const [isStrategyDefaults, setIsStrategyDefaults] = useState(true);
  const [productType, setProductType] = useState<string>("spot");
  const [leverage, setLeverage] = useState<string>("1");
  const [makerFee, setMakerFee] = useState<string>("0.02");
  const [takerFee, setTakerFee] = useState<string>("0.04");
  const [slippage, setSlippage] = useState<string>("0.01");
  const [executionTiming, setExecutionTiming] = useState<string>("close");
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [dataStats, setDataStats] = useState<any>(null);
  const [backtestEngine, setBacktestEngine] = useState<string>("advanced");
  const [comparisonResults, setComparisonResults] = useState<any>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
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
        
        // Auto-set product type and leverage for 4h_reentry strategy
        if (strategy.strategy_type === '4h_reentry') {
          setProductType('futures');
          setLeverage('20');
        }
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
    // Optional informational card; no longer blocks running
    try {
      const { count } = await supabase.from('market_data').select('*', { count: 'exact', head: true });
      setDataStats({ available: (count || 0) > 0, totalRecords: count || 0 });
    } catch {
      setDataStats(null);
    }
  };

  // Historical data buttons removed; backtest will fetch as needed

  const runBacktest = async (engineOverride?: string) => {
    if (!selectedStrategy) {
      toast({
        title: "Please select a strategy",
        variant: "destructive",
      });
      return;
    }

    // Basic validation: strategy must have symbol and timeframe
    const strategy = strategies.find(s => s.id === selectedStrategy);
    if (!strategy?.symbol || !strategy?.timeframe) {
      toast({
        title: "Invalid strategy configuration",
        description: "Strategy must have Symbol and Timeframe set before backtesting.",
        variant: "destructive",
      });
      return;
    }

    const engine = engineOverride || backtestEngine;
    setIsRunning(true);
    setResults(null);

    try {
      const functionName = engine === 'simple' ? 'run-backtest-simple' : 'run-backtest';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          strategyId: selectedStrategy,
          startDate,
          endDate,
          initialBalance: parseFloat(initialBalance),
          stopLossPercent: parseFloat(stopLossPercent),
          takeProfitPercent: parseFloat(takeProfitPercent),
          trailingStopPercent: parseFloat(trailingStopPercent),
          productType,
          leverage: parseFloat(leverage),
          makerFee: parseFloat(makerFee),
          takerFee: parseFloat(takerFee),
          slippage: parseFloat(slippage),
          executionTiming: engine === 'advanced' ? executionTiming : undefined,
          debug: debugMode,
        },
      });

      if (error) throw error;

      if (data.success && data.results) {
        setResults(data.results);
        toast({
          title: `Backtest completed (${engine})`,
          description: `Processed ${data.results.total_trades || 0} trades`,
        });
        return data.results;
      } else {
        throw new Error(data.error || 'Backtest failed: Invalid response structure');
      }
    } catch (error: any) {
      toast({
        title: "Backtest failed",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsRunning(false);
    }
  };

  const runComparison = async () => {
    setIsComparing(true);
    setComparisonResults(null);

    try {
      toast({
        title: "Running comparison",
        description: "Testing both backtest engines...",
      });

      const [advancedResults, simpleResults] = await Promise.all([
        runBacktest('advanced'),
        runBacktest('simple'),
      ]);

      setComparisonResults({
        advanced: advancedResults,
        simple: simpleResults,
      });

      toast({
        title: "Comparison complete",
        description: "Both engines have completed",
      });
    } catch (error: any) {
      toast({
        title: "Comparison failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsComparing(false);
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
              <Label className="text-xs text-muted-foreground">Product Type</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spot">Spot Trading</SelectItem>
                  <SelectItem value="futures">Futures Trading</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {productType === 'futures' && (
              <div>
                <Label className="text-xs text-muted-foreground">Leverage</Label>
                <Input
                  type="number"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  min="1"
                  max="125"
                  step="1"
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">Backtest Engine</Label>
              <Select value={backtestEngine} onValueChange={setBacktestEngine}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="advanced">Advanced (Event-Based)</SelectItem>
                  <SelectItem value="simple">Simple (Vectorized)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                <strong>Advanced:</strong> Bar-by-bar simulation with full logic.
                <br />
                <strong>Simple:</strong> Fast vectorized calculations for comparison.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="debugMode"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="debugMode" className="text-xs text-muted-foreground">
                Debug Mode
              </Label>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Enable detailed logging for troubleshooting</p>
                </TooltipContent>
              </UITooltip>
            </div>

            {backtestEngine === 'advanced' && (
              <div>
                <Label className="text-xs text-muted-foreground">Execution Timing</Label>
                <Select value={executionTiming} onValueChange={setExecutionTiming}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Candle Open</SelectItem>
                    <SelectItem value="close">Candle Close</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  <strong>Open:</strong> Uses previous candle's indicators, executes at current candle's open price (more realistic).
                  <br />
                  <strong>Close:</strong> Uses previous candle's indicators, executes at current candle's close price.
                </p>
              </div>
            )}

            <div className="pt-2 border-t">
              <Label className="text-xs text-muted-foreground">Fees & Slippage</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <div>
                  <Input
                    type="number"
                    value={makerFee}
                    onChange={(e) => setMakerFee(e.target.value)}
                    step="0.01"
                    placeholder="Maker %"
                    className="text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">Maker</span>
                </div>
                <div>
                  <Input
                    type="number"
                    value={takerFee}
                    onChange={(e) => setTakerFee(e.target.value)}
                    step="0.01"
                    placeholder="Taker %"
                    className="text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">Taker</span>
                </div>
                <div>
                  <Input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    step="0.01"
                    placeholder="Slip %"
                    className="text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">Slippage</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                <strong>Maker:</strong> Fee for limit orders adding liquidity (default 0.02%).
                <br />
                <strong>Taker:</strong> Fee for market orders removing liquidity (default 0.04%).
                <br />
                <strong>Slippage:</strong> Price difference between expected and actual execution (default 0.01%).
              </p>
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

            <div className="grid grid-cols-3 gap-3">
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
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  Trailing Stop (%)
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">Trailing stop activates when profit reaches 50% of TP. Closes position if profit drops by this percentage from the maximum reached.</p>
                        <p className="text-xs mt-1">Example: TP=80%, Trailing=20% → Activates at 40% profit, closes if profit drops to 64% (80% - 20% = 64%)</p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  value={trailingStopPercent}
                  onChange={(e) => {
                    setTrailingStopPercent(e.target.value);
                    setIsStrategyDefaults(false);
                  }}
                  className="mt-1"
                  min="1"
                  max="50"
                  step="1"
                  placeholder="20"
                />
              </div>
            </div>

            {/* Historical data controls removed: data is fetched automatically during backtest */}

            <Button 
              className="w-full gap-2" 
              onClick={() => runBacktest()}
              disabled={isRunning || !selectedStrategy}
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
            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="trades">Trade Log</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-6">
              {/* Equity Curve */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Equity Curve</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={results.balance_history?.map((point: any) => ({
                    time: new Date(point.time).toLocaleDateString(),
                    balance: point.balance ? parseFloat(point.balance.toFixed(2)) : 0,
                  })) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="balance" stroke="hsl(var(--primary))" name="Balance ($)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Performance Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-secondary/50 rounded">
                  <div className="text-xs text-muted-foreground">Total Return</div>
                  <div className={`text-xl font-bold ${(results.total_return ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {(results.total_return ?? 0) >= 0 ? '+' : ''}{(results.total_return ?? 0).toFixed(2)}%
                  </div>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <div className="text-xs text-muted-foreground">Win Rate</div>
                  <div className="text-xl font-bold">{(results.win_rate ?? 0).toFixed(1)}%</div>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    Max Drawdown
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-xs">
                            Maximum percentage decline from the highest balance during the backtest.
                          </p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                  <div className="text-xl font-bold text-red-500">-{(results.max_drawdown ?? 0).toFixed(2)}%</div>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <div className="text-xs text-muted-foreground">Profit Factor</div>
                  <div className="text-xl font-bold">{(results.profit_factor ?? 0).toFixed(2)}</div>
                </div>
              </div>

              {/* Detailed Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="flex justify-between p-2 bg-secondary/30 rounded">
                  <span className="text-muted-foreground">Total Trades:</span>
                  <span className="font-semibold">{results.total_trades}</span>
                </div>
                <div className="flex justify-between p-2 bg-secondary/30 rounded">
                  <span className="text-muted-foreground">Winning:</span>
                  <span className="font-semibold text-green-500">{results.winning_trades}</span>
                </div>
                <div className="flex justify-between p-2 bg-secondary/30 rounded">
                  <span className="text-muted-foreground">Losing:</span>
                  <span className="font-semibold text-red-500">{results.losing_trades}</span>
                </div>
                <div className="flex justify-between p-2 bg-secondary/30 rounded">
                  <span className="text-muted-foreground">Avg Win:</span>
                  <span className="font-semibold text-green-500">${(results.avg_win ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between p-2 bg-secondary/30 rounded">
                  <span className="text-muted-foreground">Avg Loss:</span>
                  <span className="font-semibold text-red-500">-${(results.avg_loss ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between p-2 bg-secondary/30 rounded">
                  <span className="text-muted-foreground">Final Balance:</span>
                  <span className="font-semibold">${(results.final_balance ?? 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Configuration Used */}
              {results.config && (
                <div className="p-4 bg-secondary/20 rounded text-xs space-y-2">
                  <h4 className="font-semibold text-sm mb-2">Configuration Used</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <span className="text-muted-foreground">Type:</span> {results.config.product_type.toUpperCase()}
                    </div>
                    {results.config.product_type === 'futures' && (
                      <div>
                        <span className="text-muted-foreground">Leverage:</span> {results.config.leverage}x
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Execution:</span> {results.config.execution_timing}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fees:</span> {results.config.maker_fee}%/{results.config.taker_fee}%
                    </div>
                    <div>
                      <span className="text-muted-foreground">Slippage:</span> {results.config.slippage}%
                    </div>
                  </div>
                </div>
              )}

              {/* Backtest Logic Summary */}
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded text-xs space-y-2">
                <h4 className="font-semibold text-sm mb-2">Backtest Logic Summary</h4>
                <div className="space-y-1 text-muted-foreground">
                  <p><strong>Data Source:</strong> Historical market data from Binance ({selectedStrategyData?.symbol}, {selectedStrategyData?.timeframe} timeframe)</p>
                  <p><strong>Look-ahead Prevention:</strong> Decisions made using indicators calculated through previous candle (i-1)</p>
                  <p><strong>Execution:</strong> Trades executed at candle {executionTiming} with {slippage}% slippage</p>
                  <p><strong>Entry Rules:</strong> BUY conditions must be met on candle close</p>
                  <p><strong>Exit Rules:</strong> 
                    {stopLossPercent && ` Stop Loss at -${stopLossPercent}%`}
                    {takeProfitPercent && ` | Take Profit at +${takeProfitPercent}%`}
                    {` | SELL signal conditions`}
                  </p>
                  <p><strong>Intrabar Execution:</strong> SL/TP checked using candle high/low for realistic fills</p>
                  <p><strong>Position Sizing:</strong> {selectedStrategyData?.position_size_percent || 100}% of available balance per trade</p>
                  <p><strong>Fees Applied:</strong> Maker {makerFee}% / Taker {takerFee}% on each trade</p>
                </div>
              </div>
              </TabsContent>
              
              <TabsContent value="trades">
                <BacktestTradeLog trades={results.trades || []} />
              </TabsContent>
            </Tabs>
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
        <TooltipProvider>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Final Balance</p>
              <p className="text-xl font-bold mt-1">
                {results ? `$${(results.final_balance ?? 0).toFixed(2)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Return</p>
              <p className={`text-xl font-bold mt-1 ${results && (results.total_return ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {results ? `${(results.total_return ?? 0) >= 0 ? '+' : ''}${(results.total_return ?? 0).toFixed(2)}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-xl font-bold mt-1">
                {results ? `${(results.win_rate ?? 0).toFixed(1)}%` : "—"}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-muted-foreground">Max Drawdown</p>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs font-semibold mb-1">Maximum Drawdown</p>
                    <p className="text-xs">The largest percentage decline from a peak balance to a trough during the backtest period.</p>
                    <p className="text-xs mt-2">Formula: ((Peak Balance - Trough Balance) / Peak Balance) × 100</p>
                    <p className="text-xs mt-2">Example: If balance peaks at $1,200 then drops to $900, drawdown = 25%</p>
                    <p className="text-xs mt-2 font-semibold">Lower is better - indicates risk management quality.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <p className="text-xl font-bold mt-1 text-red-500">
                {results ? `${(results.max_drawdown ?? 0).toFixed(2)}%` : "—"}
              </p>
            </div>
          </div>
        </TooltipProvider>
        
        {results && (
          <div className="mt-6 p-4 bg-secondary/30 rounded-lg">
            <h4 className="font-semibold text-sm mb-3">Backtest Logic Summary</h4>
            <div className="text-xs space-y-2 text-muted-foreground">
              <p><strong>Data Source:</strong> Historical Binance data from market_data table</p>
              <p><strong>Entry:</strong> Buy when ALL buy conditions are met (indicators calculated from historical candles)</p>
              <p><strong>Exit:</strong> Sell when ANY of these occur:</p>
              <ul className="ml-4 space-y-1">
                <li>• Stop loss hit: Price drops {stopLossPercent}% from entry</li>
                <li>• Take profit hit: Price rises {takeProfitPercent}% from entry</li>
                <li>• Sell signal: ALL sell conditions are met</li>
              </ul>
              <p><strong>Position Sizing:</strong> ${((parseFloat(initialBalance || '0') * (selectedStrategyData?.position_size_percent || 100)) / 100).toFixed(2)} per trade</p>
              <p className="mt-2 pt-2 border-t border-border"><strong>Total Processed:</strong> {results.total_trades} trades from {startDate} to {endDate}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Backtest;
