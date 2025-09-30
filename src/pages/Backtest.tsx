import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Play } from "lucide-react";

const Backtest = () => {
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
              <label className="text-xs text-muted-foreground">Strategy</label>
              <div className="mt-1 p-2 bg-secondary rounded text-sm">
                Select a strategy
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Time Period</label>
              <div className="mt-1 p-2 bg-secondary rounded text-sm">
                Last 30 days
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Initial Balance</label>
              <div className="mt-1 p-2 bg-secondary rounded text-sm">
                $1,000
              </div>
            </div>
            <Button className="w-full gap-2" disabled>
              <Play className="h-4 w-4" />
              Run Backtest
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6">
          <h3 className="text-lg font-bold mb-4">Results</h3>
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                Configure and run a backtest to see results
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Backtest Metrics (Preview)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Final Balance</p>
            <p className="text-xl font-bold mt-1">—</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Return</p>
            <p className="text-xl font-bold mt-1">—</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-xl font-bold mt-1">—</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Max Drawdown</p>
            <p className="text-xl font-bold mt-1">—</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Backtest;
