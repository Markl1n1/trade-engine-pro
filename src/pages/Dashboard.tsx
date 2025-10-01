import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, TrendingUp, RefreshCw, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AddMarketPairDialog } from "@/components/AddMarketPairDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  useEffect(() => {
    loadUserPairs();
    fetchAccountData();
    fetchStrategySignals();
  }, []);

  useEffect(() => {
    if (userPairs.length > 0) {
      fetchMarketData();
      const interval = setInterval(fetchMarketData, 10000);
      return () => clearInterval(interval);
    }
  }, [userPairs]);

  const loadUserPairs = async () => {
    try {
      const { data, error } = await supabase
        .from("user_trading_pairs")
        .select("symbol");
      
      if (error) throw error;
      const symbols = data?.map(p => p.symbol) || ['BTCUSDT', 'ETHUSDT'];
      setUserPairs(symbols);
    } catch (error) {
      console.error('Error loading pairs:', error);
      setUserPairs(['BTCUSDT', 'ETHUSDT']);
    }
  };

  const fetchAccountData = async () => {
    setLoadingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-account-data');
      
      if (error) throw error;
      if (data?.success && data?.data) {
        setAccountData(data.data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching account data:', error);
    } finally {
      setLoadingAccount(false);
    }
  };

  const fetchMarketData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('binance-ticker', {
        body: { symbols: userPairs }
      });

      if (error) throw error;
      if (data?.success && data?.data) {
        setMarketData(data.data);
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStrategySignals = async () => {
    setLoadingSignals(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch open positions from strategy_live_states
      const { data: states, error: statesError } = await supabase
        .from('strategy_live_states')
        .select('strategy_id, entry_price, entry_time')
        .eq('user_id', user.id)
        .eq('position_open', true);

      if (statesError) throw statesError;
      if (!states || states.length === 0) {
        setStrategySignals([]);
        return;
      }

      // Fetch strategy details
      const strategyIds = states.map(s => s.strategy_id);
      const { data: strategies, error: strategiesError } = await supabase
        .from('strategies')
        .select('id, name, symbol')
        .in('id', strategyIds);

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
          signal_type: 'BUY',
        };
      });

      setStrategySignals(signals);
    } catch (error) {
      console.error('Error fetching strategy signals:', error);
    } finally {
      setLoadingSignals(false);
    }
  };

  const stats = [
    { 
      label: "Balance", 
      value: loadingAccount ? "Loading..." : `$${accountData?.totalWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
      change: accountData?.totalUnrealizedProfit ? `${accountData.totalUnrealizedProfit >= 0 ? '+' : ''}$${accountData.totalUnrealizedProfit.toFixed(2)}` : "—",
      trend: accountData?.totalUnrealizedProfit ? (accountData.totalUnrealizedProfit >= 0 ? "up" : "down") : "neutral",
      environment: accountData?.environment,
      tooltip: "Total wallet balance from Binance account (real-time, includes unrealized P&L)",
      timeframe: "Real-time",
    },
    { 
      label: "Open Positions", 
      value: loadingAccount ? "..." : accountData?.openPositionsCount.toString() || "0",
      change: "—",
      trend: "neutral",
      tooltip: "Number of active open positions from Binance account",
      timeframe: "Real-time",
    },
    { 
      label: "Win Rate", 
      value: loadingAccount ? "..." : accountData ? `${accountData.winRate.toFixed(1)}%` : "—",
      change: "—",
      trend: "neutral",
      tooltip: "Percentage of winning trades calculated from historical trade data",
      timeframe: "All-time",
    },
    { 
      label: "Unrealized P&L", 
      value: loadingAccount ? "Loading..." : `$${accountData?.totalUnrealizedProfit.toFixed(2) || '0.00'}`,
      change: "—",
      trend: accountData?.totalUnrealizedProfit ? (accountData.totalUnrealizedProfit >= 0 ? "up" : "down") : "neutral",
      tooltip: "Floating profit/loss from open positions (not yet realized)",
      timeframe: "Real-time",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold">Dashboard</h2>
            {accountData && (
              <Badge 
                variant={accountData.environment === 'testnet' ? 'secondary' : 'destructive'}
                className="text-sm px-3 py-1"
              >
                {accountData.environment === 'testnet' ? '🧪 Testnet Mode' : '🔴 Live Trading'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Real-time overview of your trading activity
            {lastUpdated && (
              <span className="ml-2 text-xs">
                • Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => {
            fetchAccountData();
            fetchMarketData();
            fetchStrategySignals();
          }}
          disabled={loadingAccount || loading || loadingSignals}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${(loadingAccount || loading || loadingSignals) ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <TooltipProvider>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
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
                        <p className="text-xs font-semibold mt-1">Source: Binance API</p>
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
            </Card>
          ))}
        </div>
      </TooltipProvider>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Open Positions</h3>
        {loadingAccount ? (
          <div className="text-center py-12">
            <div className="text-sm text-muted-foreground">Loading positions...</div>
          </div>
        ) : !accountData || accountData.positions.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No open positions</p>
            <p className="text-xs text-muted-foreground mt-1">
              Positions will appear here when you open trades
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {accountData.positions.map((position, idx) => (
              <div key={idx} className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold">{position.symbol}</h4>
                    <Badge variant={position.side === 'LONG' ? 'default' : 'destructive'}>
                      {position.side}
                    </Badge>
                    <Badge variant="outline">{position.leverage}x</Badge>
                  </div>
                  <span className={position.unrealizedProfit >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                    {position.unrealizedProfit >= 0 ? "+" : ""}${position.unrealizedProfit.toFixed(2)}
                  </span>
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
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Strategy Signals (Open)</h3>
        {loadingSignals ? (
          <div className="text-center py-12">
            <div className="text-sm text-muted-foreground">Loading strategy signals...</div>
          </div>
        ) : strategySignals.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No active strategy signals</p>
            <p className="text-xs text-muted-foreground mt-1">
              Signals will appear here when your strategies trigger entry conditions
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {strategySignals.map((signal) => (
              <div key={signal.id} className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold">{signal.strategy_name}</h4>
                    <Badge variant="outline">{signal.symbol}</Badge>
                    <Badge variant="default">Signal</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(signal.entry_time).toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Entry Price: </span>
                    <span className="font-medium">${signal.entry_price.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entry Time: </span>
                    <span className="font-medium">{new Date(signal.entry_time).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Market Data (Live)</h3>
          <AddMarketPairDialog onPairAdded={loadUserPairs} />
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading market data...</div>
        ) : marketData.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {marketData.map((ticker) => (
              <div key={ticker.symbol} className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold">{ticker.symbol}</h4>
                  <span className={ticker.changePercent >= 0 ? "text-green-600" : "text-red-600"}>
                    {ticker.changePercent >= 0 ? "+" : ""}{ticker.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="text-2xl font-bold mb-1">
                  ${ticker.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    <span className="font-medium text-foreground">{ticker.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="block">Quote Volume</span>
                    <span className="font-medium text-foreground">${(ticker.quoteVolume / 1000000).toFixed(2)}M</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Unable to load market data</p>
            <p className="text-xs text-muted-foreground mt-1">
              Check the edge function logs for details
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
