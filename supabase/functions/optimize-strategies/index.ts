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
      if (signals.length < 3) continue;

      const totalSignals = signals.length;
      const tpHits = signals.filter(s => s.outcome === 'tp_hit').length;
      const slHits = signals.filter(s => s.outcome === 'sl_hit').length;
      const timeouts = signals.filter(s => s.outcome === 'timeout').length;
      const profitableTimeouts = signals.filter(s => s.outcome === 'timeout' && Number(s.pnl_percent) > 0).length;

      // Fixed: count profitable outcomes (TP hits + profitable timeouts) as wins
      const profitableOutcomes = tpHits + profitableTimeouts;
      const winRate = (profitableOutcomes / totalSignals) * 100;

      const avgMaxFavorable = signals
        .filter(s => s.max_favorable !== null)
        .reduce((sum, s) => sum + Number(s.max_favorable), 0) / Math.max(1, signals.filter(s => s.max_favorable !== null).length);

      const avgMaxAdverse = signals
        .filter(s => s.max_adverse !== null)
        .reduce((sum, s) => sum + Number(s.max_adverse), 0) / Math.max(1, signals.filter(s => s.max_adverse !== null).length);

      const avgPnl = signals
        .filter(s => s.pnl_percent !== null)
        .reduce((sum, s) => sum + Number(s.pnl_percent), 0) / Math.max(1, signals.filter(s => s.pnl_percent !== null).length);

      const { data: strategy } = await supabase
        .from('strategies')
        .select('name, stop_loss_percent, take_profit_percent, atr_sl_multiplier, atr_tp_multiplier, user_id')
        .eq('id', strategyId)
        .single();

      if (!strategy) continue;

      const userId = strategy.user_id;
      const currentTp = Number(strategy.take_profit_percent || 5);
      const currentSl = Number(strategy.stop_loss_percent || 2.5);

      console.log(`[OPTIMIZE] Strategy: ${strategy.name} | Signals: ${totalSignals} | WR: ${winRate.toFixed(1)}% (TP:${tpHits} ProfTimeout:${profitableTimeouts}) | AvgFav: ${avgMaxFavorable.toFixed(2)}% | AvgAdv: ${avgMaxAdverse.toFixed(2)}% | AvgPnL: ${avgPnl.toFixed(2)}%`);

      // Rule 1: If many timeouts are profitable, TP is too ambitious → reduce it
      if (profitableTimeouts >= 2 && avgMaxFavorable > 0) {
        const suggestedTp = Math.round(avgMaxFavorable * 85) / 100; // 85% of avg max favorable
        if (suggestedTp < currentTp) {
          suggestions.push({
            strategy_id: strategyId,
            user_id: userId,
            suggestion_type: 'tp_adjust',
            current_value: { take_profit_percent: currentTp },
            suggested_value: { take_profit_percent: suggestedTp },
            reason: `${profitableTimeouts}/${totalSignals} signals timed out profitably (avg PnL +${avgPnl.toFixed(2)}%). Avg max favorable: ${avgMaxFavorable.toFixed(2)}%. Reducing TP from ${currentTp}% to ${suggestedTp.toFixed(1)}% would convert timeouts to TP wins.`,
            based_on_signals: totalSignals
          });
        }
      }

      // Rule 2: If SL hit rate > 40% and avg adverse > current SL, widen SL
      if (slHits / totalSignals > 0.4 && avgMaxAdverse > currentSl * 0.8) {
        const suggestedSl = Math.round(avgMaxAdverse * 115) / 100; // 115% of avg max adverse
        if (suggestedSl > currentSl) {
          suggestions.push({
            strategy_id: strategyId,
            user_id: userId,
            suggestion_type: 'sl_adjust',
            current_value: { stop_loss_percent: currentSl },
            suggested_value: { stop_loss_percent: suggestedSl },
            reason: `${slHits}/${totalSignals} signals hit SL (${(slHits/totalSignals*100).toFixed(0)}%). Avg max adverse: ${avgMaxAdverse.toFixed(2)}%. Widening SL from ${currentSl}% to ${suggestedSl.toFixed(1)}% should reduce premature stops.`,
            based_on_signals: totalSignals
          });
        }
      }

      // Rule 3: Counter-trend signals (max_favorable ≤ 0.1%)
      const counterTrendSignals = signals.filter(s => Number(s.max_favorable) <= 0.1);
      if (counterTrendSignals.length / totalSignals > 0.4) {
        suggestions.push({
          strategy_id: strategyId,
          user_id: userId,
          suggestion_type: 'add_filter',
          current_value: { counter_trend_rate: `${((counterTrendSignals.length / totalSignals) * 100).toFixed(0)}%` },
          suggested_value: { action: 'enforce_trend_gate', description: 'Hard-block all counter-trend entries' },
          reason: `${counterTrendSignals.length}/${totalSignals} signals had ≤0.1% favorable movement. Trend gate enforcement recommended.`,
          based_on_signals: totalSignals
        });
      }

      // Rule 4: Low win rate but only if avg PnL is also negative
      if (winRate < 30 && totalSignals >= 5 && avgPnl < 0) {
        suggestions.push({
          strategy_id: strategyId,
          user_id: userId,
          suggestion_type: 'review_needed',
          current_value: { win_rate: winRate, avg_pnl: avgPnl },
          suggested_value: { target_win_rate: 50 },
          reason: `Win rate ${winRate.toFixed(0)}% with avg PnL ${avgPnl.toFixed(2)}% across ${totalSignals} signals. Strategy needs review.`,
          based_on_signals: totalSignals
        });
      }

      // Rule 5: Positive avg PnL but no TP hits → TP is too high
      if (tpHits === 0 && avgPnl > 0 && totalSignals >= 3) {
        const suggestedTp = Math.round(avgMaxFavorable * 80) / 100;
        if (suggestedTp < currentTp) {
          suggestions.push({
            strategy_id: strategyId,
            user_id: userId,
            suggestion_type: 'tp_adjust',
            current_value: { take_profit_percent: currentTp },
            suggested_value: { take_profit_percent: suggestedTp },
            reason: `0 TP hits but avg PnL is +${avgPnl.toFixed(2)}% (${profitableTimeouts} profitable timeouts). Avg max favorable: ${avgMaxFavorable.toFixed(2)}%. TP ${currentTp}% is unreachable — reduce to ${suggestedTp.toFixed(1)}%.`,
            based_on_signals: totalSignals
          });
        }
      }
    }

    // Deduplication: remove old unapplied suggestions for same strategy+type before inserting
    if (suggestions.length > 0) {
      const dedupeKeys = suggestions.map(s => ({ strategy_id: s.strategy_id, suggestion_type: s.suggestion_type }));
      for (const key of dedupeKeys) {
        await supabase
          .from('optimization_suggestions')
          .delete()
          .eq('strategy_id', key.strategy_id)
          .eq('suggestion_type', key.suggestion_type)
          .eq('applied', false);
      }

      const { error: insertErr } = await supabase
        .from('optimization_suggestions')
        .insert(suggestions);

      if (insertErr) {
        console.error('[OPTIMIZE] Error inserting suggestions:', insertErr);
      } else {
        console.log(`[OPTIMIZE] ✅ Created ${suggestions.length} optimization suggestions (old duplicates removed)`);
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
          suggestions.map(s => `• *${s.suggestion_type}*: ${s.reason.substring(0, 120)}`).join('\n');

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
