import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, RefreshCw, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Verification {
  id: string;
  symbol: string;
  signal_type: string;
  entry_price: number;
  outcome: string;
  exit_price: number | null;
  pnl_percent: number | null;
  max_favorable: number | null;
  max_adverse: number | null;
  time_to_exit_minutes: number | null;
  signal_time: string;
  verified_at: string;
}

export const SignalVerificationCard = () => {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, tp: 0, sl: 0, timeout: 0, accuracy: 0, avgPnl: 0 });

  useEffect(() => {
    fetchVerifications();
  }, []);

  const fetchVerifications = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('signal_verifications')
        .select('*')
        .order('verified_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const items = (data || []) as Verification[];
      setVerifications(items);

      const tp = items.filter(v => v.outcome === 'tp_hit').length;
      const sl = items.filter(v => v.outcome === 'sl_hit').length;
      const timeout = items.filter(v => v.outcome === 'timeout').length;
      const total = items.length;
      const avgPnl = total > 0 ? items.reduce((s, v) => s + (v.pnl_percent || 0), 0) / total : 0;

      setStats({
        total,
        tp,
        sl,
        timeout,
        accuracy: total > 0 ? (tp / total) * 100 : 0,
        avgPnl,
      });
    } catch (err) {
      console.error('Error fetching verifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const outcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'tp_hit': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'sl_hit': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const outcomeBadge = (outcome: string) => {
    switch (outcome) {
      case 'tp_hit': return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">TP Hit</Badge>;
      case 'sl_hit': return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">SL Hit</Badge>;
      default: return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Timeout</Badge>;
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold">Signal Verification</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchVerifications} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading verifications...</div>
      ) : stats.total === 0 ? (
        <div className="text-sm text-muted-foreground">
          No signal verifications yet. Signals are verified automatically 24h after generation.
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-bold">{stats.total}</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3 text-center">
              <div className="text-xs text-green-400">TP Hit</div>
              <div className="text-lg font-bold text-green-400">{stats.tp}</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3 text-center">
              <div className="text-xs text-red-400">SL Hit</div>
              <div className="text-lg font-bold text-red-400">{stats.sl}</div>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <div className="text-xs text-muted-foreground">Accuracy</div>
              <div className="text-lg font-bold">{stats.accuracy.toFixed(1)}%</div>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <div className="text-xs text-muted-foreground">Avg P&L</div>
              <div className={`text-lg font-bold ${stats.avgPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.avgPnl >= 0 ? '+' : ''}{stats.avgPnl.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Recent verifications */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {verifications.slice(0, 10).map(v => (
              <div key={v.id} className="flex items-center justify-between p-2 bg-secondary/30 rounded text-sm">
                <div className="flex items-center gap-2">
                  {outcomeIcon(v.outcome)}
                  <span className="font-medium">{v.symbol}</span>
                  <Badge variant="outline" className="text-xs">{v.signal_type}</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono ${(v.pnl_percent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(v.pnl_percent || 0) >= 0 ? '+' : ''}{(v.pnl_percent || 0).toFixed(2)}%
                  </span>
                  {v.time_to_exit_minutes != null && (
                    <span className="text-xs text-muted-foreground">{v.time_to_exit_minutes}m</span>
                  )}
                  {outcomeBadge(v.outcome)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};
