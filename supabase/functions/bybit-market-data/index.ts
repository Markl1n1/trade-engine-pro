import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Bybit API configuration
const BYBIT_URLS = {
  mainnet: 'https://api.bybit.com',
  testnet: 'https://api-testnet.bybit.com'
};

// Interval mapping for Bybit
const BYBIT_INTERVALS: Record<string, string> = {
  '1m': '1',
  '3m': '3', 
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '6h': '360',
  '12h': '720',
  '1d': 'D',
  '3d': 'W',
  '1w': 'M'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      symbol, 
      interval, 
      limit = 1000, 
      startTime, 
      endTime,
      batchMode = false,
      useTestnet = false
    } = await req.json();

    console.log(`[BYBIT-MARKET-DATA] Fetching ${symbol} ${interval} data (limit: ${limit})`);

    // Calculate number of batches needed for date range
    if (batchMode && startTime && endTime) {
      const intervalMs = getIntervalMs(interval);
      const totalDuration = endTime - startTime;
      const candlesNeeded = Math.ceil(totalDuration / intervalMs);
      const batchSize = 1000;
      const batchesNeeded = Math.ceil(candlesNeeded / batchSize);

      console.log(`[BYBIT-MARKET-DATA] Batch mode: ${candlesNeeded} candles needed, ${batchesNeeded} batches`);

      let allCandles: any[] = [];
      let currentStartTime = startTime;
      let successfulBatches = 0;
      let failedBatches = 0;

      for (let i = 0; i < batchesNeeded; i++) {
        try {
          const batchEndTime = Math.min(currentStartTime + (batchSize * intervalMs), endTime);
          
          const bybitUrl = `${useTestnet ? BYBIT_URLS.testnet : BYBIT_URLS.mainnet}/v5/market/kline?category=linear&symbol=${symbol}&interval=${BYBIT_INTERVALS[interval] || interval}&limit=${batchSize}&start=${currentStartTime}&end=${batchEndTime}`;
          
          console.log(`[BYBIT-MARKET-DATA] Batch ${i + 1}: ${bybitUrl}`);
          
          const response = await fetch(bybitUrl);

          if (!response.ok) {
            console.error(`[BYBIT-MARKET-DATA] Batch ${i + 1} failed: ${response.statusText}`);
            failedBatches++;
            continue;
          }

          const data = await response.json();

          if (data.retCode !== 0) {
            console.error(`[BYBIT-MARKET-DATA] Batch ${i + 1} API error: ${data.retMsg}`);
            failedBatches++;
            continue;
          }

          const klines = data.result.list || [];

          if (klines.length === 0) {
            console.log(`[BYBIT-MARKET-DATA] Batch ${i + 1}: No more data available`);
            break;
          }

          const candles = klines.map((k: any) => ({
            symbol,
            timeframe: interval,
            exchange_type: 'bybit',
            open_time: parseInt(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            close_time: parseInt(k[6]),
          }));

          allCandles = allCandles.concat(candles);

          // Store batch in database
          const { error: dbError } = await supabaseClient
            .from('market_data')
            .upsert(candles, { onConflict: 'symbol,timeframe,open_time,exchange_type' });

          if (dbError) {
            console.error(`[BYBIT-MARKET-DATA] Database error for batch ${i + 1}:`, dbError);
          } else {
            successfulBatches++;
            console.log(`[BYBIT-MARKET-DATA] Batch ${i + 1} stored: ${candles.length} candles`);
          }

          currentStartTime = batchEndTime;
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`[BYBIT-MARKET-DATA] Batch ${i + 1} error:`, error);
          failedBatches++;
        }
      }

      console.log(`[BYBIT-MARKET-DATA] Batch processing complete: ${successfulBatches} successful, ${failedBatches} failed`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: allCandles,
          batches: { successful: successfulBatches, failed: failedBatches },
          totalCandles: allCandles.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single request mode
    const bybitUrl = `${useTestnet ? BYBIT_URLS.testnet : BYBIT_URLS.mainnet}/v5/market/kline?category=linear&symbol=${symbol}&interval=${BYBIT_INTERVALS[interval] || interval}&limit=${limit}`;
    
    console.log(`[BYBIT-MARKET-DATA] Single request: ${bybitUrl}`);
    
    const response = await fetch(bybitUrl);

    if (!response.ok) {
      throw new Error(`Bybit API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }

    const klines = data.result.list || [];

    const candles = klines.map((k: any) => ({
      symbol,
      timeframe: interval,
      exchange_type: 'bybit',
      open_time: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      close_time: parseInt(k[6]),
    }));

    // Store in database
    const { error: dbError } = await supabaseClient
      .from('market_data')
      .upsert(candles, { onConflict: 'symbol,timeframe,open_time,exchange_type' });

    if (dbError) {
      console.error('[BYBIT-MARKET-DATA] Database error:', dbError);
    }

    return new Response(
      JSON.stringify({ success: true, data: candles }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[BYBIT-MARKET-DATA] Error:', error);
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
    case 'M': return value * 30 * 24 * 60 * 60 * 1000;
    default: return 60 * 1000; // Default to 1 minute
  }
}
