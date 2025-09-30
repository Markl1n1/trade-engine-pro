import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols = ['BTCUSDT', 'ETHUSDT'] } = await req.json();

    console.log(`Fetching ticker data for ${symbols.join(', ')}`);

    // Fetch 24hr ticker data from Binance public API
    const tickerData = await Promise.all(
      symbols.map(async (symbol: string) => {
        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        if (!response.ok) {
          throw new Error(`Binance API error for ${symbol}: ${response.statusText}`);
        }
        return response.json();
      })
    );

    const formattedData = tickerData.map((ticker: any) => ({
      symbol: ticker.symbol,
      price: parseFloat(ticker.lastPrice),
      change: parseFloat(ticker.priceChange),
      changePercent: parseFloat(ticker.priceChangePercent),
      high: parseFloat(ticker.highPrice),
      low: parseFloat(ticker.lowPrice),
      volume: parseFloat(ticker.volume),
      quoteVolume: parseFloat(ticker.quoteVolume),
    }));

    return new Response(
      JSON.stringify({ success: true, data: formattedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching ticker data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
