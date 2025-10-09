import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StrategyTypeConfigProps {
  strategyType: string;
  sessionStart?: string;
  sessionEnd?: string;
  timezone?: string;
  riskRewardRatio?: number;
  onConfigChange: (key: string, value: any) => void;
}

export const StrategyTypeConfig = ({
  strategyType,
  sessionStart = "00:00",
  sessionEnd = "03:59",
  timezone = "America/New_York",
  riskRewardRatio = 2,
  onConfigChange,
}: StrategyTypeConfigProps) => {
  if (strategyType === "standard") {
    return null;
  }

  if (strategyType === "market_sentiment_trend_gauge") {
    return (
      <Card className="p-4 space-y-4 bg-secondary/30 border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold">Market Sentiment Trend Gauge Configuration</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <p className="text-xs">
                  MSTG combines four key components into a composite trend score (TS):
                </p>
                <ul className="text-xs mt-2 space-y-1">
                  <li>• <strong>Momentum (25%):</strong> RSI-based momentum indicator</li>
                  <li>• <strong>Trend (35%):</strong> EMA10 vs EMA21 relationship</li>
                  <li>• <strong>Volatility (20%):</strong> Position within Bollinger Bands</li>
                  <li>• <strong>Relative Strength (20%):</strong> Asset vs benchmark performance</li>
                </ul>
                <p className="text-xs mt-2">
                  Long when TS &gt; +30, Short when TS &lt; -30, Exit when TS crosses 0
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p><strong>Trading Logic:</strong></p>
          <p>• Long Entry: TS &gt; +30 (strong bullish sentiment)</p>
          <p>• Short Entry: TS &lt; -30 (strong bearish sentiment)</p>
          <p>• Exit Long: TS crosses below 0</p>
          <p>• Exit Short: TS crosses above 0</p>
          <p>• Extreme Zones: TS &gt; +60 or TS &lt; -60 (partial profit taking recommended)</p>
          <p className="mt-2"><strong>Note:</strong> MSTG uses pre-configured weights and thresholds. The benchmark symbol is set in the Basic Setup tab.</p>
        </div>
      </Card>
    );
  }

  if (strategyType === "ath_guard_scalping") {
    return (
      <Card className="p-4 space-y-4 bg-secondary/30 border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold">ATH Guard Mode - 1-Minute Scalping Configuration</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <p className="text-xs">
                  Professional 1-minute scalping system with multiple confirmations:
                </p>
                <ul className="text-xs mt-2 space-y-1">
                  <li>• <strong>Bias Filter:</strong> EMA50/100/150 alignment + slope</li>
                  <li>• <strong>Pullback:</strong> VWAP/EMA retest detection</li>
                  <li>• <strong>Momentum:</strong> MACD + Stochastic crossovers</li>
                  <li>• <strong>Volume:</strong> 1.8× average volume requirement</li>
                  <li>• <strong>Risk:</strong> ATR-based SL/TP (1.5×/1×/2×)</li>
                  <li>• <strong>Safety:</strong> ATH proximity detection</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t bg-info/5 p-3 rounded">
          <p className="font-semibold">⚠️ Important: Use 1-Minute Timeframe</p>
          <p>This strategy is optimized for 1-minute charts. Make sure to select "1 Minute" in Basic Settings.</p>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p><strong>Entry Logic (Long):</strong></p>
          <p>1. Price &gt; EMA150, EMA50 &gt; EMA100 &gt; EMA150, EMA150 slope &gt; +0.15%</p>
          <p>2. Price retraces to VWAP/EMA50 (within ±0.15%), then reclaims</p>
          <p>3. MACD line crosses above signal + histogram &gt; 0</p>
          <p>4. Stochastic %K crosses above %D from below 25</p>
          <p>5. Current volume ≥ 1.8× 20-bar average</p>
          
          <p className="mt-2"><strong>Exit Logic:</strong></p>
          <p>• SL: Entry - (1.5 × ATR14)</p>
          <p>• TP1: Entry + (1.0 × ATR14) - Exit 50%</p>
          <p>• TP2: Entry + (2.0 × ATR14) - Exit remaining 50%</p>
          <p>• Early exit if price closes below EMA50</p>
        </div>

        <div className="text-xs text-info bg-info/10 p-3 rounded mt-2">
          <p className="font-semibold">💡 Configuration Note:</p>
          <p>All parameters are pre-configured for optimal performance. Advanced users can adjust these in future versions.</p>
        </div>
      </Card>
    );
  }

  if (strategyType !== "4h_reentry") {
    return null;
  }

  return (
    <>
      <Card className="p-4 mb-4 bg-warning/10 border-warning">
        <div className="flex items-start gap-2">
          <Info className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-warning">Important: 5-Minute Timeframe Required</p>
            <p className="text-xs text-muted-foreground">
              The 4h Reentry strategy must use a <strong>5-minute timeframe</strong> to properly detect breakouts and re-entries within the NY session. 
              Make sure to select "5 Minutes" in the Basic Settings tab before running backtests.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4 bg-secondary/30 border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold">4h Reentry Configuration</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <p className="text-xs">
                  This strategy uses custom logic that identifies 4h range during NY session and enters on re-tests:
                </p>
                <ul className="text-xs mt-2 space-y-1">
                  <li>• <strong>Range Calculation:</strong> High/Low during session hours</li>
                  <li>• <strong>Entry:</strong> When price breaks range then re-enters</li>
                  <li>• <strong>SL:</strong> Previous candle high/low</li>
                  <li>• <strong>TP:</strong> Risk-Reward based (default 2R)</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Session Start (NY Time)</Label>
            <Input
              type="time"
              value={sessionStart}
              onChange={(e) => onConfigChange("sessionStart", e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Session End (NY Time)</Label>
            <Input
              type="time"
              value={sessionEnd}
              onChange={(e) => onConfigChange("sessionEnd", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Timezone</Label>
            <Input
              value={timezone}
              onChange={(e) => onConfigChange("timezone", e.target.value)}
              className="mt-1"
              placeholder="America/New_York"
            />
          </div>

          <div>
            <Label className="text-xs">Risk-Reward Ratio</Label>
            <Input
              type="number"
              step="0.1"
              min="0.5"
              max="10"
              value={riskRewardRatio}
              onChange={(e) => onConfigChange("riskRewardRatio", parseFloat(e.target.value))}
              className="mt-1"
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p><strong>Logic Summary:</strong></p>
          <p>• Range is calculated from {sessionStart} to {sessionEnd} {timezone}</p>
          <p>• Long Entry: Price breaks below range low, then closes above it</p>
          <p>• Short Entry: Price breaks above range high, then closes below it</p>
          <p>• Stop Loss: Previous candle high (short) or low (long)</p>
          <p>• Take Profit: {riskRewardRatio}x the risk distance</p>
        </div>
      </Card>
    </>
  );
};
