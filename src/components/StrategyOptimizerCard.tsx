import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lightbulb, CheckCircle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Suggestion {
  id: string;
  strategy_id: string;
  suggestion_type: string;
  current_value: any;
  suggested_value: any;
  reason: string;
  based_on_signals: number;
  applied: boolean;
  created_at: string;
}

export function StrategyOptimizerCard() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [strategyNames, setStrategyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      const { data, error } = await supabase
        .from('optimization_suggestions' as any)
        .select('*')
        .eq('applied', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      const items = (data || []) as unknown as Suggestion[];
      setSuggestions(items);

      // Fetch strategy names
      const stratIds = [...new Set(items.map(s => s.strategy_id))];
      if (stratIds.length > 0) {
        const { data: strats } = await supabase
          .from('strategies')
          .select('id, name')
          .in('id', stratIds);
        
        const names: Record<string, string> = {};
        (strats || []).forEach(s => { names[s.id] = s.name; });
        setStrategyNames(names);
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = async (suggestion: Suggestion) => {
    try {
      // Mark as applied
      await supabase
        .from('optimization_suggestions' as any)
        .update({ applied: true } as any)
        .eq('id', suggestion.id);

      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      toast({
        title: "Suggestion applied",
        description: `Marked ${suggestion.suggestion_type} as applied for ${strategyNames[suggestion.strategy_id] || 'strategy'}`,
      });
    } catch (err) {
      console.error('Error applying suggestion:', err);
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'tp_adjust': return 'Take Profit';
      case 'sl_adjust': return 'Stop Loss';
      case 'add_filter': return 'Add Filter';
      case 'review_needed': return 'Review';
      default: return type;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'tp_adjust': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'sl_adjust': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'add_filter': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'review_needed': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return '';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-yellow-400" />
            Strategy Optimizer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading suggestions...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="h-5 w-5 text-yellow-400" />
          Strategy Optimizer
          {suggestions.length > 0 && (
            <Badge variant="secondary" className="ml-auto">{suggestions.length} pending</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-400" />
            All strategies are optimized. No suggestions pending.
          </div>
        ) : (
          suggestions.map(s => (
            <div key={s.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={typeColor(s.suggestion_type)} variant="outline">
                    {typeLabel(s.suggestion_type)}
                  </Badge>
                  <span className="text-sm font-medium">
                    {strategyNames[s.strategy_id] || 'Unknown Strategy'}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Based on {s.based_on_signals} signals
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{s.reason}</p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applySuggestion(s)}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Acknowledge
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
