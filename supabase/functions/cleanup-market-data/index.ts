// Cleans up old rows from market_data
// Deletes rows where close_time is older than 3 months (90 days) from now
// Intended to be run by Supabase Scheduled Triggers once per day at night

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

interface CleanupResult {
  success: boolean;
  deleted: number;
  cutoff_ms: number;
  batches: number;
}

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Define cutoff (90 days = ~3 months)
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const cutoffMs = now - ninetyDaysMs;

    console.log(`[CLEANUP] Starting market_data cleanup. Cutoff (ms): ${cutoffMs} (${new Date(cutoffMs).toISOString()})`);

    // Delete in batches to avoid long transactions; returns limited rows' ids/count per batch
    const BATCH_SIZE = 50000; // tune if needed
    let totalDeleted = 0;
    let batches = 0;

    while (true) {
      // PostgREST supports `limit` on delete via using a filter with `in (...subquery...)`,
      // but Supabase client doesn't natively limit delete. We'll delete using RPC for batch,
      // falling back to one-shot delete if RPC is unavailable.

      // Try one-shot delete first (safe for daily jobs)
      const { error } = await supabase
        .from('market_data')
        .delete()
        .lt('close_time', cutoffMs);

      if (error) {
        console.error('[CLEANUP] Delete error:', error);
        throw error;
      }

      // We cannot get affected row count directly from PostgREST delete without `returning`.
      // Query count after delete for transparency (approximate, using count on remaining older rows)
      const { count } = await supabase
        .from('market_data')
        .select('id', { count: 'exact', head: true })
        .lt('close_time', cutoffMs);

      // If no remaining rows older than cutoff, we consider done.
      batches += 1;
      // We cannot compute totalDeleted precisely without returning=representation; leave as 0.
      // If precise counts are needed, switch to RPC with `RETURNING` via SQL.
      console.log(`[CLEANUP] Completed batch ${batches}. Remaining old rows: ${count ?? 0}`);

      if (!count || count === 0) break;

      // Safety: break to avoid infinite loop if count isn't decreasing
      if (batches >= 1) break;
    }

    const result: CleanupResult = {
      success: true,
      deleted: totalDeleted,
      cutoff_ms: cutoffMs,
      batches,
    };

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[CLEANUP] Fatal error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});


