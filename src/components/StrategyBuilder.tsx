import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface StrategyBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editStrategy?: any;
}

export const StrategyBuilder = ({ open, onOpenChange, onSuccess, editStrategy }: StrategyBuilderProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [strategyType, setStrategyType] = useState("sma_crossover");
  const [initialCapital, setInitialCapital] = useState(10000);
  const [positionSize, setPositionSize] = useState(100);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [benchmarkSymbol, setBenchmarkSymbol] = useState("BTCUSDT");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Strategy-specific configuration
  const [strategyConfig, setStrategyConfig] = useState({
    sessionStart: "00:00",
    sessionEnd: "03:59",
    timezone: "America/New_York",
    riskRewardRatio: 2,
    // SMA Crossover config
    smaFastPeriod: 20,
    smaSlowPeriod: 200,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    volumeMultiplier: 1.2,
  });

  // Load strategy data when editing
  useEffect(() => {
    if (editStrategy && open) {
      loadStrategyData();
    } else if (!open) {
      resetForm();
    }
  }, [editStrategy, open]);

  const loadStrategyData = async () => {
    if (editStrategy) {
      setName(editStrategy.name || "");
      setDescription(editStrategy.description || "");
      setSymbol(editStrategy.symbol || "BTCUSDT");
      setTimeframe(editStrategy.timeframe || "1h");
      setStrategyType(editStrategy.strategy_type || "sma_crossover");
      setInitialCapital(editStrategy.initial_capital || 10000);
      setPositionSize(editStrategy.position_size_percent || 100);
      setStopLoss(String(editStrategy.stop_loss_percent || ""));
      setTakeProfit(String(editStrategy.take_profit_percent || ""));
      setBenchmarkSymbol(editStrategy.benchmark_symbol || "BTCUSDT");
      
      // Load strategy-specific config
      setStrategyConfig({
        sessionStart: editStrategy.reentry_session_start || "00:00",
        sessionEnd: editStrategy.reentry_session_end || "03:59",
        timezone: editStrategy.timezone || "America/New_York",
        riskRewardRatio: editStrategy.reentry_risk_reward || 2,
        // SMA Crossover config
        smaFastPeriod: editStrategy.sma_fast_period || 20,
        smaSlowPeriod: editStrategy.sma_slow_period || 200,
        rsiPeriod: editStrategy.rsi_period || 14,
        rsiOverbought: editStrategy.rsi_overbought || 70,
        rsiOversold: editStrategy.rsi_oversold || 30,
        volumeMultiplier: editStrategy.volume_multiplier || 1.2,
      });
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setSymbol("BTCUSDT");
    setTimeframe("1h");
    setStrategyType("sma_crossover");
    setInitialCapital(10000);
    setPositionSize(100);
    setStopLoss("");
    setTakeProfit("");
    setBenchmarkSymbol("BTCUSDT");
    setStrategyConfig({
      sessionStart: "00:00",
      sessionEnd: "03:59",
      timezone: "America/New_York",
      riskRewardRatio: 2,
      smaFastPeriod: 20,
      smaSlowPeriod: 200,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
      volumeMultiplier: 1.2,
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Strategy name is required", variant: "destructive" });
      return;
    }

    // Validate benchmark symbol for MSTG
    if (strategyType === "market_sentiment_trend_gauge" && !benchmarkSymbol.trim()) {
      toast({ 
        title: "Benchmark Required", 
        description: "Market Sentiment strategy requires a benchmark symbol for relative strength calculation.", 
        variant: "destructive" 
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const strategyData = {
        name,
        description,
        symbol,
        timeframe,
        strategy_type: strategyType,
        initial_capital: initialCapital,
        position_size_percent: positionSize,
        stop_loss_percent: stopLoss ? Number(stopLoss) : null,
        take_profit_percent: takeProfit ? Number(takeProfit) : null,
        benchmark_symbol: strategyType === "market_sentiment_trend_gauge" ? benchmarkSymbol : null,
        // SMA Crossover configuration
        sma_fast_period: strategyType === "sma_crossover" ? strategyConfig.smaFastPeriod : null,
        sma_slow_period: strategyType === "sma_crossover" ? strategyConfig.smaSlowPeriod : null,
        rsi_period: strategyType === "sma_crossover" ? strategyConfig.rsiPeriod : null,
        rsi_overbought: strategyType === "sma_crossover" ? strategyConfig.rsiOverbought : null,
        rsi_oversold: strategyType === "sma_crossover" ? strategyConfig.rsiOversold : null,
        volume_multiplier: strategyType === "sma_crossover" ? strategyConfig.volumeMultiplier : null,
        updated_at: new Date().toISOString(),
      };

      let strategyId: string;

      if (editStrategy) {
        // Update existing strategy
        const { error: strategyError } = await supabase
          .from("strategies")
          .update(strategyData)
          .eq("id", editStrategy.id);

        if (strategyError) throw strategyError;
        strategyId = editStrategy.id;
      } else {
        // Create new strategy
        const { data: strategy, error: strategyError } = await supabase
          .from("strategies")
          .insert([{ ...strategyData, user_id: user.id }])
          .select()
          .single();

        if (strategyError) throw strategyError;
        strategyId = strategy.id;
      }

      toast({ 
        title: "Success", 
        description: editStrategy ? "Strategy updated successfully" : "Strategy created successfully" 
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving strategy:", error);
      toast({ 
        title: "Error", 
        description: "Failed to save strategy. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {editStrategy ? "Edit Trading Strategy" : "Create Trading Strategy"}
          </DialogTitle>
          <DialogDescription>
            {loading ? "Loading strategy data..." : "Create a new coded trading strategy with pre-configured logic"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Strategy Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Strategy"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="BTCUSDT"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeframe">Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger id="timeframe">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">1 Minute</SelectItem>
                  <SelectItem value="5m">5 Minutes</SelectItem>
                  <SelectItem value="15m">15 Minutes</SelectItem>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="4h">4 Hours</SelectItem>
                  <SelectItem value="1d">1 Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="initialCapital">Initial Capital</Label>
              <Input
                id="initialCapital"
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                placeholder="10000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="strategyType">Strategy Type</Label>
            <Select value={strategyType} onValueChange={setStrategyType}>
              <SelectTrigger id="strategyType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sma_crossover">SMA 20/200 Crossover with RSI Filter</SelectItem>
                <SelectItem value="4h_reentry">4h Reentry Breakout</SelectItem>
                <SelectItem value="market_sentiment_trend_gauge">Market Sentiment Trend Gauge</SelectItem>
                <SelectItem value="ath_guard_scalping">ATH Guard Mode - 1min Scalping</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {strategyType === "sma_crossover"
                ? "High win rate trend-following strategy using SMA 20/200 crossover with RSI filter and volume confirmation"
                : strategyType === "4h_reentry"
                ? "Pre-configured strategy with specialized logic for 4h range re-entry trading"
                : strategyType === "market_sentiment_trend_gauge"
                ? "Multi-factor composite score combining momentum, trend, volatility, and relative strength"
                : strategyType === "ath_guard_scalping"
                ? "Advanced 1-minute scalping system with EMA bias filter, VWAP pullbacks, MACD+Stochastic momentum triggers, volume validation, and ATR-based risk management"
                : ""}
            </p>
          </div>

          {strategyType === "sma_crossover" && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium">SMA Crossover Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smaFastPeriod">SMA Fast Period</Label>
                  <Input
                    id="smaFastPeriod"
                    type="number"
                    value={strategyConfig.smaFastPeriod || 20}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, smaFastPeriod: parseInt(e.target.value) || 20 }))}
                    placeholder="20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smaSlowPeriod">SMA Slow Period</Label>
                  <Input
                    id="smaSlowPeriod"
                    type="number"
                    value={strategyConfig.smaSlowPeriod || 200}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, smaSlowPeriod: parseInt(e.target.value) || 200 }))}
                    placeholder="200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rsiPeriod">RSI Period</Label>
                  <Input
                    id="rsiPeriod"
                    type="number"
                    value={strategyConfig.rsiPeriod || 14}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, rsiPeriod: parseInt(e.target.value) || 14 }))}
                    placeholder="14"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rsiOverbought">RSI Overbought</Label>
                  <Input
                    id="rsiOverbought"
                    type="number"
                    value={strategyConfig.rsiOverbought || 70}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, rsiOverbought: parseInt(e.target.value) || 70 }))}
                    placeholder="70"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rsiOversold">RSI Oversold</Label>
                  <Input
                    id="rsiOversold"
                    type="number"
                    value={strategyConfig.rsiOversold || 30}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, rsiOversold: parseInt(e.target.value) || 30 }))}
                    placeholder="30"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="volumeMultiplier">Volume Multiplier</Label>
                  <Input
                    id="volumeMultiplier"
                    type="number"
                    step="0.1"
                    value={strategyConfig.volumeMultiplier || 1.2}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, volumeMultiplier: parseFloat(e.target.value) || 1.2 }))}
                    placeholder="1.2"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Golden Cross: SMA Fast crosses above SMA Slow (with RSI &lt; 70 and volume confirmation)<br/>
                Death Cross: SMA Fast crosses below SMA Slow (with RSI &gt; 30 and volume confirmation)
              </p>
            </div>
          )}

          {strategyType === "market_sentiment_trend_gauge" && (
            <div className="space-y-2">
              <Label htmlFor="benchmarkSymbol">Benchmark Symbol</Label>
              <Input
                id="benchmarkSymbol"
                value={benchmarkSymbol}
                onChange={(e) => setBenchmarkSymbol(e.target.value)}
                placeholder="BTCUSDT"
              />
              <p className="text-xs text-muted-foreground">
                Symbol to compare against for relative strength calculation (e.g., BTCUSDT for crypto, SPY for stocks)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Strategy description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="positionSize">Position Size (%)</Label>
              <Input
                id="positionSize"
                type="number"
                value={positionSize}
                onChange={(e) => setPositionSize(Number(e.target.value))}
                placeholder="100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stopLoss">Stop Loss (%)</Label>
              <Input
                id="stopLoss"
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="takeProfit">Take Profit (%)</Label>
              <Input
                id="takeProfit"
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="10"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end border-t pt-4 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : editStrategy ? "Update Strategy" : "Create Strategy"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};