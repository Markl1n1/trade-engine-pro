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
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadStrategies();
    
    // Set default dates (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

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
              <Label className="text-xs text-muted-foreground">Initial Balance ($)</Label>
              <Input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="mt-1"
                min="0"
                step="100"
              />
            </div>

            <Button 
              className="w-full gap-2" 
              onClick={runBacktest}
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
