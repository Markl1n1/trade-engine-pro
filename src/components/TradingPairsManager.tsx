import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Loader2, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TradingPair {
  id: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
}

interface BinancePair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

export const TradingPairsManager = () => {
  const { toast } = useToast();
  const [userPairs, setUserPairs] = useState<TradingPair[]>([]);
  const [availablePairs, setAvailablePairs] = useState<BinancePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadUserPairs();
  }, []);

  const loadUserPairs = async () => {
    try {
      const { data, error } = await supabase
        .from("user_trading_pairs")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setUserPairs(data || []);
    } catch (error) {
      console.error("Error loading pairs:", error);
      toast({
        title: "Error",
        description: "Failed to load trading pairs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAvailablePairs = async () => {
    setLoadingPairs(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-binance-pairs");

      if (error) throw error;
      if (data?.success && data?.data) {
        setAvailablePairs(data.data);
      }
    } catch (error) {
      console.error("Error loading available pairs:", error);
      toast({
        title: "Error",
        description: "Failed to load available pairs from Binance",
        variant: "destructive",
      });
    } finally {
      setLoadingPairs(false);
    }
  };

  const addPair = async (pair: BinancePair) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_trading_pairs")
        .insert({
          user_id: user.id,
          symbol: pair.symbol,
          base_asset: pair.baseAsset,
          quote_asset: pair.quoteAsset,
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Already Added",
            description: "This trading pair is already in your list",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Success",
        description: `Added ${pair.symbol} to your trading pairs`,
      });
      
      await loadUserPairs();
      setOpen(false);
      setSearchQuery("");
    } catch (error) {
      console.error("Error adding pair:", error);
      toast({
        title: "Error",
        description: "Failed to add trading pair",
        variant: "destructive",
      });
    }
  };

  const removePair = async (pairId: string) => {
    try {
      const { error } = await supabase
        .from("user_trading_pairs")
        .delete()
        .eq("id", pairId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Trading pair removed",
      });
      
      await loadUserPairs();
    } catch (error) {
      console.error("Error removing pair:", error);
      toast({
        title: "Error",
        description: "Failed to remove trading pair",
        variant: "destructive",
      });
    }
  };

  const filteredPairs = availablePairs.filter(pair => 
    pair.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pair.baseAsset.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Trading Pairs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your trading pairs
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              onClick={() => {
                if (availablePairs.length === 0) {
                  loadAvailablePairs();
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Pair
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="end">
            <Command>
              <CommandInput 
                placeholder="Search trading pairs..." 
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandEmpty>
                {loadingPairs ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  "No pairs found."
                )}
              </CommandEmpty>
              <CommandGroup className="max-h-[300px] overflow-auto">
                {filteredPairs.map((pair) => (
                  <CommandItem
                    key={pair.symbol}
                    onSelect={() => addPair(pair)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{pair.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {pair.baseAsset}/{pair.quoteAsset}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        {userPairs.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No trading pairs added yet. Click "Add Pair" to get started.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {userPairs.map((pair) => (
              <Badge
                key={pair.id}
                variant="secondary"
                className="px-3 py-2 text-sm flex items-center gap-2"
              >
                {pair.symbol}
                <button
                  onClick={() => removePair(pair.id)}
                  className="hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};