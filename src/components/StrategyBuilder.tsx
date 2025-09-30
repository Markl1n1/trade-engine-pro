import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type IndicatorType = "rsi" | "macd" | "sma" | "ema" | "bollinger_bands" | "stochastic" | "atr" | "adx";
type ConditionOperator = "greater_than" | "less_than" | "equals" | "crosses_above" | "crosses_below" | "between" | "indicator_comparison";
type OrderType = "buy" | "sell";

interface Condition {
  order_type: OrderType;
  indicator_type: IndicatorType;
  operator: ConditionOperator;
  value: number;
  value2?: number;
  period_1?: number;
  period_2?: number;
  indicator_type_2?: IndicatorType;
}

interface StrategyBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editStrategy?: any;
}

export const StrategyBuilder = ({ open, onOpenChange, onSuccess, editStrategy }: StrategyBuilderProps) => {
  const [name, setName] = useState(editStrategy?.name || "");
  const [description, setDescription] = useState(editStrategy?.description || "");
  const [symbol, setSymbol] = useState(editStrategy?.symbol || "BTCUSDT");
  const [timeframe, setTimeframe] = useState(editStrategy?.timeframe || "1h");
  const [initialCapital, setInitialCapital] = useState(editStrategy?.initial_capital || 10000);
  const [positionSize, setPositionSize] = useState(editStrategy?.position_size_percent || 100);
  const [stopLoss, setStopLoss] = useState(editStrategy?.stop_loss_percent || "");
  const [takeProfit, setTakeProfit] = useState(editStrategy?.take_profit_percent || "");
  const [buyConditions, setBuyConditions] = useState<Condition[]>([]);
  const [sellConditions, setSellConditions] = useState<Condition[]>([]);
  const [saving, setSaving] = useState(false);

  const indicators = [
    { value: "rsi", label: "RSI" },
    { value: "macd", label: "MACD" },
    { value: "sma", label: "SMA" },
    { value: "ema", label: "EMA" },
    { value: "bollinger_bands", label: "Bollinger Bands" },
  ];

  const operators = [
    { value: "greater_than", label: "Greater Than" },
    { value: "less_than", label: "Less Than" },
    { value: "equals", label: "Equals" },
    { value: "crosses_above", label: "Crosses Above" },
    { value: "crosses_below", label: "Crosses Below" },
    { value: "indicator_comparison", label: "Compare Indicators" },
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
      indicator_type: "rsi" as IndicatorType,
      operator: "greater_than" as ConditionOperator,
      value: 0,
      period_1: 14,
    };
    
    if (type === "buy") {
      setBuyConditions([...buyConditions, newCondition]);
    } else {
      setSellConditions([...sellConditions, newCondition]);
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

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const strategyData = {
        user_id: user.id,
        name,
        description,
        symbol,
        timeframe,
        initial_capital: initialCapital,
        position_size_percent: positionSize,
        stop_loss_percent: stopLoss || null,
        take_profit_percent: takeProfit || null,
      };

      const { data: strategy, error: strategyError } = await supabase
        .from("strategies")
        .insert([strategyData])
        .select()
        .single();

      if (strategyError) throw strategyError;

      const allConditions = [
        ...buyConditions.map((c, idx) => ({ ...c, strategy_id: strategy.id, order_index: idx })),
        ...sellConditions.map((c, idx) => ({ ...c, strategy_id: strategy.id, order_index: idx })),
      ];

      if (allConditions.length > 0) {
        const { error: conditionsError } = await supabase
          .from("strategy_conditions")
          .insert(allConditions);

        if (conditionsError) throw conditionsError;
      }

      toast({ title: "Success", description: "Strategy created successfully" });
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Trading Strategy</DialogTitle>
          <DialogDescription>
            Define your strategy parameters and trading conditions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="takeProfit">Take Profit (%)</Label>
              <Input
                id="takeProfit"
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-green-600">Buy Conditions</h3>
              <Button size="sm" onClick={() => addCondition("buy")}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            {buyConditions.map((condition, idx) => (
              <div key={idx} className="space-y-2 mb-4 p-3 border rounded">
                <div className="grid grid-cols-5 gap-2">
                  <Select
                    value={condition.indicator_type}
                    onValueChange={(val) => updateCondition("buy", idx, "indicator_type", val)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {indicators.map((ind) => (
                        <SelectItem key={ind.value} value={ind.value}>
                          {ind.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type="number"
                    value={condition.period_1 || ""}
                    onChange={(e) => updateCondition("buy", idx, "period_1", Number(e.target.value))}
                    placeholder="Period"
                  />

                  <Select
                    value={condition.operator}
                    onValueChange={(val) => updateCondition("buy", idx, "operator", val)}
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

                  {condition.operator === "indicator_comparison" ? (
                    <>
                      <Select
                        value={condition.indicator_type_2 || "ema"}
                        onValueChange={(val) => updateCondition("buy", idx, "indicator_type_2", val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Indicator 2" />
                        </SelectTrigger>
                        <SelectContent>
                          {indicators.map((ind) => (
                            <SelectItem key={ind.value} value={ind.value}>
                              {ind.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        value={condition.period_2 || ""}
                        onChange={(e) => updateCondition("buy", idx, "period_2", Number(e.target.value))}
                        placeholder="Period 2"
                      />
                    </>
                  ) : (
                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(e) => updateCondition("buy", idx, "value", Number(e.target.value))}
                      placeholder="Value"
                      className="col-span-2"
                    />
                  )}
                </div>
                
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => removeCondition("buy", idx)}
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            ))}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-red-600">Sell Conditions</h3>
              <Button size="sm" onClick={() => addCondition("sell")}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            {sellConditions.map((condition, idx) => (
              <div key={idx} className="space-y-2 mb-4 p-3 border rounded">
                <div className="grid grid-cols-5 gap-2">
                  <Select
                    value={condition.indicator_type}
                    onValueChange={(val) => updateCondition("sell", idx, "indicator_type", val)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {indicators.map((ind) => (
                        <SelectItem key={ind.value} value={ind.value}>
                          {ind.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type="number"
                    value={condition.period_1 || ""}
                    onChange={(e) => updateCondition("sell", idx, "period_1", Number(e.target.value))}
                    placeholder="Period"
                  />

                  <Select
                    value={condition.operator}
                    onValueChange={(val) => updateCondition("sell", idx, "operator", val)}
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

                  {condition.operator === "indicator_comparison" ? (
                    <>
                      <Select
                        value={condition.indicator_type_2 || "ema"}
                        onValueChange={(val) => updateCondition("sell", idx, "indicator_type_2", val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Indicator 2" />
                        </SelectTrigger>
                        <SelectContent>
                          {indicators.map((ind) => (
                            <SelectItem key={ind.value} value={ind.value}>
                              {ind.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        value={condition.period_2 || ""}
                        onChange={(e) => updateCondition("sell", idx, "period_2", Number(e.target.value))}
                        placeholder="Period 2"
                      />
                    </>
                  ) : (
                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(e) => updateCondition("sell", idx, "value", Number(e.target.value))}
                      placeholder="Value"
                      className="col-span-2"
                    />
                  )}
                </div>
                
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => removeCondition("sell", idx)}
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            ))}
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Create Strategy"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
