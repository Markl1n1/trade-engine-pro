import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getActiveStrategyRequirements } from '../helpers/active-strategy-requirements.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Bybit interval mapping
const BYBIT_INTERVALS: Record<string, string> = {
  '1m': '1',
  '5m': '5', 
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': 'D'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[REFRESH-MARKET-DATA] Starting smart market data refresh...');

    // Step 1: Get active strategy requirements
    const requirements = await getActiveStrategyRequirements(supabase as any);
    
    if (requirements.symbols.length === 0) {
      console.log('[REFRESH-MARKET-DATA] No active strategies found, skipping refresh');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active strategies found',
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[REFRESH-MARKET-DATA] Found ${requirements.symbols.length} symbols and ${requirements.timeframes.length} timeframes from active strategies`);

    // Validate that we have valid symbols and timeframes
    if (requirements.symbols.length === 0) {
      console.log('[REFRESH-MARKET-DATA] No valid symbols found in active strategies');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No valid symbols found in active strategies',
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (requirements.timeframes.length === 0) {
      console.log('[REFRESH-MARKET-DATA] No valid timeframes found in active strategies');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No valid timeframes found in active strategies',
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    // Step 2: For each symbol-timeframe combination used by strategies
    for (const symbol of requirements.symbols) {
      for (const timeframe of requirements.timeframes) {
        try {
          // Validate symbol and timeframe before processing
          if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
            console.error(`[REFRESH-MARKET-DATA] Invalid symbol: ${symbol}`);
            results.push({
              symbol: symbol || 'INVALID',
              timeframe,
              error: 'Invalid symbol',
              success: false
            });
            continue;
          }

          if (!timeframe || typeof timeframe !== 'string' || timeframe.trim() === '') {
            console.error(`[REFRESH-MARKET-DATA] Invalid timeframe: ${timeframe}`);
            results.push({
              symbol,
              timeframe: timeframe || 'INVALID',
              error: 'Invalid timeframe',
              success: false
            });
            continue;
          }

          console.log(`[REFRESH-MARKET-DATA] Processing ${symbol} ${timeframe}...`);
          
          // Step 3: Check what data we already have
          const { data: existingData, error: existingError } = await supabase
            .from('market_data')
            .select('open_time')
            .eq('symbol', symbol)
            .eq('timeframe', timeframe)
            .eq('exchange_type', 'bybit')
            .order('open_time', { ascending: false })
            .limit(1);

          if (existingError) {
            console.error(`[REFRESH-MARKET-DATA] Error checking existing data for ${symbol} ${timeframe}:`, existingError);
            continue;
          }

          // Determine what data to fetch
          let startTime: number;
          let limit: number;
          let fetchReason: string;

          if (!existingData || existingData.length === 0) {
            // No data exists - fetch 3 months of data
            startTime = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days ago
            limit = 2000; // Large limit for initial fetch
            fetchReason = 'INITIAL_3_MONTHS';
          } else {
            // Data exists - fetch only missing data (last 2 hours for 1m, last day for others)
            const lastCandleTime = existingData[0].open_time;
            const now = Date.now();
            const timeSinceLastCandle = now - lastCandleTime;
            
            // Calculate how much data we need based on timeframe
            const timeframeMs = getTimeframeMs(timeframe);
            const maxGapMs = timeframeMs * 2; // Allow for 2 candles gap
            
            if (timeSinceLastCandle > maxGapMs) {
              startTime = lastCandleTime;
              limit = Math.min(1000, Math.ceil(timeSinceLastCandle / timeframeMs) + 10);
              fetchReason = 'MISSING_DATA';
            } else {
              console.log(`[REFRESH-MARKET-DATA] ${symbol} ${timeframe} is up to date, skipping`);
              results.push({
                symbol,
                timeframe,
                candles: 0,
                reason: 'UP_TO_DATE',
                success: true
              });
              continue;
            }
          }

          console.log(`[REFRESH-MARKET-DATA] Fetching ${symbol} ${timeframe} (${fetchReason}): ${limit} candles from ${new Date(startTime).toISOString()}`);
          
          // Fetch data from Bybit
          const bybitInterval = BYBIT_INTERVALS[timeframe] || timeframe;
          const bybitUrl = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}&start=${startTime}`;
          
          const response = await fetch(bybitUrl);

          if (!response.ok) {
            console.error(`[REFRESH-MARKET-DATA] Failed to fetch ${symbol} ${timeframe}: ${response.statusText}`);
            results.push({
              symbol,
              timeframe,
              error: `HTTP ${response.status}`,
              success: false
            });
            continue;
          }

          const data = await response.json();

          if (data.retCode !== 0) {
            console.error(`[REFRESH-MARKET-DATA] API error for ${symbol} ${timeframe}: ${data.retMsg}`);
            results.push({
              symbol,
              timeframe,
              error: data.retMsg,
              success: false
            });
            continue;
          }

          const klines = data.result.list || [];

          if (klines.length === 0) {
            console.log(`[REFRESH-MARKET-DATA] No new data for ${symbol} ${timeframe}`);
            results.push({
              symbol,
              timeframe,
              candles: 0,
              reason: 'NO_NEW_DATA',
              success: true
            });
            continue;
          }

          // Convert to database format with validation
          const candles = klines
            .filter((k: any) => k && k.length >= 7) // Ensure kline has all required fields
            .map((k: any) => ({
              symbol: symbol || 'UNKNOWN', // Ensure symbol is never null
              timeframe: timeframe || '1h', // Ensure timeframe is never null
              exchange_type: 'bybit',
              open_time: parseInt(k[0]) || 0,
              open: parseFloat(k[1]) || 0,
              high: parseFloat(k[2]) || 0,
              low: parseFloat(k[3]) || 0,
              close: parseFloat(k[4]) || 0,
              volume: parseFloat(k[5]) || 0,
              close_time: parseInt(k[6]) || 0,
            }))
            .filter((candle: any) => 
              candle.symbol !== 'UNKNOWN' && 
              candle.open_time > 0 && 
              candle.close > 0
            ); // Filter out invalid candles

          // Validate candles before storing
          if (candles.length === 0) {
            console.log(`[REFRESH-MARKET-DATA] No valid candles for ${symbol} ${timeframe} after filtering`);
            results.push({
              symbol,
              timeframe,
              candles: 0,
              reason: 'NO_VALID_DATA',
              success: true
            });
            continue;
          }

          // Deduplicate candles before storing (remove duplicates based on symbol, timeframe, open_time)
          const seenKeys = new Set();
          const uniqueCandles = candles.filter((candle: any) => {
            const key = `${candle.symbol}-${candle.timeframe}-${candle.open_time}`;
            if (seenKeys.has(key)) {
              return false;
            }
            seenKeys.add(key);
            return true;
          });

          console.log(`[REFRESH-MARKET-DATA] Deduplicated ${candles.length} -> ${uniqueCandles.length} candles for ${symbol} ${timeframe}`);

          if (uniqueCandles.length === 0) {
            console.log(`[REFRESH-MARKET-DATA] No unique candles to insert for ${symbol} ${timeframe}`);
            results.push({
              symbol,
              timeframe,
              candles: 0,
              reason: 'NO_UNIQUE_CANDLES',
              success: true
            });
            continue;
          }

          // Store in database with batch upsert
          const { error: dbError } = await supabase
            .from('market_data')
            .upsert(uniqueCandles, { 
              onConflict: 'symbol,timeframe,open_time',
              ignoreDuplicates: false 
            });

          if (dbError) {
            console.error(`[REFRESH-MARKET-DATA] Database error for ${symbol} ${timeframe}:`, dbError);
            console.error(`[REFRESH-MARKET-DATA] Sample candle data:`, candles.slice(0, 2));
            results.push({
              symbol,
              timeframe,
              error: dbError.message,
              success: false
            });
            continue;
          }

          results.push({
            symbol,
            timeframe,
            candles: uniqueCandles.length,
            reason: fetchReason,
            success: true
          });

          console.log(`[REFRESH-MARKET-DATA] ✅ Updated ${symbol} ${timeframe}: ${uniqueCandles.length} candles (${fetchReason})`);

        } catch (error) {
          console.error(`[REFRESH-MARKET-DATA] Error processing ${symbol} ${timeframe}:`, error);
          results.push({
            symbol,
            timeframe,
            error: error instanceof Error ? error.message : String(error),
            success: false
          });
        }
      }
    }

    const successful = results.filter(r => r.success).length;
    const total = results.length;
    console.log(`[REFRESH-MARKET-DATA] ✅ Smart refresh completed: ${successful}/${total} successful`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Smart market data refresh completed',
        results,
        summary: {
          total: total,
          successful: successful,
          failed: total - successful
        },
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[REFRESH-MARKET-DATA] Global error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper function to get timeframe in milliseconds
function getTimeframeMs(timeframe: string): number {
  const unit = timeframe.slice(-1);
  const value = parseInt(timeframe.slice(0, -1));
  
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 60 * 1000; // Default to 1 minute
  }
}
