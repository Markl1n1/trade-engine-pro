import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface FailedSignal {
  id: string;
  user_id: string;
  strategy_id: string;
  symbol: string;
  signal_type: string;
  price: number;
  reason: string | null;
  delivery_attempts: number;
  last_attempt_at: string | null;
  created_at: string;
}

async function sendTelegramSignal(botToken: string, chatId: string, signal: FailedSignal, strategyName: string): Promise<boolean> {
  try {
    const emoji = signal.signal_type.toLowerCase() === 'buy' ? '🟢' : '🔴';
    const message = [
      `${emoji} *${signal.signal_type.toUpperCase()} SIGNAL*`,
      ``,
      `📊 *Strategy:* ${strategyName}`,
      `💱 *Symbol:* ${signal.symbol}`,
      `💰 *Price:* ${signal.price}`,
      signal.reason ? `📝 *Reason:* ${signal.reason}` : '',
      ``,
      `🕐 *Time:* ${new Date(signal.created_at).toLocaleString()}`,
      `🔄 *Retry:* Attempt ${signal.delivery_attempts + 1}`,
    ].filter(Boolean).join('\n');

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[RETRY-SIGNALS] ❌ Telegram API error:`, errorData);
      return false;
    }

    console.log(`[RETRY-SIGNALS] ✅ Telegram delivery successful for signal ${signal.id}`);
    return true;
  } catch (error) {
    console.error(`[RETRY-SIGNALS] ❌ Telegram delivery exception:`, error);
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    console.log('[RETRY-SIGNALS] 🔄 Starting failed signal retry processing');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query signals that are pending and haven't exceeded max attempts
    // Also check they haven't been attempted in the last 2 minutes (rate limiting)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: failedSignals, error: fetchError } = await supabase
      .from('strategy_signals')
      .select('*')
      .eq('status', 'pending')
      .lt('delivery_attempts', 5)
      .or(`last_attempt_at.is.null,last_attempt_at.lt.${twoMinutesAgo}`)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('[RETRY-SIGNALS] ❌ Error fetching failed signals:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }

    if (!failedSignals || failedSignals.length === 0) {
      console.log('[RETRY-SIGNALS] ✅ No failed signals to retry');
      return new Response(JSON.stringify({ message: 'No signals to retry', processed: 0 }), { status: 200 });
    }

    console.log(`[RETRY-SIGNALS] 📦 Found ${failedSignals.length} signals to retry`);

    let successCount = 0;
    let failureCount = 0;
    let expiredCount = 0;

    // Process each failed signal
    for (const signal of failedSignals) {
      // Check if signal is too old (>24 hours) - mark as expired
      const signalAge = Date.now() - new Date(signal.created_at).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (signalAge > maxAge) {
        console.log(`[RETRY-SIGNALS] ⏰ Signal ${signal.id} expired (age: ${Math.round(signalAge / 3600000)}h)`);
        
        await supabase
          .from('strategy_signals')
          .update({ 
            status: 'expired',
            error_message: 'Signal expired after 24 hours',
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', signal.id);
        
        expiredCount++;
        continue;
      }

      // Get strategy and user settings
      const { data: strategy } = await supabase
        .from('strategies')
        .select('name')
        .eq('id', signal.strategy_id)
        .single();

      const { data: settings } = await supabase
        .from('user_settings')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled')
        .eq('user_id', signal.user_id)
        .single();

      if (!settings?.telegram_enabled || !settings?.telegram_bot_token || !settings?.telegram_chat_id) {
        console.log(`[RETRY-SIGNALS] ⚠️ Telegram not configured for signal ${signal.id}`);
        
        await supabase
          .from('strategy_signals')
          .update({ 
            status: 'failed',
            error_message: 'Telegram not configured',
            delivery_attempts: signal.delivery_attempts + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', signal.id);
        
        failureCount++;
        continue;
      }

      // Attempt Telegram delivery
      const deliverySuccess = await sendTelegramSignal(
        settings.telegram_bot_token,
        settings.telegram_chat_id,
        signal,
        strategy?.name || 'Unknown Strategy'
      );

      const newAttempts = signal.delivery_attempts + 1;

      if (deliverySuccess) {
        // Mark as delivered
        await supabase
          .from('strategy_signals')
          .update({ 
            status: 'delivered',
            delivery_attempts: newAttempts,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', signal.id);
        
        successCount++;
        console.log(`[RETRY-SIGNALS] ✅ Delivered signal ${signal.id} on attempt ${newAttempts}`);
      } else {
        // Check if max attempts reached
        const finalStatus = newAttempts >= 5 ? 'failed' : 'pending';
        const errorMessage = newAttempts >= 5 ? 'Max delivery attempts exceeded' : 'Delivery failed, will retry';
        
        await supabase
          .from('strategy_signals')
          .update({ 
            status: finalStatus,
            error_message: errorMessage,
            delivery_attempts: newAttempts,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', signal.id);
        
        failureCount++;
        console.log(`[RETRY-SIGNALS] ❌ Failed delivery for signal ${signal.id} (attempt ${newAttempts}/5)`);
      }

      // Rate limiting: small delay between Telegram API calls
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const result = {
      message: 'Retry processing complete',
      total: failedSignals.length,
      successful: successCount,
      failed: failureCount,
      expired: expiredCount,
      timestamp: new Date().toISOString(),
    };

    console.log('[RETRY-SIGNALS] ✅ Complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[RETRY-SIGNALS] ❌ Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});
