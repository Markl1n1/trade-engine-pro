import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Zap, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface StrategyFormulaBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface GeneratedStrategy {
  name: string;
  description: string;
  code: string;
  parameters: Record<string, any>;
  strategyType: string;
}

export const StrategyFormulaBuilder = ({ open, onOpenChange, onSuccess }: StrategyFormulaBuilderProps) => {
  const [formula, setFormula] = useState("");
  const [generatedStrategy, setGeneratedStrategy] = useState<GeneratedStrategy | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const generateStrategyFromFormula = async (formula: string): Promise<GeneratedStrategy> => {
    // This is where AI would analyze the formula and generate strategy code
    // For now, I'll create a template-based approach
    
    const formulaLower = formula.toLowerCase();
    
    // Detect strategy type based on formula keywords
    let strategyType = "custom";
    let name = "Custom Strategy";
    let description = "AI-generated strategy based on provided formula";
    let parameters: Record<string, any> = {};
    
    if (formulaLower.includes("sma") && formulaLower.includes("crossover")) {
      strategyType = "sma_crossover";
      name = "SMA Crossover Strategy";
      description = "Moving average crossover strategy with trend following logic";
      parameters = {
        sma_fast_period: 20,
        sma_slow_period: 200,
        rsi_period: 14,
        rsi_overbought: 70,
        rsi_oversold: 30,
        volume_multiplier: 1.2
      };
    } else if (formulaLower.includes("rsi") && formulaLower.includes("oversold")) {
      strategyType = "rsi_reversal";
      name = "RSI Reversal Strategy";
      description = "RSI-based mean reversion strategy";
      parameters = {
        rsi_period: 14,
        rsi_oversold: 30,
        rsi_overbought: 70,
        volume_multiplier: 1.0
      };
    } else if (formulaLower.includes("bollinger") && formulaLower.includes("band")) {
      strategyType = "bollinger_bands";
      name = "Bollinger Bands Strategy";
      description = "Bollinger Bands mean reversion strategy";
      parameters = {
        bb_period: 20,
        bb_std_dev: 2,
        rsi_period: 14,
        volume_multiplier: 1.0
      };
    }
    
    // Generate JavaScript code for the strategy
    const code = generateStrategyCode(strategyType, parameters, formula);
    
    return {
      name,
      description,
      code,
      parameters,
      strategyType
    };
  };

  const generateStrategyCode = (strategyType: string, parameters: Record<string, any>, formula: string): string => {
    const baseCode = `
// AI-Generated Strategy: ${formula}
// Generated on: ${new Date().toISOString()}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface StrategyConfig {
  ${Object.keys(parameters).map(key => `${key}: ${typeof parameters[key] === 'number' ? 'number' : 'string'};`).join('\n  ')}
}

interface StrategySignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  stop_loss?: number;
  take_profit?: number;
}

// Calculate SMA
function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// Calculate RSI
function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(50);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }
    }
  }
  
  return [50, ...result];
}

// Main strategy evaluation function
export function evaluateStrategy(
  candles: Candle[],
  config: StrategyConfig,
  positionOpen: boolean
): StrategySignal {
  console.log('[AI-STRATEGY] 🔍 Starting evaluation...');
  
  if (candles.length < 50) {
    return { signal_type: null, reason: 'Insufficient candle data' };
  }
  
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  // TODO: Implement strategy logic based on formula
  // This is where the AI-generated logic would go
  
  return { signal_type: null, reason: 'Strategy logic not implemented yet' };
}

// Default configuration
export const defaultConfig: StrategyConfig = {
  ${Object.entries(parameters).map(([key, value]) => `${key}: ${value}`).join(',\n  ')}
};
`;

    return baseCode;
  };

  const handleGenerate = async () => {
    if (!formula.trim()) {
      toast({ title: "Error", description: "Please enter a strategy formula", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const strategy = await generateStrategyFromFormula(formula);
      setGeneratedStrategy(strategy);
      toast({ title: "Success", description: "Strategy generated successfully!" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate strategy", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedStrategy) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-strategy', {
        body: {
          formula,
          name: generatedStrategy.name,
          description: generatedStrategy.description,
          symbol: "BTCUSDT",
          timeframe: "1h"
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({ 
          title: "Success", 
          description: `Strategy "${data.strategy.name}" created and implemented successfully!` 
        });
        onSuccess();
        onOpenChange(false);
      } else {
        throw new Error(data.error || 'Failed to generate strategy');
      }
    } catch (error: any) {
      console.error("Error saving strategy:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to save strategy", 
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
            <Code className="h-5 w-5 text-primary" />
            AI Strategy Generator
          </DialogTitle>
          <DialogDescription>
            Describe your trading strategy formula and I'll automatically generate and implement it
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="formula">Strategy Formula</Label>
            <Textarea
              id="formula"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="Describe your strategy formula, e.g.: 'Buy when SMA 20 crosses above SMA 200 and RSI is below 70, with volume confirmation'"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Be specific about indicators, conditions, and parameters. I'll generate the complete strategy code.
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={generating || !formula.trim()}>
              {generating ? "Generating..." : "Generate Strategy"}
            </Button>
            <Button variant="outline" onClick={() => setFormula("")}>
              Clear
            </Button>
          </div>

          {generatedStrategy && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Generated Strategy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium">{generatedStrategy.name}</h4>
                  <p className="text-sm text-muted-foreground">{generatedStrategy.description}</p>
                </div>

                <div>
                  <h5 className="font-medium mb-2">Parameters:</h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(generatedStrategy.parameters).map(([key, value]) => (
                      <Badge key={key} variant="secondary">
                        {key}: {value}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="font-medium mb-2">Generated Code Preview:</h5>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {generatedStrategy.code.substring(0, 500)}...
                  </pre>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save & Implement Strategy"}
                  </Button>
                  <Button variant="outline" onClick={() => setGeneratedStrategy(null)}>
                    Regenerate
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex gap-2 justify-end border-t pt-4 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
