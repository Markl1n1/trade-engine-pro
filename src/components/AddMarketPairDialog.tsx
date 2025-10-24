import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";

interface TradingPair {
  symbol: string;
  base_asset: string;
  quote_asset: string;
}

interface BinancePair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

interface AddMarketPairDialogProps {
  onPairAdded: () => void;
}

export const AddMarketPairDialog = ({ onPairAdded }: AddMarketPairDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [availablePairs, setAvailablePairs] = useState<BinancePair[]>([]);
  const [userPairs, setUserPairs] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load user's existing pairs
      const { data: userPairsData } = await supabase
        .from("user_trading_pairs")
        .select("symbol, base_asset, quote_asset");
      
      setUserPairs(userPairsData || []);

      // Load available pairs directly from Bybit
      const response = await fetch('https://api.bybit.com/v5/market/instruments-info?category=spot');
      const data = await response.json();
      
      if (data.retCode === 0) {
        const pairs = data.result.list
          .filter((instrument: any) => instrument.status === 'Trading')
          .map((instrument: any) => ({
            symbol: instrument.symbol,
            baseAsset: instrument.baseCoin,
            quoteAsset: instrument.quoteCoin,
          }))
          .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));
        setAvailablePairs(pairs);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load available pairs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
        description: `Added ${pair.symbol} to market data`,
      });
      
      setOpen(false);
      onPairAdded();
    } catch (error) {
      console.error("Error adding pair:", error);
      toast({
        title: "Error",
        description: "Failed to add trading pair",
        variant: "destructive",
      });
    }
  };

  const filteredPairs = availablePairs
    .filter(pair => 
      !userPairs.some(up => up.symbol === pair.symbol) &&
      (pair.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
       pair.baseAsset.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .slice(0, 50); // Limit to 50 results for performance

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Pair
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Market Data Pair</DialogTitle>
          <DialogDescription>
            Search and add trading pairs to your market data view
          </DialogDescription>
        </DialogHeader>
        <Command className="border rounded-md">
          <CommandInput 
            placeholder="Search trading pairs..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandEmpty>
            {loading ? (
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
                  <span className="font-medium">{pair.symbol}</span>
                  <span className="text-xs text-muted-foreground">
                    {pair.baseAsset}/{pair.quoteAsset}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </DialogContent>
    </Dialog>
  );
};