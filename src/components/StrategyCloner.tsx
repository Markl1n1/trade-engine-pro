import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";
import { logStrategyClone } from "@/utils/auditLogger";

interface StrategyClonerProps {
  strategy: any;
  onCloneComplete: () => void;
}

export function StrategyCloner({ strategy, onCloneComplete }: StrategyClonerProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(`${strategy.name} (Copy)`);
  const [isCloning, setIsCloning] = useState(false);
  const { toast } = useToast();

  const handleClone = async () => {
    setIsCloning(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Clone the strategy with all configuration fields
      const { data: newStrategy, error: strategyError } = await supabase
        .from('strategies')
        .insert({
          user_id: user.user.id,
          name: newName,
          description: strategy.description,
          symbol: strategy.symbol,
          timeframe: strategy.timeframe,
          strategy_type: strategy.strategy_type,
          initial_capital: strategy.initial_capital,
          position_size_percent: strategy.position_size_percent,
          stop_loss_percent: strategy.stop_loss_percent,
          take_profit_percent: strategy.take_profit_percent,
          // SMA Crossover settings
          sma_fast_period: strategy.sma_fast_period,
          sma_slow_period: strategy.sma_slow_period,
          // RSI settings
          rsi_period: strategy.rsi_period,
          rsi_overbought: strategy.rsi_overbought,
          rsi_oversold: strategy.rsi_oversold,
          // Volume and ATR settings
          volume_multiplier: strategy.volume_multiplier,
          atr_sl_multiplier: strategy.atr_sl_multiplier,
          atr_tp_multiplier: strategy.atr_tp_multiplier,
          // MTF Momentum settings
          mtf_rsi_period: strategy.mtf_rsi_period,
          mtf_rsi_entry_threshold: strategy.mtf_rsi_entry_threshold,
          mtf_macd_fast: strategy.mtf_macd_fast,
          mtf_macd_slow: strategy.mtf_macd_slow,
          mtf_macd_signal: strategy.mtf_macd_signal,
          mtf_volume_multiplier: strategy.mtf_volume_multiplier,
          // MSTG settings
          mstg_weight_momentum: strategy.mstg_weight_momentum,
          mstg_weight_trend: strategy.mstg_weight_trend,
          mstg_weight_volatility: strategy.mstg_weight_volatility,
          mstg_weight_relative: strategy.mstg_weight_relative,
          mstg_long_threshold: strategy.mstg_long_threshold,
          mstg_short_threshold: strategy.mstg_short_threshold,
          mstg_exit_threshold: strategy.mstg_exit_threshold,
          mstg_extreme_threshold: strategy.mstg_extreme_threshold,
          // ATH Guard settings
          ath_guard_ema_slope_threshold: strategy.ath_guard_ema_slope_threshold,
          ath_guard_pullback_tolerance: strategy.ath_guard_pullback_tolerance,
          ath_guard_volume_multiplier: strategy.ath_guard_volume_multiplier,
          ath_guard_stoch_oversold: strategy.ath_guard_stoch_oversold,
          ath_guard_stoch_overbought: strategy.ath_guard_stoch_overbought,
          ath_guard_atr_sl_multiplier: strategy.ath_guard_atr_sl_multiplier,
          ath_guard_atr_tp1_multiplier: strategy.ath_guard_atr_tp1_multiplier,
          ath_guard_atr_tp2_multiplier: strategy.ath_guard_atr_tp2_multiplier,
          ath_guard_ath_safety_distance: strategy.ath_guard_ath_safety_distance,
          ath_guard_rsi_threshold: strategy.ath_guard_rsi_threshold,
          // Benchmark
          benchmark_symbol: strategy.benchmark_symbol,
          status: 'draft' // Always create clones as drafts
        })
        .select()
        .single();

      if (strategyError) throw strategyError;

      // Clone the conditions if they exist
      const { data: conditions } = await supabase
        .from('strategy_conditions')
        .select('*')
        .eq('strategy_id', strategy.id);

      if (conditions && conditions.length > 0) {
        const conditionsToInsert = conditions.map(({ id, created_at, strategy_id, ...rest }) => ({
          ...rest,
          strategy_id: newStrategy.id
        }));

        const { error: conditionsError } = await supabase
          .from('strategy_conditions')
          .insert(conditionsToInsert);

        if (conditionsError) throw conditionsError;
      }

      // Clone condition groups if they exist
      const { data: groups } = await supabase
        .from('condition_groups')
        .select('*')
        .eq('strategy_id', strategy.id);

      if (groups && groups.length > 0) {
        const groupsToInsert = groups.map(({ id, created_at, strategy_id, ...rest }) => ({
          ...rest,
          strategy_id: newStrategy.id
        }));

        const { error: groupsError } = await supabase
          .from('condition_groups')
          .insert(groupsToInsert);

        if (groupsError) throw groupsError;
      }

      // Log strategy clone
      await logStrategyClone(strategy.id, {
        id: newStrategy.id,
        name: newName,
        strategy_type: strategy.strategy_type,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        initial_capital: strategy.initial_capital,
        position_size_percent: strategy.position_size_percent
      });

      toast({
        title: "Strategy cloned successfully",
        description: `Created "${newName}" as a draft`,
      });

      setOpen(false);
      onCloneComplete();
    } catch (error: any) {
      toast({
        title: "Failed to clone strategy",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Copy className="h-4 w-4 mr-2" />
        Clone
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Strategy</DialogTitle>
            <DialogDescription>
              Create a copy of "{strategy.name}" with all its conditions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">New Strategy Name</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter strategy name"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClone} disabled={isCloning || !newName}>
              {isCloning ? "Cloning..." : "Clone Strategy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
