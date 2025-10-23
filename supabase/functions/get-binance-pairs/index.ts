import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[GET-BINANCE-PAIRS] Fetching available trading pairs from Bybit');

    // Fetch spot trading instruments from Bybit
    const bybitUrl = 'https://api.bybit.com/v5/market/instruments-info?category=spot';
    
    const response = await fetch(bybitUrl);
    
    if (!response.ok) {
      throw new Error(`Bybit API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API returned error: ${data.retMsg}`);
    }

    // Transform to expected format
    const pairs = data.result.list
      .filter((instrument: any) => instrument.status === 'Trading')
      .map((instrument: any) => ({
        symbol: instrument.symbol,
        baseAsset: instrument.baseCoin,
        quoteAsset: instrument.quoteCoin,
      }))
      .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));

    console.log(`[GET-BINANCE-PAIRS] Successfully fetched ${pairs.length} trading pairs`);

    return new Response(
      JSON.stringify({
        success: true,
        data: pairs,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[GET-BINANCE-PAIRS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch trading pairs';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
