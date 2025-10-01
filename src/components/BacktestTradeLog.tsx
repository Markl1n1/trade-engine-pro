import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Trade {
  id: number;
  type: 'buy' | 'sell';
  entry_price: number;
  exit_price?: number;
  entry_time: string;
  exit_time?: string;
  profit?: number;
  profit_percent?: number;
  exit_reason?: 'take_profit' | 'stop_loss' | 'signal';
}

interface BacktestTradeLogProps {
  trades: Trade[];
}

export function BacktestTradeLog({ trades }: BacktestTradeLogProps) {
  if (!trades || trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No trades to display
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold mb-3">Trade Log ({trades.length} trades)</h4>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {trades.map((trade) => (
          <Card key={trade.id} className="p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={trade.type === 'buy' ? 'default' : 'secondary'}>
                    {trade.type.toUpperCase()}
                  </Badge>
                  {trade.profit !== undefined && (
                    <Badge variant={trade.profit >= 0 ? 'default' : 'destructive'}>
                      {trade.profit >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                      {trade.profit >= 0 ? '+' : ''}{trade.profit_percent?.toFixed(2)}%
                    </Badge>
                  )}
                  {trade.exit_reason && (
                    <Badge variant="outline" className="text-xs">
                      {trade.exit_reason === 'take_profit' ? 'TP' : 
                       trade.exit_reason === 'stop_loss' ? 'SL' : 'Signal'}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Entry:</span> ${trade.entry_price.toFixed(2)}
                  </div>
                  {trade.exit_price && (
                    <div>
                      <span className="text-muted-foreground">Exit:</span> ${trade.exit_price.toFixed(2)}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Entry Time:</span> {new Date(trade.entry_time).toLocaleString()}
                  </div>
                  {trade.exit_time && (
                    <div>
                      <span className="text-muted-foreground">Exit Time:</span> {new Date(trade.exit_time).toLocaleString()}
                    </div>
                  )}
                </div>
                {trade.profit !== undefined && (
                  <div className={`text-sm font-semibold mt-2 ${trade.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    P&L: {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
