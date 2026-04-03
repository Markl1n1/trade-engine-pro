import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../helpers/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('[OPTIMIZE] Starting strategy optimization based on signal verifications...');

    // Get all verified signals grouped by strategy
    const { data: verifications, error: vErr } = await supabase
      .from('signal_verifications')
      .select('*')
      .neq('outcome', 'pending')
      .order('created_at', { ascending: false })
      .limit(500);

    if (vErr) throw vErr;
    if (!verifications || verifications.length === 0) {
      console.log('[OPTIMIZE] No verification data available');
      return new Response(JSON.stringify({ success: true, message: 'No verification data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Group by strategy
    const byStrategy: Record<string, typeof verifications> = {};
    for (const v of verifications) {
      const sid = v.strategy_id;
      if (!byStrategy[sid]) byStrategy[sid] = [];
      byStrategy[sid].push(v);
    }

    const suggestions: any[] = [];

    for (const [strategyId, signals] of Object.entries(byStrategy)) {
      if (signals.length < 3) continue; // Need at least 3 signals for meaningful analysis

      const totalSignals = signals.length;
      const tpHits = signals.filter(s => s.outcome === 'tp_hit').length;
      const slHits = signals.filter(s => s.outcome === 'sl_hit').length;
      const timeouts = signals.filter(s => s.outcome === 'timeout').length;
      const winRate = (tpHits / totalSignals) * 100;

      const avgMaxFavorable = signals
        .filter(s => s.max_favorable !== null)
        .reduce((sum, s) => sum + Number(s.max_favorable), 0) / Math.max(1, signals.filter(s => s.max_favorable !== null).length);

      const avgMaxAdverse = signals
        .filter(s => s.max_adverse !== null)
        .reduce((sum, s) => sum + Number(s.max_adverse), 0) / Math.max(1, signals.filter(s => s.max_adverse !== null).length);

      const avgPnl = signals
        .filter(s => s.pnl_percent !== null)
        .reduce((sum, s) => sum + Number(s.pnl_percent), 0) / Math.max(1, signals.filter(s => s.pnl_percent !== null).length);

      // Get current strategy config
      const { data: strategy } = await supabase
        .from('strategies')
        .select('name, stop_loss_percent, take_profit_percent, atr_sl_multiplier, atr_tp_multiplier, user_id')
        .eq('id', strategyId)
        .single();

      if (!strategy) continue;

      const userId = strategy.user_id;

      console.log(`[OPTIMIZE] Strategy: ${strategy.name} | Signals: ${totalSignals} | WR: ${winRate.toFixed(1)}% | AvgFav: ${avgMaxFavorable.toFixed(2)}% | AvgAdv: ${avgMaxAdverse.toFixed(2)}%`);

      // Rule 1: If many timeouts are profitable, TP is too ambitious
      const profitableTimeouts = signals.filter(s => s.outcome === 'timeout' && Number(s.pnl_percent) > 0).length;
      if (profitableTimeouts >= 2 && avgMaxFavorable > 0) {
        const suggestedTp = Math.round(avgMaxFavorable * 80) / 100; // 80% of avg max favorable
        if (suggestedTp < Number(strategy.take_profit_percent || 5)) {
          suggestions.push({
            strategy_id: strategyId,
            user_id: userId,
            suggestion_type: 'tp_adjust',
            current_value: { take_profit_percent: strategy.take_profit_percent, atr_tp_multiplier: strategy.atr_tp_multiplier },
            suggested_value: { take_profit_percent: suggestedTp },
            reason: `${profitableTimeouts}/${totalSignals} signals timed out profitably. Avg max favorable: ${avgMaxFavorable.toFixed(2)}%. Reducing TP to ${suggestedTp.toFixed(1)}% would convert timeouts to wins.`,
            based_on_signals: totalSignals
          });
        }
      }

      // Rule 2: If SL hit rate > 50% and avg adverse > current SL, widen SL
      if (slHits / totalSignals > 0.5 && avgMaxAdverse > 0) {
        const suggestedSl = Math.round(avgMaxAdverse * 110) / 100; // 110% of avg max adverse
        if (suggestedSl > Number(strategy.stop_loss_percent || 2.5)) {
          suggestions.push({
            strategy_id: strategyId,
            user_id: userId,
            suggestion_type: 'sl_adjust',
            current_value: { stop_loss_percent: strategy.stop_loss_percent, atr_sl_multiplier: strategy.atr_sl_multiplier },
            suggested_value: { stop_loss_percent: suggestedSl },
            reason: `${slHits}/${totalSignals} signals hit SL. Avg max adverse: ${avgMaxAdverse.toFixed(2)}%. Widening SL to ${suggestedSl.toFixed(1)}% should reduce premature stops.`,
            based_on_signals: totalSignals
          });
        }
      }

      // Rule 3: Check for counter-trend signals (SELL signals where max_favorable = 0)
      const counterTrendSignals = signals.filter(s => {
        if (s.signal_type === 'SELL' && Number(s.max_favorable) <= 0.1) return true;
        if (s.signal_type === 'BUY' && Number(s.max_favorable) <= 0.1) return true;
        return false;
      });

      if (counterTrendSignals.length / totalSignals > 0.5) {
        suggestions.push({
          strategy_id: strategyId,
          user_id: userId,
          suggestion_type: 'add_filter',
          current_value: { counter_trend_rate: `${((counterTrendSignals.length / totalSignals) * 100).toFixed(0)}%` },
          suggested_value: { action: 'enforce_trend_gate', description: 'Hard-block all counter-trend entries' },
          reason: `${counterTrendSignals.length}/${totalSignals} signals had 0% favorable movement (counter-trend). Trend gate enforcement recommended.`,
          based_on_signals: totalSignals
        });
      }

      // Rule 4: Overall low win rate summary
      if (winRate < 30 && totalSignals >= 5) {
        suggestions.push({
          strategy_id: strategyId,
          user_id: userId,
          suggestion_type: 'review_needed',
          current_value: { win_rate: winRate, avg_pnl: avgPnl },
          suggested_value: { target_win_rate: 50 },
          reason: `Win rate ${winRate.toFixed(0)}% across ${totalSignals} signals. Average PnL: ${avgPnl.toFixed(2)}%. Strategy needs fundamental review.`,
          based_on_signals: totalSignals
        });
      }
    }

    // Write suggestions to database
    if (suggestions.length > 0) {
      const { error: insertErr } = await supabase
        .from('optimization_suggestions')
        .insert(suggestions);

      if (insertErr) {
        console.error('[OPTIMIZE] Error inserting suggestions:', insertErr);
      } else {
        console.log(`[OPTIMIZE] ✅ Created ${suggestions.length} optimization suggestions`);
      }
    }

    // Send Telegram summary
    try {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled')
        .eq('telegram_enabled', true)
        .limit(1)
        .single();

      if (settings?.telegram_bot_token && settings?.telegram_chat_id) {
        const msg = `📊 *Strategy Optimizer Report*\n\n` +
          `Analyzed: ${verifications.length} verified signals\n` +
          `Strategies reviewed: ${Object.keys(byStrategy).length}\n` +
          `Suggestions generated: ${suggestions.length}\n\n` +
          suggestions.map(s => `• *${s.suggestion_type}*: ${s.reason.substring(0, 100)}`).join('\n');

        await fetch(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: settings.telegram_chat_id,
            text: msg,
            parse_mode: 'Markdown'
          })
        });
      }
    } catch (teleErr) {
      console.error('[OPTIMIZE] Telegram error:', teleErr);
    }

    return new Response(JSON.stringify({
      success: true,
      suggestions_count: suggestions.length,
      strategies_analyzed: Object.keys(byStrategy).length,
      signals_analyzed: verifications.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[OPTIMIZE] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
