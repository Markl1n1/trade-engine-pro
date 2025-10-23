import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

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

    console.log('[LOAD-MARKET-DATA] Fetching user trading pairs...');

    // Get unique symbols from user_trading_pairs table
    const { data: tradingPairsData, error: pairsError } = await supabase
      .from('user_trading_pairs')
      .select('symbol')
      .order('symbol');

    if (pairsError) {
      console.error('[LOAD-MARKET-DATA] Error fetching trading pairs:', pairsError);
      throw new Error(`Failed to fetch trading pairs: ${pairsError.message}`);
    }

    // Extract unique symbols
    const userSymbols = [...new Set((tradingPairsData || []).map(p => p.symbol))];

    // Fallback to default symbols if no trading pairs configured
    const SYMBOLS_TO_FETCH = userSymbols.length > 0 
      ? userSymbols 
      : ['BTCUSDT', 'ETHUSDT'];

    console.log(`[LOAD-MARKET-DATA] Found ${SYMBOLS_TO_FETCH.length} trading pairs to fetch: ${SYMBOLS_TO_FETCH.join(', ')}`);

    const results = [];
    let totalCandles = 0;

    // Process all symbol-timeframe combinations
    for (const symbol of SYMBOLS_TO_FETCH) {
      console.log(`[LOAD-MARKET-DATA] Starting processing for symbol: ${symbol}`);
      for (const timeframe of TIMEFRAMES) {
        try {
          console.log(`[LOAD-MARKET-DATA] Processing ${symbol} ${timeframe}...`);
          
          // Check what data we already have
          const { data: existingData, error: existingError } = await supabase
            .from('market_data')
            .select('open_time')
            .eq('symbol', symbol)
            .eq('timeframe', timeframe)
            .eq('exchange_type', 'bybit')
            .order('open_time', { ascending: false })
            .limit(1);

          if (existingError) {
            console.error(`[LOAD-MARKET-DATA] Error checking existing data for ${symbol} ${timeframe}:`, existingError);
            continue;
          }

          console.log(`[LOAD-MARKET-DATA] Existing data check for ${symbol} ${timeframe}:`, {
            hasData: existingData && existingData.length > 0,
            lastCandleTime: existingData?.[0]?.open_time,
            lastCandleDate: existingData?.[0]?.open_time ? new Date(existingData[0].open_time).toISOString() : null
          });

          // Determine what data to fetch
          let startTime: number;
          let limit: number;
          let fetchReason: string;

          if (!existingData || existingData.length === 0) {
            // No data exists - fetch 3 months of HISTORICAL data (not future)
            const now = Date.now();
            startTime = now - (90 * 24 * 60 * 60 * 1000); // 90 days ago from NOW
            limit = 2000; // Large limit for initial fetch
            fetchReason = 'INITIAL_3_MONTHS';
            console.log(`[LOAD-MARKET-DATA] No existing data for ${symbol} ${timeframe}, fetching 3 months`);
          } else {
            // Data exists - check if we need to fetch missing data
            const lastCandleTime = existingData[0].open_time;
            const now = Date.now();
            const timeSinceLastCandle = now - lastCandleTime;
            
            // Calculate how much data we need based on timeframe
            const timeframeMs = getTimeframeMs(timeframe);
            const maxGapMs = timeframeMs * 10; // Allow for 10 candles gap (more conservative)
            
            console.log(`[LOAD-MARKET-DATA] Time gap analysis for ${symbol} ${timeframe}:`, {
              lastCandleTime: lastCandleTime,
              lastCandleDate: new Date(lastCandleTime).toISOString(),
              now: now,
              nowDate: new Date(now).toISOString(),
              timeSinceLastCandle: timeSinceLastCandle,
              timeframeMs: timeframeMs,
              maxGapMs: maxGapMs,
              needsUpdate: timeSinceLastCandle > maxGapMs
            });
            
            if (timeSinceLastCandle > maxGapMs) {
              startTime = lastCandleTime;
              limit = Math.min(500, Math.ceil(timeSinceLastCandle / timeframeMs) + 5); // Smaller limit for updates
              fetchReason = 'MISSING_DATA';
              console.log(`[LOAD-MARKET-DATA] ${symbol} ${timeframe} needs update, fetching ${limit} candles from ${new Date(startTime).toISOString()}`);
            } else {
              console.log(`[LOAD-MARKET-DATA] ${symbol} ${timeframe} is up to date, skipping`);
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

          console.log(`[LOAD-MARKET-DATA] Fetching ${symbol} ${timeframe} (${fetchReason}): ${limit} candles from ${new Date(startTime).toISOString()}`);
          
          // Fetch data from Bybit with pagination
          const bybitInterval = BYBIT_INTERVALS[timeframe] || timeframe;
          const maxCandlesPerRequest = 1000; // Bybit API limit
          let allKlines: any[] = [];
          let currentStartTime = startTime;
          let totalFetched = 0;
          let requestCount = 0;
          const maxRequests = Math.ceil(limit / maxCandlesPerRequest) + 2; // Safety buffer
          
          console.log(`[LOAD-MARKET-DATA] Starting paginated fetch for ${symbol} ${timeframe}, max requests: ${maxRequests}`);
          
          // Try different categories for different symbols
          let category = 'linear';
          if (symbol === 'XRPUSDT' || symbol === 'DOGEUSDT' || symbol === 'SOLUSDT') {
            category = 'spot'; // Use spot for these symbols
            console.log(`[LOAD-MARKET-DATA] Using spot category for ${symbol}`);
          }
          
          while (totalFetched < limit && requestCount < maxRequests) {
            const bybitUrl = `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${symbol}&interval=${bybitInterval}&limit=${maxCandlesPerRequest}&start=${currentStartTime}`;
            
            console.log(`[LOAD-MARKET-DATA] Request ${requestCount + 1}/${maxRequests}: ${bybitUrl}`);
            const response = await fetch(bybitUrl);
            
            console.log(`[LOAD-MARKET-DATA] Response status for ${symbol} ${timeframe}: ${response.status} ${response.statusText}`);

            if (!response.ok) {
              console.error(`[LOAD-MARKET-DATA] Failed to fetch ${symbol} ${timeframe} (request ${requestCount + 1}): ${response.statusText}`);
              break; // Exit pagination loop on error
            }

            const data = await response.json();
            
            console.log(`[LOAD-MARKET-DATA] API response for ${symbol} ${timeframe}: retCode=${data.retCode}, retMsg=${data.retMsg}, listLength=${data.result?.list?.length || 0}`);

            if (data.retCode !== 0) {
              console.error(`[LOAD-MARKET-DATA] API error for ${symbol} ${timeframe} (request ${requestCount + 1}): ${data.retMsg}`);
              break; // Exit pagination loop on API error
            }

            const klines = data.result.list || [];
            requestCount++;

            if (klines.length === 0) {
              console.log(`[LOAD-MARKET-DATA] No more data for ${symbol} ${timeframe} (request ${requestCount})`);
              break; // No more data available
            }

            // Add klines to our collection
            allKlines.push(...klines);
            totalFetched += klines.length;
            
            console.log(`[LOAD-MARKET-DATA] Fetched ${klines.length} candles (total: ${totalFetched}/${limit}) for ${symbol} ${timeframe}`);
            
            // Update start time for next request (use the last candle's time + 1ms)
            if (klines.length > 0) {
              const lastKline = klines[klines.length - 1];
              currentStartTime = parseInt(lastKline[0]) + 1; // Move to next millisecond
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          if (allKlines.length === 0) {
            console.log(`[LOAD-MARKET-DATA] No data fetched for ${symbol} ${timeframe}`);
            results.push({
              symbol,
              timeframe,
              candles: 0,
              reason: 'NO_DATA_FETCHED',
              success: true
            });
            continue;
          }

          // Convert to database format with validation
          const candles = allKlines
            .filter((k: any) => k && k.length >= 7) // Ensure kline has all required fields
            .map((k: any) => ({
              symbol: symbol.trim(), // Ensure no whitespace
              timeframe: timeframe.trim(), // Ensure no whitespace
              exchange_type: category === 'spot' ? 'bybit_spot' : 'bybit',
              open_time: parseInt(k[0]) || 0,
              open: parseFloat(k[1]) || 0,
              high: parseFloat(k[2]) || 0,
              low: parseFloat(k[3]) || 0,
              close: parseFloat(k[4]) || 0,
              volume: parseFloat(k[5]) || 0,
              close_time: parseInt(k[6]) || (parseInt(k[0]) + 60000), // Fallback close_time
            }))
            .filter((candle: any) => 
              candle.symbol && 
              candle.timeframe &&
              candle.open_time > 0 && 
              candle.close > 0
            ); // Filter out invalid candles

          // Validate candles before storing
          if (candles.length === 0) {
            console.log(`[LOAD-MARKET-DATA] No valid candles for ${symbol} ${timeframe} after filtering`);
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

          console.log(`[LOAD-MARKET-DATA] Deduplicated ${candles.length} -> ${uniqueCandles.length} candles for ${symbol} ${timeframe}`);

          // Store in database with batch upsert to avoid conflicts
          let insertCount = 0;
          let errorCount = 0;
          
          if (uniqueCandles.length === 0) {
            console.log(`[LOAD-MARKET-DATA] No unique candles to insert for ${symbol} ${timeframe}`);
            results.push({
              symbol,
              timeframe,
              candles: 0,
              reason: 'NO_UNIQUE_CANDLES',
              success: true
            });
            continue;
          }
          
          try {
            // Use batch upsert to avoid individual conflict issues
            const { data: upsertData, error: upsertError } = await supabase
              .from('market_data')
              .upsert(uniqueCandles, { 
                onConflict: 'symbol,timeframe,open_time',
                ignoreDuplicates: false 
              });
            
            if (upsertError) {
              console.warn(`[LOAD-MARKET-DATA] Batch upsert error for ${symbol} ${timeframe}:`, upsertError.message);
              errorCount = uniqueCandles.length;
            } else {
              insertCount = uniqueCandles.length;
            }
          } catch (err) {
            console.warn(`[LOAD-MARKET-DATA] Batch upsert exception for ${symbol} ${timeframe}:`, err);
            errorCount = uniqueCandles.length;
          }

          const dbError = errorCount > 0 ? new Error(`${errorCount} insert errors`) : null;

          if (dbError) {
            console.error(`[LOAD-MARKET-DATA] Database error for ${symbol} ${timeframe}:`, dbError);
            results.push({
              symbol,
              timeframe,
              error: dbError.message,
              success: false
            });
            continue;
          }

          totalCandles += insertCount;
          results.push({
            symbol,
            timeframe,
            candles: insertCount,
            errors: errorCount,
            reason: fetchReason,
            success: true
          });

          // Calculate date range for logging
          const startDateTime = new Date(Math.min(...candles.map((c: any) => c.open_time))).toISOString();
          const endDateTime = new Date(Math.max(...candles.map((c: any) => c.open_time))).toISOString();

          console.log(`[MONITOR] ${symbol} | ${timeframe} | ${startDateTime} - ${endDateTime}`);
          console.log(`[LOAD-MARKET-DATA] ✅ Updated ${symbol} ${timeframe}: ${candles.length} candles (${fetchReason}) - ${requestCount} requests made`);

        } catch (error) {
          console.error(`[LOAD-MARKET-DATA] Error processing ${symbol} ${timeframe}:`, error);
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
    console.log(`[LOAD-MARKET-DATA] ✅ Comprehensive loading completed: ${successful}/${total} successful, ${totalCandles} total candles`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Comprehensive market data loading completed',
        results,
        summary: {
          total: total,
          successful: successful,
          failed: total - successful,
          totalCandles: totalCandles
        },
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[LOAD-MARKET-DATA] Global error:', error);
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
