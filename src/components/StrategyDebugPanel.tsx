import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Bug } from "lucide-react";
import { useState } from "react";

interface DebugLog {
  timestamp: number;
  strategy: string;
  type: 'condition' | 'indicator' | 'signal' | 'error';
  message: string;
  data?: any;
}

interface StrategyDebugPanelProps {
  logs: DebugLog[];
  connectionInfo?: any;
}

export function StrategyDebugPanel({ logs, connectionInfo }: StrategyDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'signal': return 'bg-green-500/10 text-green-500';
      case 'error': return 'bg-red-500/10 text-red-500';
      case 'indicator': return 'bg-blue-500/10 text-blue-500';
      case 'condition': return 'bg-yellow-500/10 text-yellow-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <Card className="overflow-hidden border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-accent/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Bug className="h-4 w-4 text-purple-500" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold">Debug Console</h3>
                <p className="text-xs text-muted-foreground">
                  Real-time strategy evaluation logs
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {logs.length} events
              </Badge>
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          {connectionInfo && (
            <div className="px-4 pb-2 space-y-2 border-b border-border/50">
              <div className="text-xs font-medium text-muted-foreground">Connection Info</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-secondary/30">
                  <div className="text-muted-foreground">Active Strategies</div>
                  <div className="font-bold">{connectionInfo.strategies || 0}</div>
                </div>
                <div className="p-2 rounded bg-secondary/30">
                  <div className="text-muted-foreground">Subscribed Streams</div>
                  <div className="font-bold">{connectionInfo.streams || 0}</div>
                </div>
              </div>
              {connectionInfo.strategyDetails && (
                <div className="space-y-1">
                  {connectionInfo.strategyDetails.map((s: any, i: number) => (
                    <div key={i} className="text-xs p-2 rounded bg-secondary/20">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground ml-2">
                        {s.symbol} {s.timeframe} 
                        {!s.hasEntry && <span className="text-red-500 ml-2">⚠️ No entry conditions</span>}
                        {!s.hasExit && <span className="text-red-500 ml-2">⚠️ No exit conditions</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <ScrollArea className="h-[400px]">
            <div className="p-4 space-y-2">
              {logs.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No debug logs yet. Waiting for candle data...
                </div>
              ) : (
                logs.map((log, i) => (
                  <div 
                    key={i}
                    className={`text-xs p-3 rounded-lg border ${getTypeColor(log.type)}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {log.type}
                        </Badge>
                        <span className="font-medium">{log.strategy}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                    <div className="text-xs leading-relaxed">{log.message}</div>
                    {log.data && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                          View details
                        </summary>
                        <pre className="mt-1 text-[10px] p-2 bg-black/20 rounded overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
