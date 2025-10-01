import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { IndicatorSelector } from "./IndicatorSelector";
import { StrategyTemplates } from "./StrategyTemplates";

type OrderType = "buy" | "sell";

interface Condition {
  order_type: OrderType;
  indicator_type: string;
  operator: string;
  value: number;
  value2?: number;
  period_1?: number;
  period_2?: number;
  indicator_type_2?: string;
  deviation?: number;
  smoothing?: number;
  multiplier?: number;
  acceleration?: number;
  logical_operator?: string;
}

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
  const [initialCapital, setInitialCapital] = useState(10000);
  const [positionSize, setPositionSize] = useState(100);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [buyConditions, setBuyConditions] = useState<Condition[]>([]);
  const [sellConditions, setSellConditions] = useState<Condition[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load strategy data when editing
  useEffect(() => {
    if (editStrategy && open) {
      loadStrategyData();
    } else if (!open) {
      resetForm();
    }
  }, [editStrategy, open]);

  const loadStrategyData = async () => {
    if (!editStrategy) return;
    
    setLoading(true);
    try {
      setName(editStrategy.name || "");
      setDescription(editStrategy.description || "");
      setSymbol(editStrategy.symbol || "BTCUSDT");
      setTimeframe(editStrategy.timeframe || "1h");
      setInitialCapital(editStrategy.initial_capital || 10000);
      setPositionSize(editStrategy.position_size_percent || 100);
      setStopLoss(editStrategy.stop_loss_percent || "");
      setTakeProfit(editStrategy.take_profit_percent || "");

      // Load conditions from database
      const { data: conditions, error } = await supabase
        .from("strategy_conditions")
        .select("*")
        .eq("strategy_id", editStrategy.id)
        .order("order_index");

      if (error) {
        console.error("Error loading conditions:", error);
        throw error;
      }

      if (conditions) {
        const buyConditionsData = conditions
          .filter(c => c.order_type === "buy")
          .map(c => ({
            order_type: c.order_type,
            indicator_type: c.indicator_type,
            operator: c.operator,
            value: c.value,
            value2: c.value2,
            period_1: c.period_1,
            period_2: c.period_2,
            indicator_type_2: c.indicator_type_2,
            deviation: c.deviation,
            smoothing: c.smoothing,
            multiplier: c.multiplier,
            acceleration: c.acceleration,
            logical_operator: c.logical_operator,
          }));

        const sellConditionsData = conditions
          .filter(c => c.order_type === "sell")
          .map(c => ({
            order_type: c.order_type,
            indicator_type: c.indicator_type,
            operator: c.operator,
            value: c.value,
            value2: c.value2,
            period_1: c.period_1,
            period_2: c.period_2,
            indicator_type_2: c.indicator_type_2,
            deviation: c.deviation,
            smoothing: c.smoothing,
            multiplier: c.multiplier,
            acceleration: c.acceleration,
            logical_operator: c.logical_operator,
          }));

        setBuyConditions(buyConditionsData);
        setSellConditions(sellConditionsData);
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: `Failed to load strategy: ${error.message}`, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  // Only show operators that are currently supported by the backtest function
  const operators = [
    { value: "greater_than", label: "Greater Than" },
    { value: "less_than", label: "Less Than" },
    { value: "equals", label: "Equals" },
    { value: "between", label: "Between" },
    { value: "crosses_above", label: "Crosses Above" },
    { value: "crosses_below", label: "Crosses Below" },
    { value: "breakout_above", label: "Breakout Above" },
    { value: "breakout_below", label: "Breakout Below" },
  ];

  const logicalOperators = [
    { value: "AND", label: "AND" },
    { value: "OR", label: "OR" },
  ];

  const timeframes = [
    { value: "1m", label: "1 Minute" },
    { value: "5m", label: "5 Minutes" },
    { value: "15m", label: "15 Minutes" },
    { value: "1h", label: "1 Hour" },
    { value: "4h", label: "4 Hours" },
    { value: "1d", label: "1 Day" },
  ];

  const addCondition = (type: OrderType) => {
    const newCondition: Condition = {
      order_type: type,
      indicator_type: "RSI",
      operator: "greater_than",
      value: 0,
      period_1: 14,
      logical_operator: "AND",
    };
    
    if (type === "buy") {
      setBuyConditions([...buyConditions, newCondition]);
    } else {
      setSellConditions([...sellConditions, newCondition]);
    }
  };

  const loadTemplate = (template: any) => {
    const templateData = template.template_data;
    setName(template.name);
    setSymbol(template.symbol || "BTCUSDT");
    setTimeframe(template.timeframe || "1h");
    setInitialCapital(template.initial_capital || 10000);
    setPositionSize(template.position_size_percent || 100);
    
    if (templateData.buy_conditions) {
      setBuyConditions(templateData.buy_conditions.map((c: any) => ({
        ...c,
        order_type: "buy",
      })));
    }
    
    if (templateData.sell_conditions) {
      setSellConditions(templateData.sell_conditions.map((c: any) => ({
        ...c,
        order_type: "sell",
      })));
    }
  };

  const removeCondition = (type: "buy" | "sell", index: number) => {
    if (type === "buy") {
      setBuyConditions(buyConditions.filter((_, i) => i !== index));
    } else {
      setSellConditions(sellConditions.filter((_, i) => i !== index));
    }
  };

  const updateCondition = (type: "buy" | "sell", index: number, field: keyof Condition, value: any) => {
    const conditions = type === "buy" ? buyConditions : sellConditions;
    const updater = type === "buy" ? setBuyConditions : setSellConditions;
    
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    updater(updated);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Strategy name is required", variant: "destructive" });
      return;
    }

    // Validate that at least one condition exists
    if (buyConditions.length === 0 && sellConditions.length === 0) {
      toast({ 
        title: "Conditions Required", 
        description: "Please add at least one buy or sell condition before saving. Strategies need conditions to run backtests.", 
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
        initial_capital: initialCapital,
        position_size_percent: positionSize,
        stop_loss_percent: stopLoss ? Number(stopLoss) : null,
        take_profit_percent: takeProfit ? Number(takeProfit) : null,
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

        // Delete existing conditions
        const { error: deleteError } = await supabase
          .from("strategy_conditions")
          .delete()
          .eq("strategy_id", strategyId);

        if (deleteError) throw deleteError;
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

      // Insert conditions
      const allConditions = [
        ...buyConditions.map((c, idx) => ({ 
          ...c, 
          strategy_id: strategyId, 
          order_index: idx,
          indicator_type: c.indicator_type as any,
          operator: c.operator as any,
          indicator_type_2: c.indicator_type_2 as any,
        })),
        ...sellConditions.map((c, idx) => ({ 
          ...c, 
          strategy_id: strategyId, 
          order_index: idx,
          indicator_type: c.indicator_type as any,
          operator: c.operator as any,
          indicator_type_2: c.indicator_type_2 as any,
        })),
      ];

      if (allConditions.length > 0) {
        const { error: conditionsError } = await supabase
          .from("strategy_conditions")
          .insert(allConditions);

        if (conditionsError) throw conditionsError;
      }

      toast({ 
        title: "Success", 
        description: editStrategy ? "Strategy updated successfully" : "Strategy created successfully" 
      });
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error("Strategy save error:", error);
      toast({ 
        title: "Error", 
        description: `Failed to save strategy: ${error.message}`, 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setSymbol("BTCUSDT");
    setTimeframe("1h");
    setInitialCapital(10000);
    setPositionSize(100);
    setStopLoss("");
    setTakeProfit("");
    setBuyConditions([]);
    setSellConditions([]);
  };

  // Helper functions for value field hints
  const getValuePlaceholder = (indicator?: string) => {
    if (!indicator) return "Enter value";
    const ind = indicator.toUpperCase();
    if (["RSI", "STOCHASTIC", "STOCH_RSI", "CCI", "WPR", "MFI"].includes(ind)) return "e.g., 70";
    if (ind === "MACD") return "e.g., 0";
    if (ind === "ATR") return "e.g., 1.5";
    return "Enter value";
  };

  const getValueHint = (indicator?: string) => {
    if (!indicator) return "Threshold value for comparison";
    const ind = indicator.toUpperCase();
    if (ind === "RSI") return "RSI ranges from 0-100. Common: 30 (oversold), 70 (overbought)";
    if (ind === "STOCHASTIC" || ind === "STOCH_RSI") return "Ranges from 0-100. Common: 20/80 levels";
    if (ind === "CCI") return "Typically ranges -200 to +200. Common: ±100";
    if (ind === "WPR") return "Ranges from -100 to 0. Common: -20/-80 levels";
    if (ind === "MFI") return "Ranges from 0-100. Similar to RSI";
    if (ind === "MACD") return "Compare to 0 for signal line crosses";
    if (ind === "ATR") return "Enter volatility threshold in price units";
    if (["SMA", "EMA", "WMA"].includes(ind)) return "Compare to price or another MA";
    return "Enter threshold in indicator's native units (not percentage)";
  };

  const renderConditions = (conditions: Condition[], type: "buy" | "sell") => {
    return conditions.map((condition, idx) => (
      <div key={idx} className="space-y-3 mb-4 p-4 border rounded-lg bg-muted/30">
        <div className="grid grid-cols-2 gap-4">
          <IndicatorSelector
            label="Indicator"
            value={condition.indicator_type}
            onChange={(val) => updateCondition(type, idx, "indicator_type", val)}
            period={condition.period_1}
            onPeriodChange={(val) => updateCondition(type, idx, "period_1", val)}
            deviation={condition.deviation}
            onDeviationChange={(val) => updateCondition(type, idx, "deviation", val)}
            smoothing={condition.smoothing}
            onSmoothingChange={(val) => updateCondition(type, idx, "smoothing", val)}
            multiplier={condition.multiplier}
            onMultiplierChange={(val) => updateCondition(type, idx, "multiplier", val)}
            acceleration={condition.acceleration}
            onAccelerationChange={(val) => updateCondition(type, idx, "acceleration", val)}
          />

          <div className="space-y-3">
            <div>
              <Label>Operator</Label>
              <Select
                value={condition.operator}
                onValueChange={(val) => updateCondition(type, idx, "operator", val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {condition.operator === "indicator_comparison" || 
             condition.operator === "crosses_above" || 
             condition.operator === "crosses_below" ? (
              <IndicatorSelector
                label="Compare To"
                value={condition.indicator_type_2 || "EMA"}
                onChange={(val) => updateCondition(type, idx, "indicator_type_2", val)}
                period={condition.period_2}
                onPeriodChange={(val) => updateCondition(type, idx, "period_2", val)}
              />
            ) : (
              <div>
                <Label>Value (in indicator's native units)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={condition.value}
                  onChange={(e) => updateCondition(type, idx, "value", Number(e.target.value))}
                  placeholder={getValuePlaceholder(condition.indicator_type)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {getValueHint(condition.indicator_type)}
                </p>
                {condition.operator === "between" && (
                  <div className="mt-2">
                    <Label>Upper Bound</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={condition.value2 || ""}
                      onChange={(e) => updateCondition(type, idx, "value2", Number(e.target.value))}
                      placeholder="Upper value"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {idx < conditions.length - 1 && (
            <Select
              value={condition.logical_operator || "AND"}
              onValueChange={(val) => updateCondition(type, idx, "logical_operator", val)}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {logicalOperators.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => removeCondition(type, idx)}
            className="ml-auto"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Remove
          </Button>
        </div>
      </div>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {editStrategy ? "Edit Trading Strategy" : "Create Trading Strategy"}
          </DialogTitle>
          <DialogDescription>
            {loading ? "Loading strategy data..." : "Use templates or build your strategy from scratch with 50+ technical indicators"}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Setup</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6 mt-4">
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

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeframe">Timeframe</Label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger id="timeframe">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeframes.map((tf) => (
                      <SelectItem key={tf.value} value={tf.value}>
                        {tf.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="capital">Initial Capital ($)</Label>
                <Input
                  id="capital"
                  type="number"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="position">Position Size (%)</Label>
                <Input
                  id="position"
                  type="number"
                  value={positionSize}
                  onChange={(e) => setPositionSize(Number(e.target.value))}
                  max={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stopLoss">Stop Loss (%)</Label>
                <Input
                  id="stopLoss"
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="takeProfit">Take Profit (%)</Label>
              <Input
                id="takeProfit"
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
                className="w-1/4"
              />
            </div>
          </TabsContent>

          <TabsContent value="conditions" className="space-y-6 mt-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-green-600">Buy Conditions</h3>
                <Button size="sm" onClick={() => addCondition("buy")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {renderConditions(buyConditions, "buy")}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-red-600">Sell Conditions</h3>
                <Button size="sm" onClick={() => addCondition("sell")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {renderConditions(sellConditions, "sell")}
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose from pre-built strategy templates to get started quickly
              </p>
              <StrategyTemplates onSelectTemplate={loadTemplate} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 justify-end border-t pt-4 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (editStrategy ? "Updating..." : "Creating...") : (editStrategy ? "Update Strategy" : "Create Strategy")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
