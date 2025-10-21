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

      // Clone the strategy
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
        timeframe: strategy.timeframe
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
