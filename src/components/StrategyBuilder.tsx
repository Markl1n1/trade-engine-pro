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
import { logStrategyCreate, logStrategyEdit } from "@/utils/auditLogger";

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
    // MTF Momentum config
    mtfRsiPeriod: 14,
    mtfRsiEntryThreshold: 55,
    mtfMacdFast: 12,
    mtfMacdSlow: 26,
    mtfMacdSignal: 9,
    mtfVolumeMultiplier: 1.2,
    // FVG Scalping config
    fvgKeyTimeStart: "09:30",
    fvgKeyTimeEnd: "09:35",
    fvgKeyTimeframe: "5m",
    fvgAnalysisTimeframe: "1m",
    fvgRiskRewardRatio: 3.0,
    fvgTickSize: 0.01,
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
        // MTF Momentum config
        mtfRsiPeriod: editStrategy.mtf_rsi_period || 14,
        mtfRsiEntryThreshold: editStrategy.mtf_rsi_entry_threshold || 55,
        mtfMacdFast: editStrategy.mtf_macd_fast || 12,
        mtfMacdSlow: editStrategy.mtf_macd_slow || 26,
        mtfMacdSignal: editStrategy.mtf_macd_signal || 9,
        mtfVolumeMultiplier: editStrategy.mtf_volume_multiplier || 1.2,
        // FVG Scalping config
        fvgKeyTimeStart: editStrategy.fvg_key_candle_time?.split('-')[0] || "09:30",
        fvgKeyTimeEnd: editStrategy.fvg_key_candle_time?.split('-')[1] || "09:35",
        fvgKeyTimeframe: editStrategy.fvg_key_timeframe || "5m",
        fvgAnalysisTimeframe: editStrategy.fvg_analysis_timeframe || "1m",
        fvgRiskRewardRatio: editStrategy.fvg_risk_reward_ratio || 3.0,
        fvgTickSize: editStrategy.fvg_tick_size || 0.01,
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
      mtfRsiPeriod: 14,
      mtfRsiEntryThreshold: 55,
      mtfMacdFast: 12,
      mtfMacdSlow: 26,
      mtfMacdSignal: 9,
      mtfVolumeMultiplier: 1.2,
      fvgKeyTimeStart: "09:30",
      fvgKeyTimeEnd: "09:35",
      fvgKeyTimeframe: "5m",
      fvgAnalysisTimeframe: "1m",
      fvgRiskRewardRatio: 3.0,
      fvgTickSize: 0.01,
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Strategy name is required", variant: "destructive" });
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
        // SMA Crossover configuration
        sma_fast_period: strategyType === "sma_crossover" ? strategyConfig.smaFastPeriod : null,
        sma_slow_period: strategyType === "sma_crossover" ? strategyConfig.smaSlowPeriod : null,
        rsi_period: strategyType === "sma_crossover" ? strategyConfig.rsiPeriod : null,
        rsi_overbought: strategyType === "sma_crossover" ? strategyConfig.rsiOverbought : null,
        rsi_oversold: strategyType === "sma_crossover" ? strategyConfig.rsiOversold : null,
        volume_multiplier: strategyType === "sma_crossover" ? strategyConfig.volumeMultiplier : null,
        // MTF Momentum configuration
        mtf_rsi_period: strategyType === "mtf_momentum" ? strategyConfig.mtfRsiPeriod : null,
        mtf_rsi_entry_threshold: strategyType === "mtf_momentum" ? strategyConfig.mtfRsiEntryThreshold : null,
        mtf_macd_fast: strategyType === "mtf_momentum" ? strategyConfig.mtfMacdFast : null,
        mtf_macd_slow: strategyType === "mtf_momentum" ? strategyConfig.mtfMacdSlow : null,
        mtf_macd_signal: strategyType === "mtf_momentum" ? strategyConfig.mtfMacdSignal : null,
        mtf_volume_multiplier: strategyType === "mtf_momentum" ? strategyConfig.mtfVolumeMultiplier : null,
        // FVG Scalping configuration
        fvg_key_candle_time: strategyType === "fvg_scalping" ? `${strategyConfig.fvgKeyTimeStart}-${strategyConfig.fvgKeyTimeEnd}` : null,
        fvg_key_timeframe: strategyType === "fvg_scalping" ? strategyConfig.fvgKeyTimeframe : null,
        fvg_analysis_timeframe: strategyType === "fvg_scalping" ? strategyConfig.fvgAnalysisTimeframe : null,
        fvg_risk_reward_ratio: strategyType === "fvg_scalping" ? strategyConfig.fvgRiskRewardRatio : null,
        fvg_tick_size: strategyType === "fvg_scalping" ? strategyConfig.fvgTickSize : null,
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
        
        // Log strategy edit
        await logStrategyEdit(editStrategy.id, editStrategy, strategyData);
      } else {
        // Create new strategy
        const { data: strategy, error: strategyError } = await supabase
          .from("strategies")
          .insert([{ ...strategyData, user_id: user.id }])
          .select()
          .single();

        if (strategyError) throw strategyError;
        strategyId = strategy.id;
        
        // Log strategy creation
        await logStrategyCreate({ 
          id: strategyId,
          name: strategyData.name,
          strategy_type: strategyData.strategy_type,
          symbol: strategyData.symbol,
          timeframe: strategyData.timeframe,
          initial_capital: strategyData.initial_capital,
          position_size_percent: strategyData.position_size_percent
        });
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
                <SelectItem value="sma_crossover">SMA 20/200 Crossover</SelectItem>
                <SelectItem value="mtf_momentum">MTF Momentum Strategy (Scalping)</SelectItem>
                <SelectItem value="4h_reentry">4h Reentry Breakout (Adapted for 1h/30m)</SelectItem>
                <SelectItem value="ath_guard_scalping">ATH Guard Mode - 1min Scalping</SelectItem>
                <SelectItem value="fvg_scalping">FVG Scalping (9:30-9:35 EST)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {strategyType === "sma_crossover"
                ? "Classic trend-following strategy using SMA 20/200 crossover with RSI filter and volume confirmation"
                : strategyType === "mtf_momentum"
                ? "Multi-timeframe momentum strategy optimized for scalping. Combines RSI, MACD signals across 1m-15m timeframes with volume confirmation"
                : strategyType === "4h_reentry"
                ? "Pre-configured strategy adapted for 1h/30m range re-entry trading with faster execution"
                : strategyType === "ath_guard_scalping"
                ? "Advanced 1-minute scalping system with EMA bias filter, VWAP pullbacks, MACD+Stochastic momentum triggers, volume validation, and ATR-based risk management"
                : strategyType === "fvg_scalping"
                ? "Fair Value Gap scalping strategy - trades FVG retests with 3:1 R:R during market open (9:30-9:35 AM EST). High risk/reward, limited time window."
                : ""}
            </p>
          </div>

          {strategyType === "sma_crossover" && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium">SMA 20/200 Crossover Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smaFastPeriod">SMA Fast Period</Label>
                  <Input
                    id="smaFastPeriod"
                    type="number"
                    value={strategyConfig.smaFastPeriod || 10}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, smaFastPeriod: parseInt(e.target.value) || 10 }))}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smaSlowPeriod">SMA Slow Period</Label>
                  <Input
                    id="smaSlowPeriod"
                    type="number"
                    value={strategyConfig.smaSlowPeriod || 50}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, smaSlowPeriod: parseInt(e.target.value) || 50 }))}
                    placeholder="50"
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
                    value={strategyConfig.rsiOverbought || 60}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, rsiOverbought: parseInt(e.target.value) || 60 }))}
                    placeholder="60"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rsiOversold">RSI Oversold</Label>
                  <Input
                    id="rsiOversold"
                    type="number"
                    value={strategyConfig.rsiOversold || 40}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, rsiOversold: parseInt(e.target.value) || 40 }))}
                    placeholder="40"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="volumeMultiplier">Volume Multiplier</Label>
                  <Input
                    id="volumeMultiplier"
                    type="number"
                    step="0.1"
                    value={strategyConfig.volumeMultiplier || 1.8}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, volumeMultiplier: parseFloat(e.target.value) || 1.8 }))}
                    placeholder="1.8"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Golden Cross: SMA Fast crosses above SMA Slow (with RSI &lt; 60 and volume confirmation)<br/>
                Death Cross: SMA Fast crosses below SMA Slow (with RSI &gt; 40 and volume confirmation)
              </p>
            </div>
          )}

          {strategyType === "mtf_momentum" && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium">MTF Momentum Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mtfRsiPeriod">RSI Period</Label>
                  <Input
                    id="mtfRsiPeriod"
                    type="number"
                    value={strategyConfig.mtfRsiPeriod || 14}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, mtfRsiPeriod: parseInt(e.target.value) || 14 }))}
                    placeholder="14"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mtfRsiEntryThreshold">RSI Entry Threshold</Label>
                  <Input
                    id="mtfRsiEntryThreshold"
                    type="number"
                    value={strategyConfig.mtfRsiEntryThreshold || 55}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, mtfRsiEntryThreshold: parseInt(e.target.value) || 55 }))}
                    placeholder="55"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mtfMacdFast">MACD Fast Period</Label>
                  <Input
                    id="mtfMacdFast"
                    type="number"
                    value={strategyConfig.mtfMacdFast || 12}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, mtfMacdFast: parseInt(e.target.value) || 12 }))}
                    placeholder="12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mtfMacdSlow">MACD Slow Period</Label>
                  <Input
                    id="mtfMacdSlow"
                    type="number"
                    value={strategyConfig.mtfMacdSlow || 26}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, mtfMacdSlow: parseInt(e.target.value) || 26 }))}
                    placeholder="26"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mtfMacdSignal">MACD Signal Period</Label>
                  <Input
                    id="mtfMacdSignal"
                    type="number"
                    value={strategyConfig.mtfMacdSignal || 9}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, mtfMacdSignal: parseInt(e.target.value) || 9 }))}
                    placeholder="9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mtfVolumeMultiplier">Volume Multiplier</Label>
                  <Input
                    id="mtfVolumeMultiplier"
                    type="number"
                    step="0.1"
                    value={strategyConfig.mtfVolumeMultiplier || 1.8}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, mtfVolumeMultiplier: parseFloat(e.target.value) || 1.8 }))}
                    placeholder="1.8"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Buy Signal: RSI crosses above entry threshold + MACD bullish crossover + volume confirmation<br/>
                Sell Signal: RSI crosses below entry threshold + MACD bearish crossover + volume confirmation
              </p>
            </div>
          )}

          {strategyType === "fvg_scalping" && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border-2 border-primary/20">
              <h4 className="font-medium flex items-center gap-2">
                FVG Scalping Configuration
                <span className="text-xs text-muted-foreground font-normal">(Fair Value Gap Strategy)</span>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Trading Window (EST)</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="time"
                      value={strategyConfig.fvgKeyTimeStart}
                      onChange={(e) => setStrategyConfig(prev => ({ ...prev, fvgKeyTimeStart: e.target.value }))}
                      className="flex-1"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={strategyConfig.fvgKeyTimeEnd}
                      onChange={(e) => setStrategyConfig(prev => ({ ...prev, fvgKeyTimeEnd: e.target.value }))}
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Default: 9:30-9:35 AM EST (market open volatility)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fvgKeyTimeframe">Key Levels Timeframe</Label>
                  <Select 
                    value={strategyConfig.fvgKeyTimeframe} 
                    onValueChange={(v) => setStrategyConfig(prev => ({ ...prev, fvgKeyTimeframe: v }))}
                  >
                    <SelectTrigger id="fvgKeyTimeframe">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1m">1 minute</SelectItem>
                      <SelectItem value="5m">5 minutes</SelectItem>
                      <SelectItem value="15m">15 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fvgAnalysisTimeframe">Analysis Timeframe</Label>
                  <Select 
                    value={strategyConfig.fvgAnalysisTimeframe} 
                    onValueChange={(v) => setStrategyConfig(prev => ({ ...prev, fvgAnalysisTimeframe: v }))}
                  >
                    <SelectTrigger id="fvgAnalysisTimeframe">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1m">1 minute</SelectItem>
                      <SelectItem value="5m">5 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fvgRiskRewardRatio">Risk/Reward Ratio</Label>
                  <Input
                    id="fvgRiskRewardRatio"
                    type="number"
                    step="0.1"
                    value={strategyConfig.fvgRiskRewardRatio}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, fvgRiskRewardRatio: parseFloat(e.target.value) || 3.0 }))}
                    placeholder="3.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fvgTickSize">Tick Size</Label>
                  <Input
                    id="fvgTickSize"
                    type="number"
                    step="0.01"
                    value={strategyConfig.fvgTickSize}
                    onChange={(e) => setStrategyConfig(prev => ({ ...prev, fvgTickSize: parseFloat(e.target.value) || 0.01 }))}
                    placeholder="0.01"
                  />
                </div>
              </div>
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-xs font-medium mb-1">⚠️ Strategy Risk Profile:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>✅ High R:R ratio (3:1)</li>
                  <li>✅ Clear entry/exit rules</li>
                  <li>❌ Limited trading window (5 min/day)</li>
                  <li>❌ High volatility at market open</li>
                  <li>❌ News-dependent</li>
                  <li>💰 Max 2% risk per trade recommended</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Strategy Logic:</strong> Detect Fair Value Gap (FVG) → Wait for retest → Confirm with engulfment → Enter with 3:1 R:R (SL: 1 tick beyond FVG)
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