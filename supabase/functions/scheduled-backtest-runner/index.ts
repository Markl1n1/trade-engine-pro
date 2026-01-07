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
 * Sends PDF report to Telegram after completion.
 */

// Generate PDF content as base64
async function generateBacktestPDF(results: any[], runDate: string): Promise<string> {
  // Create simple text-based PDF content
  const header = `DAILY BACKTEST REPORT\n${'='.repeat(50)}\nDate: ${runDate}\nGenerated: ${new Date().toISOString()}\n\n`;
  
  let content = header;
  content += `SUMMARY\n${'-'.repeat(50)}\n`;
  content += `Total Strategies: ${results.length}\n`;
  content += `Successful: ${results.filter(r => r.success).length}\n`;
  content += `Failed: ${results.filter(r => !r.success).length}\n\n`;
  
  content += `STRATEGY RESULTS\n${'='.repeat(50)}\n\n`;
  
  for (const result of results) {
    if (result.success) {
      content += `📊 ${result.strategy_name}\n`;
      content += `   Return: ${result.total_return?.toFixed(2) || 'N/A'}%\n`;
      content += `   Win Rate: ${result.win_rate?.toFixed(1) || 'N/A'}%\n`;
      content += `   Max DD: ${result.max_drawdown?.toFixed(2) || 'N/A'}%\n`;
      content += `   Profit Factor: ${result.profit_factor?.toFixed(2) || 'N/A'}\n`;
      content += `   Trades: ${result.total_trades || 0} (W:${result.winning_trades || 0}/L:${result.losing_trades || 0})\n`;
      content += `   Final Balance: $${result.final_balance?.toFixed(2) || 'N/A'}\n`;
      content += `\n`;
    } else {
      content += `❌ ${result.strategy_name}\n`;
      content += `   ERROR: ${result.error}\n\n`;
    }
  }
  
  content += `\n${'='.repeat(50)}\n`;
  content += `End of Report\n`;
  
  // Encode as base64 for sending as document
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const base64 = btoa(String.fromCharCode(...data));
  
  return base64;
}

// Send PDF report to Telegram
async function sendTelegramPDFReport(
  botToken: string,
  chatId: string,
  results: any[],
  runDate: string
): Promise<boolean> {
  try {
    // First send a summary message
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    // Build detailed summary for message
    let summaryMessage = `📊 *DAILY BACKTEST REPORT*\n`;
    summaryMessage += `📅 Date: ${runDate}\n\n`;
    summaryMessage += `✅ Successful: ${successCount}\n`;
    summaryMessage += `❌ Failed: ${failCount}\n\n`;
    summaryMessage += `${'─'.repeat(30)}\n\n`;
    
    // Sort by return (best first)
    const sortedResults = [...results]
      .filter(r => r.success)
      .sort((a, b) => (b.total_return || 0) - (a.total_return || 0));
    
    for (const result of sortedResults) {
      const returnEmoji = (result.total_return || 0) >= 0 ? '📈' : '📉';
      summaryMessage += `${returnEmoji} *${result.strategy_name}*\n`;
      summaryMessage += `   Return: ${result.total_return?.toFixed(2) || 'N/A'}%\n`;
      summaryMessage += `   Win Rate: ${result.win_rate?.toFixed(1) || 'N/A'}%\n`;
      summaryMessage += `   PF: ${result.profit_factor?.toFixed(2) || 'N/A'}\n`;
      summaryMessage += `   Trades: ${result.total_trades || 0}\n\n`;
    }
    
    // Add failed strategies
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      summaryMessage += `\n❌ *Failed Strategies:*\n`;
      for (const result of failedResults) {
        summaryMessage += `• ${result.strategy_name}: ${result.error}\n`;
      }
    }
    
    summaryMessage += `\n⏰ Generated: ${new Date().toLocaleString()}`;
    
    // Send summary message
    const messageResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: summaryMessage,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    
    if (!messageResponse.ok) {
      const errorData = await messageResponse.json();
      console.error('[SCHEDULED-BACKTEST] Telegram message error:', errorData);
      return false;
    }
    
    // Now send the detailed report as a document
    const reportContent = await generateBacktestReportText(results, runDate);
    const fileName = `backtest_report_${runDate}.txt`;
    
    // Create form data with the file
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', `📎 Detailed Backtest Report - ${runDate}`);
    formData.append('document', new Blob([reportContent], { type: 'text/plain' }), fileName);
    
    const docResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    
    if (!docResponse.ok) {
      const errorData = await docResponse.json();
      console.error('[SCHEDULED-BACKTEST] Telegram document error:', errorData);
      // Still return true if message was sent successfully
      return true;
    }
    
    console.log('[SCHEDULED-BACKTEST] Telegram report sent successfully');
    return true;
  } catch (error) {
    console.error('[SCHEDULED-BACKTEST] Error sending Telegram report:', error);
    return false;
  }
}

// Generate detailed report text
async function generateBacktestReportText(results: any[], runDate: string): Promise<string> {
  let report = `DAILY BACKTEST REPORT\n`;
  report += `${'='.repeat(60)}\n`;
  report += `Date: ${runDate}\n`;
  report += `Generated: ${new Date().toISOString()}\n`;
  report += `${'='.repeat(60)}\n\n`;
  
  report += `SUMMARY\n`;
  report += `${'-'.repeat(60)}\n`;
  report += `Total Strategies: ${results.length}\n`;
  report += `Successful: ${results.filter(r => r.success).length}\n`;
  report += `Failed: ${results.filter(r => !r.success).length}\n\n`;
  
  // Calculate overall statistics
  const successfulResults = results.filter(r => r.success);
  if (successfulResults.length > 0) {
    const avgReturn = successfulResults.reduce((sum, r) => sum + (r.total_return || 0), 0) / successfulResults.length;
    const avgWinRate = successfulResults.reduce((sum, r) => sum + (r.win_rate || 0), 0) / successfulResults.length;
    const totalTrades = successfulResults.reduce((sum, r) => sum + (r.total_trades || 0), 0);
    
    report += `Average Return: ${avgReturn.toFixed(2)}%\n`;
    report += `Average Win Rate: ${avgWinRate.toFixed(1)}%\n`;
    report += `Total Trades: ${totalTrades}\n\n`;
  }
  
  report += `\nDETAILED RESULTS\n`;
  report += `${'='.repeat(60)}\n\n`;
  
  // Sort by return
  const sortedResults = [...results].sort((a, b) => {
    if (!a.success) return 1;
    if (!b.success) return -1;
    return (b.total_return || 0) - (a.total_return || 0);
  });
  
  for (let i = 0; i < sortedResults.length; i++) {
    const result = sortedResults[i];
    const rank = i + 1;
    
    report += `#${rank} ${result.strategy_name}\n`;
    report += `${'-'.repeat(40)}\n`;
    
    if (result.success) {
      report += `  Status: SUCCESS\n`;
      report += `  Return: ${result.total_return?.toFixed(2) || 'N/A'}%\n`;
      report += `  Win Rate: ${result.win_rate?.toFixed(1) || 'N/A'}%\n`;
      report += `  Max Drawdown: ${result.max_drawdown?.toFixed(2) || 'N/A'}%\n`;
      report += `  Profit Factor: ${result.profit_factor?.toFixed(2) || 'N/A'}\n`;
      report += `  Total Trades: ${result.total_trades || 0}\n`;
      report += `  Winning Trades: ${result.winning_trades || 0}\n`;
      report += `  Losing Trades: ${result.losing_trades || 0}\n`;
      report += `  Final Balance: $${result.final_balance?.toFixed(2) || 'N/A'}\n`;
      
      if (result.summary_log) {
        report += `\n  Summary Log:\n`;
        report += `  ${result.summary_log}\n`;
      }
    } else {
      report += `  Status: FAILED\n`;
      report += `  Error: ${result.error}\n`;
    }
    
    report += `\n`;
  }
  
  report += `${'='.repeat(60)}\n`;
  report += `END OF REPORT\n`;
  
  return report;
}

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
            max_drawdown: resultData.max_drawdown,
            profit_factor: resultData.profit_factor,
            total_trades: resultData.total_trades,
            winning_trades: resultData.winning_trades,
            losing_trades: resultData.losing_trades,
            final_balance: resultData.final_balance,
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

    // Send Telegram report to all users who have Telegram enabled
    // Get unique user IDs from strategies
    const userIds = [...new Set(strategies.map(s => s.user_id))];
    
    for (const userId of userIds) {
      // Get user's Telegram settings
      const { data: userSettings, error: settingsError } = await supabaseClient
        .from('user_settings')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled')
        .eq('user_id', userId)
        .single();
      
      if (settingsError || !userSettings) {
        console.log(`[SCHEDULED-BACKTEST] No user settings found for user ${userId}`);
        continue;
      }
      
      if (!userSettings.telegram_enabled || !userSettings.telegram_bot_token || !userSettings.telegram_chat_id) {
        console.log(`[SCHEDULED-BACKTEST] Telegram not configured for user ${userId}`);
        continue;
      }
      
      // Filter results for this user's strategies
      const userStrategies = strategies.filter(s => s.user_id === userId);
      const userStrategyNames = userStrategies.map(s => s.name);
      const userResults = results.filter(r => userStrategyNames.includes(r.strategy_name));
      
      if (userResults.length === 0) {
        console.log(`[SCHEDULED-BACKTEST] No results for user ${userId}`);
        continue;
      }
      
      // Send Telegram report
      const telegramSent = await sendTelegramPDFReport(
        userSettings.telegram_bot_token,
        userSettings.telegram_chat_id,
        userResults,
        runDate
      );
      
      if (telegramSent) {
        console.log(`[SCHEDULED-BACKTEST] ✅ Telegram report sent to user ${userId}`);
      } else {
        console.log(`[SCHEDULED-BACKTEST] ❌ Failed to send Telegram report to user ${userId}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        run_date: runDate,
        total_strategies: strategies.length,
        successful: successCount,
        failed: failCount,
        telegram_sent: true,
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
