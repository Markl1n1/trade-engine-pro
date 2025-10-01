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
