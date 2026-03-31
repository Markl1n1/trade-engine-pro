import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchPublicKlines, UnifiedCandle } from "../helpers/exchange-api.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignalToVerify {
  id: string;
  strategy_id: string;
  user_id: string;
  symbol: string;
  signal_type: string;
  price: number;
  created_at: string;
  reason: string | null;
  strategy: {
    stop_loss_percent: number | null;
    take_profit_percent: number | null;
    name: string;
  };
}

interface VerificationResult {
  signal_id: string;
  strategy_id: string;
  user_id: string;
  symbol: string;
  signal_type: string;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  signal_time: string;
  outcome: 'tp_hit' | 'sl_hit' | 'timeout';
  exit_price: number;
  pnl_percent: number;
  max_favorable: number;
  max_adverse: number;
  time_to_exit_minutes: number;
  candles_checked: number;
  verification_period_hours: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[VERIFY-SIGNALS] Starting signal verification...');

    // Get signals from 24-48h ago (gives trades time to resolve)
    const now = new Date();
    const ago48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get signals that haven't been verified yet
    const { data: signals, error: sigError } = await supabase
      .from('strategy_signals')
      .select('id, strategy_id, user_id, symbol, signal_type, price, created_at, reason')
      .gte('created_at', ago48h.toISOString())
      .lte('created_at', ago24h.toISOString())
      .order('created_at', { ascending: true });

    if (sigError) {
      console.error('[VERIFY-SIGNALS] Error fetching signals:', sigError);
      throw sigError;
    }

    if (!signals || signals.length === 0) {
      console.log('[VERIFY-SIGNALS] No signals to verify');
      return new Response(JSON.stringify({ success: true, verified: 0, message: 'No signals to verify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which signals are already verified
    const signalIds = signals.map(s => s.id);
    const { data: existingVerifications } = await supabase
      .from('signal_verifications')
      .select('signal_id')
      .in('signal_id', signalIds);

    const alreadyVerified = new Set((existingVerifications || []).map(v => v.signal_id));
    const unverifiedSignals = signals.filter(s => !alreadyVerified.has(s.id));

    if (unverifiedSignals.length === 0) {
      console.log('[VERIFY-SIGNALS] All signals already verified');
      return new Response(JSON.stringify({ success: true, verified: 0, message: 'All signals already verified' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get strategy configs for SL/TP
    const strategyIds = [...new Set(unverifiedSignals.map(s => s.strategy_id))];
    const { data: strategies } = await supabase
      .from('strategies')
      .select('id, name, stop_loss_percent, take_profit_percent')
      .in('id', strategyIds);

    const strategyMap = new Map((strategies || []).map(s => [s.id, s]));

    const results: VerificationResult[] = [];
    let tpHit = 0, slHit = 0, timeout = 0;

    for (const signal of unverifiedSignals) {
      try {
        const strategy = strategyMap.get(signal.strategy_id);
        if (!strategy) {
          console.warn(`[VERIFY-SIGNALS] Strategy not found for signal ${signal.id}`);
          continue;
        }

        const slPercent = strategy.stop_loss_percent || 2;
        const tpPercent = strategy.take_profit_percent || 3;
        const isLong = signal.signal_type === 'BUY' || signal.signal_type === 'LONG';
        const entryPrice = Number(signal.price);

        const stopLoss = isLong
          ? entryPrice * (1 - slPercent / 100)
          : entryPrice * (1 + slPercent / 100);
        const takeProfit = isLong
          ? entryPrice * (1 + tpPercent / 100)
          : entryPrice * (1 - tpPercent / 100);

        // Fetch 1m candles for 24h after signal (1440 candles)
        // Bybit max limit is 1000, so we fetch in batches
        const signalTime = new Date(signal.created_at).getTime();
        let allCandles: UnifiedCandle[] = [];

        try {
          const candles = await fetchPublicKlines('bybit', signal.symbol, '5m', 300, false);
          // Filter candles after signal time
          allCandles = candles.filter(c => c.timestamp >= signalTime).sort((a, b) => a.timestamp - b.timestamp);
        } catch (fetchErr) {
          console.error(`[VERIFY-SIGNALS] Failed to fetch klines for ${signal.symbol}:`, fetchErr);
          continue;
        }

        if (allCandles.length === 0) {
          console.warn(`[VERIFY-SIGNALS] No candles after signal time for ${signal.symbol}`);
          continue;
        }

        // Simulate trade
        let outcome: 'tp_hit' | 'sl_hit' | 'timeout' = 'timeout';
        let exitPrice = allCandles[allCandles.length - 1].close;
        let maxFavorable = 0;
        let maxAdverse = 0;
        let exitCandleIndex = allCandles.length - 1;

        for (let i = 0; i < allCandles.length; i++) {
          const candle = allCandles[i];

          if (isLong) {
            const favorableMove = ((candle.high - entryPrice) / entryPrice) * 100;
            const adverseMove = ((entryPrice - candle.low) / entryPrice) * 100;
            maxFavorable = Math.max(maxFavorable, favorableMove);
            maxAdverse = Math.max(maxAdverse, adverseMove);

            // Check SL first (conservative)
            if (candle.low <= stopLoss) {
              outcome = 'sl_hit';
              exitPrice = stopLoss;
              exitCandleIndex = i;
              break;
            }
            // Check TP
            if (candle.high >= takeProfit) {
              outcome = 'tp_hit';
              exitPrice = takeProfit;
              exitCandleIndex = i;
              break;
            }
          } else {
            // SHORT
            const favorableMove = ((entryPrice - candle.low) / entryPrice) * 100;
            const adverseMove = ((candle.high - entryPrice) / entryPrice) * 100;
            maxFavorable = Math.max(maxFavorable, favorableMove);
            maxAdverse = Math.max(maxAdverse, adverseMove);

            if (candle.high >= stopLoss) {
              outcome = 'sl_hit';
              exitPrice = stopLoss;
              exitCandleIndex = i;
              break;
            }
            if (candle.low <= takeProfit) {
              outcome = 'tp_hit';
              exitPrice = takeProfit;
              exitCandleIndex = i;
              break;
            }
          }
        }

        const pnlPercent = isLong
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - exitPrice) / entryPrice) * 100;

        const timeToExit = (allCandles[exitCandleIndex].timestamp - signalTime) / (1000 * 60);

        if (outcome === 'tp_hit') tpHit++;
        else if (outcome === 'sl_hit') slHit++;
        else timeout++;

        const result: VerificationResult = {
          signal_id: signal.id,
          strategy_id: signal.strategy_id,
          user_id: signal.user_id,
          symbol: signal.symbol,
          signal_type: signal.signal_type,
          entry_price: entryPrice,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          signal_time: signal.created_at,
          outcome,
          exit_price: exitPrice,
          pnl_percent: Math.round(pnlPercent * 100) / 100,
          max_favorable: Math.round(maxFavorable * 100) / 100,
          max_adverse: Math.round(maxAdverse * 100) / 100,
          time_to_exit_minutes: Math.round(timeToExit),
          candles_checked: exitCandleIndex + 1,
          verification_period_hours: 24,
        };

        results.push(result);

        // Rate limit: small delay between API calls
        await new Promise(r => setTimeout(r, 200));

      } catch (err) {
        console.error(`[VERIFY-SIGNALS] Error verifying signal ${signal.id}:`, err);
      }
    }

    // Insert verification results
    if (results.length > 0) {
      const { error: insertErr } = await supabase
        .from('signal_verifications')
        .insert(results);

      if (insertErr) {
        console.error('[VERIFY-SIGNALS] Error inserting verifications:', insertErr);
      }
    }

    console.log(`[VERIFY-SIGNALS] Verified ${results.length} signals: ${tpHit} TP, ${slHit} SL, ${timeout} timeout`);

    // Send Telegram summary
    await sendTelegramSummary(supabase, results, tpHit, slHit, timeout);

    return new Response(JSON.stringify({
      success: true,
      verified: results.length,
      tp_hit: tpHit,
      sl_hit: slHit,
      timeout,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('[VERIFY-SIGNALS] Fatal error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function sendTelegramSummary(
  supabase: any,
  results: VerificationResult[],
  tpHit: number,
  slHit: number,
  timeout: number
) {
  try {
    if (results.length === 0) return;

    // Get user settings for Telegram
    const userIds = [...new Set(results.map(r => r.user_id))];

    for (const userId of userIds) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled')
        .eq('user_id', userId)
        .single();

      if (!settings?.telegram_enabled || !settings?.telegram_bot_token || !settings?.telegram_chat_id) continue;

      const userResults = results.filter(r => r.user_id === userId);
      const userTp = userResults.filter(r => r.outcome === 'tp_hit').length;
      const userSl = userResults.filter(r => r.outcome === 'sl_hit').length;
      const userTimeout = userResults.filter(r => r.outcome === 'timeout').length;
      const avgPnl = userResults.reduce((sum, r) => sum + r.pnl_percent, 0) / userResults.length;
      const accuracy = userResults.length > 0 ? (userTp / userResults.length * 100) : 0;

      let message = `📊 *SIGNAL VERIFICATION REPORT*\n\n`;
      message += `📅 Period: Last 24-48h\n`;
      message += `📈 Signals Checked: ${userResults.length}\n\n`;
      message += `✅ TP Hit: ${userTp}\n`;
      message += `❌ SL Hit: ${userSl}\n`;
      message += `⏰ Timeout: ${userTimeout}\n\n`;
      message += `🎯 Accuracy: ${accuracy.toFixed(1)}%\n`;
      message += `💰 Avg P&L: ${avgPnl.toFixed(2)}%\n\n`;

      // Top results
      const sorted = [...userResults].sort((a, b) => b.pnl_percent - a.pnl_percent);
      if (sorted.length > 0) {
        message += `*Best:* ${sorted[0].symbol} ${sorted[0].signal_type} → ${sorted[0].pnl_percent > 0 ? '+' : ''}${sorted[0].pnl_percent}%\n`;
        if (sorted.length > 1) {
          const worst = sorted[sorted.length - 1];
          message += `*Worst:* ${worst.symbol} ${worst.signal_type} → ${worst.pnl_percent > 0 ? '+' : ''}${worst.pnl_percent}%\n`;
        }
      }

      try {
        await fetch(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: settings.telegram_chat_id,
            text: message,
            parse_mode: 'Markdown',
          }),
        });
      } catch (tgErr) {
        console.error('[VERIFY-SIGNALS] Telegram send error:', tgErr);
      }
    }
  } catch (err) {
    console.error('[VERIFY-SIGNALS] Telegram summary error:', err);
  }
}
