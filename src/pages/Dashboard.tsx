import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, TrendingUp, RefreshCw, Info, X, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AddMarketPairDialog } from "@/components/AddMarketPairDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
interface TickerData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
}
interface AccountData {
  totalWalletBalance: number;
  totalUnrealizedProfit: number;
  openPositionsCount: number;
  winRate: number;
  positions: Array<{
    symbol: string;
    positionAmt: number;
    entryPrice: number;
    unrealizedProfit: number;
    leverage: number;
    side: string;
  }>;
  environment: string;
  tradingMode: 'testnet_only' | 'hybrid_safe' | 'hybrid_live' | 'paper_trading' | 'mainnet_only';
  dataSource: 'mainnet' | 'testnet' | 'simulated';
  executionMode: 'real' | 'paper' | 'simulated';
  exchangeType: 'binance' | 'bybit';
}
interface StrategySignal {
  id: string;
  strategy_name: string;
  symbol: string;
  entry_price: number;
  entry_time: string;
  signal_type: string;
}
const Dashboard = () => {
  const [marketData, setMarketData] = useState<TickerData[]>([]);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [strategySignals, setStrategySignals] = useState<StrategySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [userPairs, setUserPairs] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [clearingSignals, setClearingSignals] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [signalsPerPage, setSignalsPerPage] = useState(10);
  const [tickerErrors, setTickerErrors] = useState<Array<{
    symbol: string;
    error: string;
  }>>([]);
  const [tradingMode, setTradingMode] = useState<string>('unknown');
  const [userSettings, setUserSettings] = useState<any>(null);
  const {
    toast
  } = useToast();
  useEffect(() => {
    loadUserPairs();
    loadUserSettings();
    fetchAccountData();
    fetchStrategySignals();
    loadSignalsPerPage();

    // Auto-refresh account data every 60 seconds
    const accountInterval = setInterval(fetchAccountData, 60000);
    return () => clearInterval(accountInterval);
  }, []);
  useEffect(() => {
    if (userPairs.length > 0) {
      fetchMarketData();
      const interval = setInterval(fetchMarketData, 10000);
      return () => clearInterval(interval);
    }
  }, [userPairs]);
  const loadSignalsPerPage = () => {
    const saved = localStorage.getItem('signalsPerPage');
    if (saved) {
      setSignalsPerPage(parseInt(saved));
    }
  };
  const loadUserPairs = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("user_trading_pairs").select("symbol");
      if (error) throw error;
      const symbols = data?.map(p => p.symbol) || ['BTCUSDT', 'ETHUSDT'];
      setUserPairs(symbols);
    } catch (error) {
      console.error('Error loading pairs:', error);
      setUserPairs(['BTCUSDT', 'ETHUSDT']);
    }
  };
  const loadUserSettings = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("user_settings").select("*").single();
      if (error) throw error;
      setUserSettings(data);
      // Only set trading mode if not already set from account data
      if (tradingMode === 'unknown') {
        setTradingMode(data?.trading_mode || 'mainnet_only');
      }
    } catch (error) {
      console.error('Error loading user settings:', error);
      if (tradingMode === 'unknown') {
        setTradingMode('mainnet_only');
      }
    }
  };
  const fetchAccountData = async () => {
    setLoadingAccount(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('get-account-data');
      if (error) throw error;
      if (data?.success && data?.data) {
        setAccountData(data.data);
        // Update trading mode from account data
        if (data.data.tradingMode) {
          setTradingMode(data.data.tradingMode);
        }
        setLastUpdated(new Date());
      } else if (data?.error) {
        // Handle specific errors gracefully
        console.warn('Account data fetch warning:', data.error);
        // Don't throw - just log and continue with empty data
      }
    } catch (error: any) {
      console.error('Error fetching account data:', error);
      // Show user-friendly error only for severe issues
      // Credential errors are handled gracefully - user can fix in Settings
      if (error?.message && !error.message.includes('credential')) {
        toast({
          title: "Account Data Error",
          description: "Unable to fetch account data. Please check your API credentials in Settings.",
          variant: "destructive"
        });
      }
    } finally {
      setLoadingAccount(false);
    }
  };
  const fetchMarketData = async () => {
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('binance-ticker', {
        body: {
          symbols: userPairs
        }
      });
      if (error) throw error;
      if (data?.success) {
        // Accept partial data
        setMarketData(data.data || []);

        // Handle errors for invalid symbols
        if (data.errors && data.errors.length > 0) {
          setTickerErrors(data.errors);
        } else {
          setTickerErrors([]);
        }
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
      setMarketData([]);
    } finally {
      setLoading(false);
    }
  };
  const fetchStrategySignals = async () => {
    setLoadingSignals(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch open positions from strategy_live_states
      const {
        data: states,
        error: statesError
      } = await supabase.from('strategy_live_states').select('strategy_id, entry_price, entry_time').eq('user_id', user.id).eq('position_open', true);
      if (statesError) throw statesError;
      if (!states || states.length === 0) {
        setStrategySignals([]);
        return;
      }

      // Fetch strategy details
      const strategyIds = states.map(s => s.strategy_id);
      const {
        data: strategies,
        error: strategiesError
      } = await supabase.from('strategies').select('id, name, symbol').in('id', strategyIds);
      if (strategiesError) throw strategiesError;

      // Combine data
      const signals: StrategySignal[] = states.map(state => {
        const strategy = strategies?.find(s => s.id === state.strategy_id);
        return {
          id: state.strategy_id,
          strategy_name: strategy?.name || 'Unknown',
          symbol: strategy?.symbol || 'Unknown',
          entry_price: state.entry_price,
          entry_time: state.entry_time,
          signal_type: 'BUY'
        };
      });
      setStrategySignals(signals);
    } catch (error) {
      console.error('Error fetching strategy signals:', error);
    } finally {
      setLoadingSignals(false);
    }
  };
  const handleClosePosition = async (symbol: string) => {
    setClosingPosition(symbol);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('close-position', {
        body: {
          symbol,
          closeAll: false
        }
      });
      if (error) throw error;
      if (data.success) {
        toast({
          title: "Position Closed",
          description: `Successfully closed position for ${symbol}`
        });
        await fetchAccountData();
        await fetchStrategySignals();
      }
    } catch (error: any) {
      console.error('Error closing position:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to close position",
        variant: "destructive"
      });
    } finally {
      setClosingPosition(null);
    }
  };
  const handleCloseAllPositions = async () => {
    setClosingPosition('all');
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('close-position', {
        body: {
          closeAll: true
        }
      });
      if (error) throw error;
      if (data.success) {
        toast({
          title: "All Positions Closed",
          description: data.message
        });
        await fetchAccountData();
        await fetchStrategySignals();
      }
    } catch (error: any) {
      console.error('Error closing all positions:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to close positions",
        variant: "destructive"
      });
    } finally {
      setClosingPosition(null);
    }
  };
  const handleClearAllSignals = async () => {
    setClearingSignals(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;

      // Close all open strategy positions
      const {
        error
      } = await supabase.from('strategy_live_states').update({
        position_open: false,
        entry_price: null,
        entry_time: null
      }).eq('user_id', user.id).eq('position_open', true);
      if (error) throw error;
      toast({
        title: "Signals Cleared",
        description: "All strategy signals have been cleared"
      });
      await fetchStrategySignals();
    } catch (error: any) {
      console.error('Error clearing signals:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to clear signals",
        variant: "destructive"
      });
    } finally {
      setClearingSignals(false);
    }
  };

  // Get trading mode info
  const getTradingModeInfo = (mode: string | undefined) => {
    switch (mode) {
      case 'hybrid_safe':
        return {
          emoji: '🛡️',
          name: 'Hybrid Safe',
          description: 'Real data + Testnet API + Paper Trading',
          dataSource: 'Mainnet Data',
          executionMode: 'Paper Trading'
        };
      case 'hybrid_live':
        return {
          emoji: '⚡',
          name: 'Hybrid Live',
          description: 'Real data + Testnet API + Real execution',
          dataSource: 'Mainnet Data',
          executionMode: 'Testnet Trading'
        };
      case 'paper_trading':
        return {
          emoji: '📄',
          name: 'Paper Trading',
          description: 'Real data, no real execution',
          dataSource: 'Mainnet Data',
          executionMode: 'Paper Trading'
        };
      case 'mainnet_only':
        return {
          emoji: '🚨',
          name: 'Live Trading',
          description: 'Real money at risk!',
          dataSource: 'Mainnet API',
          executionMode: 'Real Trading'
        };
      default:
        return {
          emoji: '📊',
          name: 'Unknown Mode',
          description: 'Trading mode not configured',
          dataSource: 'Unknown',
          executionMode: 'Unknown'
        };
    }
  };
  const modeInfo = getTradingModeInfo(tradingMode);
  const stats = [{
    label: `Balance (${accountData?.exchangeType?.toUpperCase() || 'N/A'})`,
    value: loadingAccount ? "Loading..." : `$${accountData?.totalWalletBalance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) || '0.00'}`,
    change: accountData?.totalUnrealizedProfit ? `${accountData.totalUnrealizedProfit >= 0 ? '+' : ''}$${accountData.totalUnrealizedProfit.toFixed(2)}` : "—",
    trend: accountData?.totalUnrealizedProfit ? accountData.totalUnrealizedProfit >= 0 ? "up" : "down" : "neutral",
    environment: accountData?.environment,
    tooltip: `Total wallet balance from ${accountData?.exchangeType?.toUpperCase() || 'exchange'} (${modeInfo.dataSource}, ${modeInfo.executionMode})`,
    timeframe: "Real-time",
    modeInfo: modeInfo
  }, {
    label: `Open Positions (${accountData?.exchangeType?.toUpperCase() || 'N/A'})`,
    value: loadingAccount ? "..." : accountData?.openPositionsCount.toString() || "0",
    change: "—",
    trend: "neutral",
    tooltip: `Active positions from ${accountData?.exchangeType?.toUpperCase() || 'exchange'} (${modeInfo.dataSource}, ${modeInfo.executionMode})`,
    timeframe: "Real-time",
    modeInfo: modeInfo
  }, {
    label: "Win Rate",
    value: loadingAccount ? "..." : accountData ? `${accountData.winRate.toFixed(1)}%` : "—",
    change: "—",
    trend: "neutral",
    tooltip: `Historical performance (${modeInfo.dataSource})`,
    timeframe: "All-time",
    modeInfo: modeInfo
  }, {
    label: `Unrealized P&L (${accountData?.exchangeType?.toUpperCase() || 'N/A'})`,
    value: loadingAccount ? "Loading..." : `$${accountData?.totalUnrealizedProfit.toFixed(2) || '0.00'}`,
    change: "—",
    trend: accountData?.totalUnrealizedProfit ? accountData.totalUnrealizedProfit >= 0 ? "up" : "down" : "neutral",
    tooltip: `Floating P&L from ${accountData?.exchangeType?.toUpperCase() || 'exchange'} (${modeInfo.dataSource}, ${modeInfo.executionMode})`,
    timeframe: "Real-time",
    modeInfo: modeInfo
  }];
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold">Dashboard</h2>
            <Badge variant={tradingMode === 'mainnet_only' ? 'destructive' : 'default'} className="text-sm px-3 py-1">
              {modeInfo.emoji} {modeInfo.name}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {modeInfo.description}
            {lastUpdated && <span className="ml-2 text-xs">
                • Last updated: {lastUpdated.toLocaleTimeString()}
              </span>}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>📊 Data: {modeInfo.dataSource}</span>
            <span>⚡ Execution: {modeInfo.executionMode}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
          loadUserSettings();
          fetchAccountData();
          fetchMarketData();
          fetchStrategySignals();
        }} disabled={loadingAccount || loading || loadingSignals}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingAccount || loading || loadingSignals ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="text-xs text-muted-foreground">
            Auto-refresh: 60s
          </div>
        </div>
      </div>

      <TooltipProvider>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => <Card key={stat.label} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-muted-foreground">
                      {stat.label}
                    </p>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">{stat.tooltip}</p>
                        <p className="text-xs font-semibold mt-1">Mode: {stat.modeInfo.name}</p>
                        <p className="text-xs mt-1">Data: {stat.modeInfo.dataSource}</p>
                        <p className="text-xs">Execution: {stat.modeInfo.executionMode}</p>
                        <p className="text-xs mt-1">Timeframe: {stat.timeframe}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                      {stat.timeframe}
                    </Badge>
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                {stat.trend === "up" && <ArrowUp className="h-4 w-4 text-success" />}
                {stat.trend === "down" && <ArrowDown className="h-4 w-4 text-destructive" />}
                {stat.trend === "neutral" && <TrendingUp className="h-4 w-4 text-muted-foreground" />}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{stat.change}</p>
            </Card>)}
        </div>
      </TooltipProvider>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            Open Positions {accountData?.exchangeType && `(${accountData.exchangeType.toUpperCase()})`}
          </h3>
          {accountData && accountData.positions.length > 0 && <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={closingPosition === 'all'}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Close All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close All Positions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will close all {accountData.positions.length} open position(s) at market price. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCloseAllPositions}>
                    Close All Positions
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
        </div>
        {loadingAccount ? <div className="text-center py-12">
            <div className="text-sm text-muted-foreground">Loading positions...</div>
          </div> : !accountData || accountData.positions.length === 0 ? <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No open positions</p>
            <p className="text-xs text-muted-foreground mt-1">
              Positions will appear here when you open trades
            </p>
            <div className="mt-4 p-3 bg-secondary/30 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Current Mode:</strong> {modeInfo.name} ({modeInfo.executionMode})
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Data Source: {modeInfo.dataSource}
              </p>
            </div>
          </div> : <div className="space-y-3">
            {accountData.positions.map((position, idx) => <div key={idx} className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold">{position.symbol}</h4>
                    <Badge variant={position.side === 'LONG' ? 'default' : 'destructive'}>
                      {position.side}
                    </Badge>
                    <Badge variant="outline">{position.leverage}x</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={position.unrealizedProfit >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                      {position.unrealizedProfit >= 0 ? "+" : ""}${position.unrealizedProfit.toFixed(2)}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" disabled={closingPosition === position.symbol}>
                          <X className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Close {position.symbol} Position?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will close your {position.side} position at market price. Current P&L: {position.unrealizedProfit >= 0 ? "+" : ""}${position.unrealizedProfit.toFixed(2)}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleClosePosition(position.symbol)}>
                            Close Position
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Size: </span>
                    <span className="font-medium">{Math.abs(position.positionAmt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entry: </span>
                    <span className="font-medium">${position.entryPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>)}
          </div>}
      </Card>

      

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-bold">Market Data (Live)</h3>
            {tickerErrors.length > 0 && <div className="mt-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                <p className="text-sm font-semibold text-destructive mb-1">⚠️ Invalid symbols detected:</p>
                <p className="text-xs text-muted-foreground">
                  {tickerErrors.map(e => e.symbol).join(', ')} failed to load. Please remove these from Trading Pairs.
                </p>
              </div>}
          </div>
          <AddMarketPairDialog onPairAdded={loadUserPairs} />
        </div>
        {loading ? <div className="text-sm text-muted-foreground">Loading market data...</div> : marketData.length > 0 ? <div className="grid gap-4 md:grid-cols-2">
            {marketData.map(ticker => <div key={ticker.symbol} className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold">{ticker.symbol}</h4>
                  <span className={ticker.changePercent >= 0 ? "text-green-600" : "text-red-600"}>
                    {ticker.changePercent >= 0 ? "+" : ""}{ticker.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="text-2xl font-bold mb-1">
                  ${ticker.price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-3">
                  <div>
                    <span className="block">24h High</span>
                    <span className="font-medium text-foreground">${ticker.high.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block">24h Low</span>
                    <span className="font-medium text-foreground">${ticker.low.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block">24h Volume</span>
                    <span className="font-medium text-foreground">{ticker.volume.toLocaleString(undefined, {
                  maximumFractionDigits: 2
                })}</span>
                  </div>
                  <div>
                    <span className="block">Quote Volume</span>
                    <span className="font-medium text-foreground">${(ticker.quoteVolume / 1000000).toFixed(2)}M</span>
                  </div>
                </div>
              </div>)}
          </div> : <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Unable to load market data</p>
            <p className="text-xs text-muted-foreground mt-1">
              Check the edge function logs for details
            </p>
          </div>}
      </Card>
    </div>;
};
export default Dashboard;