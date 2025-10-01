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

    // Fetch 24hr ticker data from Binance public API with per-symbol error handling
    const results = await Promise.all(
      symbols.map(async (symbol: string) => {
        try {
          const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
          if (!response.ok) {
            console.error(`Binance API error for ${symbol}: ${response.statusText}`);
            return { symbol, error: `API error: ${response.statusText}` };
          }
          const ticker = await response.json();
          return {
            symbol: ticker.symbol,
            price: parseFloat(ticker.lastPrice),
            change: parseFloat(ticker.priceChange),
            changePercent: parseFloat(ticker.priceChangePercent),
            high: parseFloat(ticker.highPrice),
            low: parseFloat(ticker.lowPrice),
            volume: parseFloat(ticker.volume),
            quoteVolume: parseFloat(ticker.quoteVolume),
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Failed to fetch ${symbol}:`, errMsg);
          return { symbol, error: errMsg };
        }
      })
    );

    // Separate successful results from errors
    const successData = results.filter((r: any) => !r.error);
    const errors = results.filter((r: any) => r.error).map((r: any) => ({
      symbol: r.symbol,
      error: r.error
    }));

    console.log(`Successfully fetched ${successData.length}/${symbols.length} symbols`);
    if (errors.length > 0) {
      console.log('Failed symbols:', errors);
    }

    // Always return 200 with partial data if we have any successes
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: successData,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Critical error in ticker function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, data: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
