import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol = 'BTCUSDT', interval = '1h', limit = 500, startTime, endTime } = await req.json();

    console.log(`Fetching market data for ${symbol} with interval ${interval}, limit ${limit}`);

    // Build Binance API URL with optional date range
    let binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
    
    if (startTime) {
      binanceUrl += `&startTime=${startTime}`;
    }
    if (endTime) {
      binanceUrl += `&endTime=${endTime}`;
    }

    const response = await fetch(binanceUrl);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }

    const klines = await response.json();

    // Transform Binance kline data
    const candles = klines.map((k: any) => ({
      symbol,
      timeframe: interval,
      open_time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      close_time: k[6],
    }));

    // Store in database (optional - for historical data)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Upsert candles (update if exists, insert if not)
    const { error: dbError } = await supabaseClient
      .from('market_data')
      .upsert(candles, { onConflict: 'symbol,timeframe,open_time' });

    if (dbError) {
      console.error('Database error:', dbError);
    }

    return new Response(
      JSON.stringify({ success: true, data: candles }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching market data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
