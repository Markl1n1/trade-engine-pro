import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

interface Trade {
  id: number;
  type: 'buy' | 'sell';
  entry_price: number;
  exit_price?: number;
  entry_time: string | number;
  exit_time?: string | number;
  profit?: number;
  profit_percent?: number;
  exit_reason?: string;
  quantity?: number;
}

const formatPositionDuration = (entryTime: string | number, exitTime: string | number): string => {
  const entry = typeof entryTime === 'string' ? new Date(entryTime).getTime() : entryTime;
  const exit = typeof exitTime === 'string' ? new Date(exitTime).getTime() : exitTime;
  const durationMs = exit - entry;
  
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${days}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
};

const formatDateTime = (time: string | number): string => {
  const date = typeof time === 'string' ? new Date(time) : new Date(time);
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
};

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
        {trades.map((trade, index) => (
          <Card key={`trade-${index}-${trade.entry_time}`} className="p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        trade.exit_reason === 'TAKE_PROFIT' ? 'border-green-500 text-green-600 dark:text-green-400' :
                        trade.exit_reason === 'STOP_LOSS' ? 'border-red-500 text-red-600 dark:text-red-400' :
                        trade.exit_reason === 'TRAILING_STOP_TRIGGERED' ? 'border-blue-500 text-blue-600 dark:text-blue-400' :
                        'border-muted-foreground'
                      }`}
                    >
                      {trade.exit_reason === 'TAKE_PROFIT' ? 'TP' : 
                       trade.exit_reason === 'STOP_LOSS' ? 'SL' :
                       trade.exit_reason === 'TRAILING_STOP_TRIGGERED' ? 'Trailing' :
                       trade.exit_reason}
                    </Badge>
                  )}
                  {trade.exit_time && (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatPositionDuration(trade.entry_time, trade.exit_time)}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Entry:</span> <span className="font-medium">${trade.entry_price.toFixed(2)}</span>
                  </div>
                  {trade.exit_price && (
                    <div>
                      <span className="text-muted-foreground">Exit:</span> <span className="font-medium">${trade.exit_price.toFixed(2)}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Opened:</span> <span className="font-medium">{formatDateTime(trade.entry_time)}</span>
                  </div>
                  {trade.exit_time && (
                    <div>
                      <span className="text-muted-foreground">Closed:</span> <span className="font-medium">{formatDateTime(trade.exit_time)}</span>
                    </div>
                  )}
                </div>
                {trade.profit !== undefined && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className={`text-sm font-semibold ${trade.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                    </div>
                    {trade.profit_percent !== undefined && (
                      <div className={`text-sm font-semibold text-right ${trade.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit_percent.toFixed(2)}%
                      </div>
                    )}
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
