import { useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

interface Trade {
  id?: number;
  type?: 'buy' | 'sell';
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
  const entry = normalizeTime(entryTime);
  const exit = normalizeTime(exitTime);
  
  if (!entry || !exit) return 'N/A';
  
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

const normalizeTime = (time: string | number | undefined | null): number | null => {
  if (!time) return null;
  
  if (typeof time === 'number') {
    // If timestamp < 1e12, it's in seconds, convert to milliseconds
    return time < 1e12 ? time * 1000 : time;
  }
  
  if (typeof time === 'string') {
    const parsed = new Date(time).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  
  return null;
};

const formatDateTime = (time: string | number): string => {
  const normalized = normalizeTime(time);
  if (!normalized) return 'N/A';
  
  const date = new Date(normalized);
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
};

const calculateProfitPercent = (
  entryPrice: number,
  exitPrice: number | undefined,
  type: 'buy' | 'sell' | undefined
): number | undefined => {
  if (!exitPrice || !entryPrice) return undefined;
  
  const typeNormalized = type || 'buy';
  if (typeNormalized === 'buy') {
    return ((exitPrice - entryPrice) / entryPrice) * 100;
  } else {
    return ((entryPrice - exitPrice) / entryPrice) * 100;
  }
};

interface BacktestTradeLogProps {
  trades: Trade[];
}

export function BacktestTradeLog({ trades }: BacktestTradeLogProps) {
  // Debug: log trades received
  useEffect(() => {
    console.log('[TRADE-LOG] Received trades:', trades?.length || 0);
    if (trades && trades.length > 0) {
      console.log('[TRADE-LOG] First trade:', trades[0]);
      console.log('[TRADE-LOG] Trade keys:', Object.keys(trades[0] || {}));
    }
  }, [trades]);

  // Normalize and filter trades
  const normalizedTrades = useMemo(() => {
    if (!trades || trades.length === 0) {
      console.log('[TRADE-LOG] No trades provided');
      return [];
    }
    
    console.log('[TRADE-LOG] Processing', trades.length, 'trades');
    
    const normalized = trades
      .filter(t => {
        const hasEntry = t && t.entry_time && t.entry_price !== undefined && t.entry_price !== null;
        if (!hasEntry) {
          console.warn('[TRADE-LOG] Filtered out trade (missing entry):', t);
        }
        return hasEntry;
      })
      .map(trade => {
        // Ensure type is present
        let type: 'buy' | 'sell' = 'buy';
        if (trade.type) {
          type = trade.type.toLowerCase() === 'sell' ? 'sell' : 'buy';
        }
        
        // Normalize times
        const entryTime = normalizeTime(trade.entry_time);
        const exitTime = trade.exit_time ? normalizeTime(trade.exit_time) : null;
        
        // Calculate profit_percent if missing
        let profitPercent = trade.profit_percent;
        if (profitPercent === undefined && trade.exit_price) {
          profitPercent = calculateProfitPercent(trade.entry_price, trade.exit_price, type);
        }
        
        return {
          ...trade,
          type,
          entry_time: entryTime || trade.entry_time,
          exit_time: exitTime || trade.exit_time,
          profit_percent: profitPercent
        };
      })
      .filter(t => {
        const isValid = t.entry_time !== null;
        if (!isValid) {
          console.warn('[TRADE-LOG] Filtered out trade (invalid entry_time):', t);
        }
        return isValid;
      });
    
    console.log('[TRADE-LOG] Normalized', normalized.length, 'trades from', trades.length, 'input');
    return normalized;
  }, [trades]);

  if (normalizedTrades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No trades to display
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h4 className="text-sm font-semibold mb-3">Trade Log ({normalizedTrades.length} trades)</h4>
      <div className="flex-1 space-y-2 overflow-y-auto pr-2">
        {normalizedTrades.map((trade, index) => {
          const profitPercent = trade.profit_percent ?? 
            (trade.exit_price ? calculateProfitPercent(trade.entry_price, trade.exit_price, trade.type) : undefined);
          
          // Format exit reason for display
          const formatExitReason = (reason: string | undefined): string => {
            if (!reason) return '';
            // Handle different exit reason formats
            if (reason.includes('Stop loss hit')) {
              const match = reason.match(/Stop loss hit: ([\d.-]+)%/);
              return match ? `Stop loss hit: ${match[1]}%` : 'Stop Loss';
            }
            if (reason.includes('Take profit hit')) {
              const match = reason.match(/Take profit hit: ([\d.-]+)%/);
              return match ? `Take profit hit: ${match[1]}%` : 'Take Profit';
            }
            if (reason.includes('TRAILING_STOP_TRIGGERED') || reason.includes('Trailing')) {
              return 'Trailing Stop';
            }
            if (reason.includes('Opposite crossover')) {
              return reason.split(',')[0]; // Get first part before comma
            }
            return reason;
          };
          
          return (
            <Card key={`trade-${index}-${trade.entry_time}`} className="p-4">
              {/* Header: Badges (Type, Profit/Loss, Duration) */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {trade.type && (
                  <Badge 
                    variant={trade.type === 'buy' ? 'default' : 'destructive'} 
                    className={trade.type === 'sell' ? 'bg-red-500 text-white' : ''}
                  >
                    {trade.type.toUpperCase()}
                  </Badge>
                )}
                {(trade.profit !== undefined || profitPercent !== undefined) && (
                  <Badge variant={(trade.profit ?? 0) >= 0 ? 'default' : 'destructive'}>
                    {(trade.profit ?? 0) >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {(trade.profit ?? 0) >= 0 ? '+' : ''}{profitPercent?.toFixed(2) ?? '0.00'}%
                  </Badge>
                )}
                {trade.exit_time && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatPositionDuration(trade.entry_time, trade.exit_time)}
                  </Badge>
                )}
              </div>

              {/* Row 2: Entry, Opened, Exit, Closed */}
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Entry</div>
                  <div className="text-sm font-semibold">${trade.entry_price.toFixed(2)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Opened</div>
                  <div className="text-sm font-medium">{formatDateTime(trade.entry_time)}</div>
                </div>
                {trade.exit_price ? (
                  <>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Exit</div>
                      <div className="text-sm font-semibold">${trade.exit_price.toFixed(2)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Closed</div>
                      {trade.exit_time && (
                        <div className="text-sm font-medium">{formatDateTime(trade.exit_time)}</div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Exit</div>
                      <div className="text-sm text-muted-foreground">-</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Closed</div>
                      <div className="text-sm text-muted-foreground">-</div>
                    </div>
                  </>
                )}
              </div>

              {/* Row 3: Exit Reason */}
              {trade.exit_reason && (
                <div className="mb-3">
                  <Badge 
                    variant="outline" 
                    className={`text-xs w-full justify-start ${
                      trade.exit_reason.includes('TAKE_PROFIT') || trade.exit_reason.includes('Take profit') ? 'border-green-500 text-green-600 dark:text-green-400' :
                      trade.exit_reason.includes('STOP_LOSS') || trade.exit_reason.includes('Stop loss') ? 'border-red-500 text-red-600 dark:text-red-400' :
                      trade.exit_reason.includes('TRAILING') || trade.exit_reason.includes('Trailing') ? 'border-blue-500 text-blue-600 dark:text-blue-400' :
                      'border-muted-foreground'
                    }`}
                  >
                    {formatExitReason(trade.exit_reason)}
                  </Badge>
                </div>
              )}

              {/* Footer: PnL */}
              {trade.profit !== undefined && (
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Profit/Loss:</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${trade.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                      </span>
                      {profitPercent !== undefined && (
                        <span className={`text-lg font-bold ${trade.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trade.profit >= 0 ? '+' : ''}{profitPercent.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
