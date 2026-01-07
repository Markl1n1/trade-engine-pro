import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Scheduled Backtest Runner
 * 
 * Runs daily at 13:30 UTC (8:30 AM NY, 1 hour before market open)
 * Executes backtests for all active/draft strategies sequentially
 * with 2-minute intervals between each backtest.
 * 
 * Results are stored in scheduled_backtest_runs table for AI analysis.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const runDate = new Date().toISOString().split('T')[0];
  const triggerType = req.headers.get('x-trigger-type') || 'scheduled';
  
  console.log(`[SCHEDULED-BACKTEST] ═══════════════════════════════════════════════════════`);
  console.log(`[SCHEDULED-BACKTEST] Starting scheduled backtest run for ${runDate}`);
  console.log(`[SCHEDULED-BACKTEST] Trigger: ${triggerType}`);
  console.log(`[SCHEDULED-BACKTEST] ═══════════════════════════════════════════════════════`);

  try {
    // Check if already ran today (prevent duplicates)
    const { data: existingRuns } = await supabaseClient
      .from('scheduled_backtest_runs')
      .select('id')
      .eq('run_date', runDate)
      .eq('trigger_type', 'scheduled')
      .limit(1);

    if (existingRuns && existingRuns.length > 0 && triggerType === 'scheduled') {
      console.log(`[SCHEDULED-BACKTEST] Already ran today, skipping`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Already ran today',
          skipped: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all active/draft strategies
    const { data: strategies, error: stratError } = await supabaseClient
      .from('strategies')
      .select('id, name, user_id, symbol, timeframe, strategy_type, stop_loss_percent, take_profit_percent, trailing_stop_percent, position_size_percent, initial_capital')
      .in('status', ['active', 'draft'])
      .order('created_at', { ascending: true });

    if (stratError) {
      throw new Error(`Failed to fetch strategies: ${stratError.message}`);
    }

    if (!strategies || strategies.length === 0) {
      console.log(`[SCHEDULED-BACKTEST] No active/draft strategies found`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No strategies to backtest',
          total: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SCHEDULED-BACKTEST] Found ${strategies.length} strategies to backtest`);

    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const results: any[] = [];
    const INTERVAL_MS = 120000; // 2 minutes between backtests

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      console.log(`[SCHEDULED-BACKTEST] [${i + 1}/${strategies.length}] Processing: ${strategy.name}`);

      // Create pending record
      const { data: pendingRun, error: insertError } = await supabaseClient
        .from('scheduled_backtest_runs')
        .insert({
          run_date: runDate,
          strategy_id: strategy.id,
          strategy_name: strategy.name,
          trigger_type: triggerType,
          status: 'running',
          started_at: new Date().toISOString(),
          backtest_params: {
            start_date: startDateStr,
            end_date: endDateStr,
            initial_balance: strategy.initial_capital || 10000,
            stop_loss_percent: strategy.stop_loss_percent,
            take_profit_percent: strategy.take_profit_percent,
            trailing_stop_percent: strategy.trailing_stop_percent,
            leverage: 5,
            product_type: 'futures'
          }
        })
        .select()
        .single();

      if (insertError) {
        console.error(`[SCHEDULED-BACKTEST] Failed to create run record:`, insertError);
        continue;
      }

      try {
        // Call the run-backtest function
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        
        const backtestResponse = await fetch(`${supabaseUrl}/functions/v1/run-backtest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            strategyId: strategy.id,
            startDate: startDateStr,
            endDate: endDateStr,
            initialBalance: strategy.initial_capital || 10000,
            stopLossPercent: strategy.stop_loss_percent,
            takeProfitPercent: strategy.take_profit_percent,
            trailingStopPercent: strategy.trailing_stop_percent,
            leverage: 5,
            productType: 'futures',
            executionTiming: 'close'
          })
        });

        const backtestResult = await backtestResponse.json();

        if (backtestResult.success) {
          // Extract summary log from results
          const resultData = backtestResult.results || backtestResult;
          
          const summaryLog = `📊 BACKTEST SUMMARY | Strategy: ${strategy.name} | Type: ${strategy.strategy_type || 'standard'} | Symbol: ${strategy.symbol} | TF: ${strategy.timeframe} | SL: ${strategy.stop_loss_percent || 2}% | TP: ${strategy.take_profit_percent || 4}% | Trailing: ${strategy.trailing_stop_percent || 0}% | Leverage: 5x | Product: futures | Return: ${resultData.total_return?.toFixed(2) || 0}% | Win Rate: ${resultData.win_rate?.toFixed(1) || 0}% | Max DD: ${resultData.max_drawdown?.toFixed(2) || 0}% | PF: ${resultData.profit_factor?.toFixed(2) || 0} | Trades: ${resultData.total_trades || 0} (W:${resultData.winning_trades || 0}/L:${resultData.losing_trades || 0}) | Final: $${resultData.final_balance?.toFixed(2) || 0}`;

          // Update run record with success
          await supabaseClient
            .from('scheduled_backtest_runs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              results: resultData,
              summary_log: summaryLog
            })
            .eq('id', pendingRun.id);

          console.log(`[SCHEDULED-BACKTEST] ✅ ${strategy.name}: ${summaryLog}`);

          results.push({
            strategy_name: strategy.name,
            success: true,
            total_return: resultData.total_return,
            win_rate: resultData.win_rate,
            summary_log: summaryLog
          });
        } else {
          throw new Error(backtestResult.error || 'Backtest failed');
        }
      } catch (error: any) {
        console.error(`[SCHEDULED-BACKTEST] ❌ ${strategy.name} failed:`, error.message);

        // Update run record with failure
        await supabaseClient
          .from('scheduled_backtest_runs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error.message
          })
          .eq('id', pendingRun.id);

        results.push({
          strategy_name: strategy.name,
          success: false,
          error: error.message
        });
      }

      // Wait 2 minutes between backtests (except for the last one)
      if (i < strategies.length - 1) {
        console.log(`[SCHEDULED-BACKTEST] Waiting ${INTERVAL_MS / 1000}s before next backtest...`);
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
      }
    }

    // Generate overall summary
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[SCHEDULED-BACKTEST] ═══════════════════════════════════════════════════════`);
    console.log(`[SCHEDULED-BACKTEST] COMPLETED: ${successCount}/${strategies.length} successful, ${failCount} failed`);
    console.log(`[SCHEDULED-BACKTEST] ═══════════════════════════════════════════════════════`);

    return new Response(
      JSON.stringify({
        success: true,
        run_date: runDate,
        total_strategies: strategies.length,
        successful: successCount,
        failed: failCount,
        results: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error(`[SCHEDULED-BACKTEST] Fatal error:`, error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
