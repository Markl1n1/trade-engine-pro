import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Zap } from "lucide-react";

const Strategies = () => {
  const mockStrategies: any[] = [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Strategies</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage your trading strategies
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Strategy
        </Button>
      </div>

      {mockStrategies.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Zap className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">No strategies yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Get started by creating your first trading strategy
            </p>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Strategy
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {mockStrategies.map((strategy, idx) => (
            <Card key={idx} className="p-6">
              Strategy card here
            </Card>
          ))}
        </div>
      )}

      <Card className="p-6 bg-secondary/50">
        <h3 className="text-sm font-bold mb-2">Strategy Features (Coming Soon)</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Multi-timeframe analysis</li>
          <li>• 50+ technical indicators (RSI, MACD, Bollinger Bands, etc.)</li>
          <li>• Custom condition builder with visual editor</li>
          <li>• Position sizing & risk management rules</li>
          <li>• Backtest before going live</li>
        </ul>
      </Card>
    </div>
  );
};

export default Strategies;
