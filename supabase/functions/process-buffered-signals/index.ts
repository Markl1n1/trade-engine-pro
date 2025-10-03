import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface BufferedSignal {
  id: string;
  user_id: string;
  strategy_id: string;
  symbol: string;
  signal_type: string;
  price: number;
  candle_timestamp: number;
  reason: string | null;
  buffered_at: string;
}

async function insertSignalWithRetry(
  supabase: any,
  signal: BufferedSignal,
  maxRetries = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { error } = await supabase
        .from('strategy_signals')
        .insert({
          user_id: signal.user_id,
          strategy_id: signal.strategy_id,
          symbol: signal.symbol,
          signal_type: signal.signal_type,
          price: signal.price,
          reason: signal.reason,
          status: 'pending',
        });

      if (!error) {
        console.log(`[BUFFER-PROCESSOR] ✅ Successfully inserted signal ${signal.id} on attempt ${attempt + 1}`);
        return true;
      }

      console.log(`[BUFFER-PROCESSOR] ⚠️ Attempt ${attempt + 1} failed for signal ${signal.id}:`, error.message);
      
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (err) {
      console.error(`[BUFFER-PROCESSOR] ❌ Exception on attempt ${attempt + 1}:`, err);
      if (attempt === maxRetries - 1) return false;
    }
  }
  
  return false;
}

Deno.serve(async (req) => {
  try {
    console.log('[BUFFER-PROCESSOR] 🔄 Starting buffered signal processing');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query unprocessed buffered signals (older than 30 seconds to avoid race conditions)
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
    const { data: bufferedSignals, error: fetchError } = await supabase
      .from('signal_buffer')
      .select('*')
      .eq('processed', false)
      .lt('buffered_at', thirtySecondsAgo)
      .order('buffered_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      console.error('[BUFFER-PROCESSOR] ❌ Error fetching buffered signals:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }

    if (!bufferedSignals || bufferedSignals.length === 0) {
      console.log('[BUFFER-PROCESSOR] ✅ No buffered signals to process');
      return new Response(JSON.stringify({ message: 'No signals to process', processed: 0 }), { status: 200 });
    }

    console.log(`[BUFFER-PROCESSOR] 📦 Found ${bufferedSignals.length} buffered signals to process`);

    let successCount = 0;
    let failureCount = 0;

    // Process each buffered signal
    for (const signal of bufferedSignals) {
      // Check if signal is too old (>24 hours) - mark as expired
      const signalAge = Date.now() - new Date(signal.buffered_at).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (signalAge > maxAge) {
        console.log(`[BUFFER-PROCESSOR] ⏰ Signal ${signal.id} expired (age: ${Math.round(signalAge / 3600000)}h)`);
        
        await supabase
          .from('signal_buffer')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('id', signal.id);
        
        failureCount++;
        continue;
      }

      // Try to insert into strategy_signals
      const success = await insertSignalWithRetry(supabase, signal);

      if (success) {
        // Mark as processed
        await supabase
          .from('signal_buffer')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('id', signal.id);
        
        successCount++;
        console.log(`[BUFFER-PROCESSOR] ✅ Processed signal ${signal.id} for ${signal.symbol} ${signal.signal_type}`);
      } else {
        failureCount++;
        console.log(`[BUFFER-PROCESSOR] ❌ Failed to process signal ${signal.id} after retries`);
      }
    }

    // Cleanup old processed signals (>7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: cleanupError } = await supabase
      .from('signal_buffer')
      .delete()
      .eq('processed', true)
      .lt('processed_at', sevenDaysAgo);

    if (cleanupError) {
      console.error('[BUFFER-PROCESSOR] ⚠️ Cleanup error:', cleanupError);
    } else {
      console.log('[BUFFER-PROCESSOR] 🧹 Cleaned up old processed signals');
    }

    const result = {
      message: 'Buffer processing complete',
      total: bufferedSignals.length,
      successful: successCount,
      failed: failureCount,
      timestamp: new Date().toISOString(),
    };

    console.log('[BUFFER-PROCESSOR] ✅ Complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[BUFFER-PROCESSOR] ❌ Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});
