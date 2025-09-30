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
    const { symbol = 'BTCUSDT', interval = '1h', limit = 500, startTime, endTime, batchMode = false } = await req.json();

    console.log(`Fetching market data for ${symbol} with interval ${interval}, limit ${limit}, batchMode: ${batchMode}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Calculate number of batches needed for date range
    if (batchMode && startTime && endTime) {
      const intervalMs = getIntervalMs(interval);
      const totalDuration = endTime - startTime;
      const candlesNeeded = Math.ceil(totalDuration / intervalMs);
      const batchSize = 1000;
      const batchesNeeded = Math.ceil(candlesNeeded / batchSize);

      console.log(`Batch mode: ${candlesNeeded} candles needed, ${batchesNeeded} batches`);

      let allCandles: any[] = [];
      let currentStartTime = startTime;
      let successfulBatches = 0;
      let failedBatches = 0;

      for (let i = 0; i < batchesNeeded; i++) {
        try {
          const batchEndTime = Math.min(currentStartTime + (batchSize * intervalMs), endTime);
          
          const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${batchSize}&startTime=${currentStartTime}&endTime=${batchEndTime}`;
          
          const response = await fetch(binanceUrl);

          if (!response.ok) {
            console.error(`Batch ${i + 1} failed: ${response.statusText}`);
            failedBatches++;
            continue;
          }

          const klines = await response.json();

          if (klines.length === 0) {
            console.log(`Batch ${i + 1}: No more data available`);
            break;
          }

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

          allCandles = allCandles.concat(candles);

          // Store batch in database
          const { error: dbError } = await supabaseClient
            .from('market_data')
            .upsert(candles, { onConflict: 'symbol,timeframe,open_time' });

          if (dbError) {
            console.error(`Database error for batch ${i + 1}:`, dbError);
            failedBatches++;
          } else {
            successfulBatches++;
            console.log(`Batch ${i + 1}/${batchesNeeded} completed: ${candles.length} candles stored`);
          }

          // Update start time for next batch
          currentStartTime = candles[candles.length - 1].close_time + 1;

          // Rate limiting: 100ms delay between requests
          if (i < batchesNeeded - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (batchError) {
          console.error(`Error in batch ${i + 1}:`, batchError);
          failedBatches++;
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          totalCandles: allCandles.length,
          batches: {
            total: batchesNeeded,
            successful: successfulBatches,
            failed: failedBatches
          },
          data: allCandles 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single request mode (original behavior)
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

// Helper function to convert interval to milliseconds
function getIntervalMs(interval: string): number {
  const unit = interval.slice(-1);
  const value = parseInt(interval.slice(0, -1));
  
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return 60 * 1000; // default to 1 minute
  }
}
