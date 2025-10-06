// Shared utilities for signal generation and deduplication

/**
 * Generate a unique hash for signal deduplication
 * Hash = sha256(strategy_id + signal_type + candle_timestamp)
 */
export async function generateSignalHash(
  strategyId: string,
  signalType: string,
  candleTimestamp: number
): Promise<string> {
  const data = `${strategyId}-${signalType}-${candleTimestamp}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Insert signal with retry logic and deduplication
 */
export async function insertSignalWithRetry(
  supabase: any,
  signal: {
    user_id: string;
    strategy_id: string;
    signal_type: string;
    symbol: string;
    price: number;
    reason?: string;
    candle_close_time: number;
  },
  maxRetries = 3
): Promise<{ success: boolean; data?: any; error?: any }> {
  // Generate deduplication hash
  const signalHash = await generateSignalHash(
    signal.strategy_id,
    signal.signal_type,
    signal.candle_close_time
  );

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase
        .from('strategy_signals')
        .insert({
          ...signal,
          signal_hash: signalHash,
          signal_generated_at: new Date().toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        // If duplicate hash, consider it a success (signal already exists)
        if (error.code === '23505' && error.message.includes('unique_signal_hash')) {
          console.log(`[SIGNAL] Duplicate signal detected (hash: ${signalHash}), skipping`);
          return { success: true, data: null };
        }
        throw error;
      }

      return { success: true, data };
    } catch (error) {
      lastError = error;
      console.error(`[SIGNAL] Insert attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
      }
    }
  }

  return { success: false, error: lastError };
}

/**
 * Send Telegram signal notification
 */
export async function sendTelegramSignal(
  botToken: string,
  chatId: string,
  signal: {
    strategy_name: string;
    signal_type: string;
    symbol: string;
    price: number;
    reason?: string;
  }
): Promise<boolean> {
  const emoji = signal.signal_type === 'BUY' ? '🟢' : '🔴';
  const message = `${emoji} *${signal.signal_type} SIGNAL*\n\n` +
    `Strategy: ${signal.strategy_name}\n` +
    `Symbol: ${signal.symbol}\n` +
    `Price: $${Number(signal.price).toLocaleString()}\n` +
    (signal.reason ? `Reason: ${signal.reason}\n` : '') +
    `Time: ${new Date().toLocaleString()}`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      }
    );

    if (!response.ok) {
      console.error('[TELEGRAM] Failed to send signal:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('[TELEGRAM] Error sending signal:', error);
    return false;
  }
}

/**
 * Update signal status to delivered
 */
export async function markSignalAsDelivered(
  supabase: any,
  signalId: string
): Promise<void> {
  await supabase
    .from('strategy_signals')
    .update({
      status: 'delivered',
      signal_delivered_at: new Date().toISOString(),
    })
    .eq('id', signalId);
}

/**
 * Create position event (for opened/closed/liquidated positions)
 */
export async function createPositionEvent(
  supabase: any,
  event: {
    user_id: string;
    strategy_id: string;
    symbol: string;
    event_type: 'opened' | 'closed' | 'liquidated';
    entry_price?: number;
    exit_price?: number;
    position_size?: number;
    pnl_percent?: number;
    pnl_amount?: number;
    reason?: string;
  }
): Promise<{ success: boolean; data?: any }> {
  const { data, error } = await supabase
    .from('position_events')
    .insert({
      ...event,
      timestamp: new Date().toISOString(),
      telegram_sent: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[POSITION_EVENT] Failed to create event:', error);
    return { success: false };
  }

  return { success: true, data };
}

/**
 * Send position event Telegram notification
 */
export async function sendPositionEventTelegram(
  botToken: string,
  chatId: string,
  event: {
    event_type: string;
    symbol: string;
    entry_price?: number;
    exit_price?: number;
    pnl_percent?: number;
    reason?: string;
    timestamp: string;
  }
): Promise<boolean> {
  let message = '';

  if (event.event_type === 'closed') {
    const emoji = (event.pnl_percent ?? 0) >= 0 ? '✅' : '❌';
    message = `${emoji} *POSITION CLOSED*\n\n` +
      `Symbol: ${event.symbol}\n` +
      `Entry: $${Number(event.entry_price).toLocaleString()}\n` +
      `Exit: $${Number(event.exit_price).toLocaleString()}\n` +
      `P&L: ${event.pnl_percent?.toFixed(2)}%\n` +
      (event.reason ? `Reason: ${event.reason}\n` : '') +
      `Time: ${new Date(event.timestamp).toLocaleString()}`;
  } else if (event.event_type === 'opened') {
    message = `🟢 *POSITION OPENED*\n\n` +
      `Symbol: ${event.symbol}\n` +
      `Entry: $${Number(event.entry_price).toLocaleString()}\n` +
      `Time: ${new Date(event.timestamp).toLocaleString()}`;
  } else if (event.event_type === 'liquidated') {
    message = `⚠️ *POSITION LIQUIDATED*\n\n` +
      `Symbol: ${event.symbol}\n` +
      `Entry: $${Number(event.entry_price).toLocaleString()}\n` +
      `Exit: $${Number(event.exit_price).toLocaleString()}\n` +
      `Loss: ${event.pnl_percent?.toFixed(2)}%\n` +
      `Time: ${new Date(event.timestamp).toLocaleString()}`;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      }
    );

    if (!response.ok) {
      console.error('[TELEGRAM] Failed to send position event:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('[TELEGRAM] Error sending position event:', error);
    return false;
  }
}

/**
 * Calculate exponential backoff delay
 */
export function getExponentialBackoffDelay(attempt: number, baseDelay = 180000): number {
  // Base delay: 3 minutes (180000ms)
  // Attempt 1: 3 min
  // Attempt 2: 6 min
  // Attempt 3: 12 min
  // Max: 30 min
  const delay = baseDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, 1800000); // Cap at 30 minutes
}
