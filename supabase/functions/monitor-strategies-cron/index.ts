import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface StrategyState {
  position_open: boolean;
  entry_price: number | null;
  entry_time: string | null;
  range_high: number | null;
  range_low: number | null;
}

// Fetch market data from Binance
async function fetchMarketData(symbol: string, timeframe: string, limit = 100): Promise<Candle[]> {
  const response = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch market data for ${symbol}`);
  }
  
  const data = await response.json();
  
  return data.map((candle: any) => ({
    timestamp: candle[0],
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5]),
  }));
}

// Calculate technical indicators
function calculateIndicator(type: string, candles: Candle[], params: any): number | null {
  if (!candles || candles.length === 0) return null;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  switch (type) {
    case 'sma': {
      const period = params.period_1 || 14;
      if (closes.length < period) return null;
      const sum = closes.slice(-period).reduce((a, b) => a + b, 0);
      return sum / period;
    }
    
    case 'ema': {
      const period = params.period_1 || 14;
      if (closes.length < period) return null;
      const multiplier = 2 / (period + 1);
      let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < closes.length; i++) {
        ema = (closes[i] - ema) * multiplier + ema;
      }
      return ema;
    }
    
    case 'rsi': {
      const period = params.period_1 || 14;
      if (closes.length < period + 1) return null;
      
      let gains = 0;
      let losses = 0;
      
      for (let i = closes.length - period; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }
      
      const avgGain = gains / period;
      const avgLoss = losses / period;
      
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    }
    
    case 'price':
      return closes[closes.length - 1];
    
    case 'volume':
      return candles[candles.length - 1].volume;
    
    default:
      return null;
  }
}

// Evaluate a single condition
function evaluateCondition(condition: any, candles: Candle[]): boolean {
  const value1 = calculateIndicator(condition.indicator_type, candles, condition);
  
  if (value1 === null) return false;
  
  let value2: number;
  if (condition.indicator_type_2) {
    const calculated = calculateIndicator(condition.indicator_type_2, candles, {
      period_1: condition.period_2
    });
    if (calculated === null) return false;
    value2 = calculated;
  } else {
    value2 = condition.value;
  }
  
  switch (condition.operator) {
    case 'greater_than':
      return value1 > value2;
    case 'less_than':
      return value1 < value2;
    case 'equals':
      return Math.abs(value1 - value2) < 0.0001;
    case 'crosses_above':
      if (candles.length < 2) return false;
      const prevValue1 = calculateIndicator(condition.indicator_type, candles.slice(0, -1), condition);
      if (prevValue1 === null) return false;
      return prevValue1 <= value2 && value1 > value2;
    case 'crosses_below':
      if (candles.length < 2) return false;
      const prevValue1Below = calculateIndicator(condition.indicator_type, candles.slice(0, -1), condition);
      if (prevValue1Below === null) return false;
      return prevValue1Below >= value2 && value1 < value2;
    default:
      return false;
  }
}

// Check all conditions for a strategy
function checkConditions(conditions: any[], candles: Candle[]): boolean {
  if (!conditions || conditions.length === 0) return false;
  
  return conditions.every(condition => evaluateCondition(condition, candles));
}

// Send Telegram notification
async function sendTelegramSignal(botToken: string, chatId: string, signal: any): Promise<void> {
  const message = `
🤖 *Trading Signal*

Strategy: ${signal.strategy_name}
Symbol: ${signal.symbol}
Signal: ${signal.signal_type.toUpperCase()}
Price: ${signal.price}
${signal.reason ? `\nReason: ${signal.reason}` : ''}

Time: ${new Date().toISOString()}
  `.trim();

  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    })
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for global access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[CRON] Starting global strategy monitoring...');

    // Check if monitoring is enabled
    const { data: monitoringSetting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'monitoring_enabled')
      .single();

    if (monitoringSetting?.setting_value !== 'true') {
      console.log('[CRON] Monitoring is disabled');
      return new Response(
        JSON.stringify({ message: 'Monitoring disabled', signals: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last monitoring run timestamp
    await supabase
      .from('system_settings')
      .update({ setting_value: new Date().toISOString() })
      .eq('setting_key', 'last_monitoring_run');

    // Fetch ALL active strategies from ALL users
    const { data: strategies, error: strategiesError } = await supabase
      .from('strategies')
      .select(`
        *,
        strategy_conditions (*),
        condition_groups (*)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (strategiesError) {
      console.error('[CRON] Error fetching strategies:', strategiesError);
      throw strategiesError;
    }

    if (!strategies || strategies.length === 0) {
      console.log('[CRON] No active strategies found');
      return new Response(
        JSON.stringify({ message: 'No active strategies', signals: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CRON] Processing ${strategies.length} active strategies...`);

    const allSignals: any[] = [];

    // Process each strategy
    for (const strategy of strategies) {
      try {
        console.log(`[CRON] Processing strategy: ${strategy.name} (User: ${strategy.user_id})`);

        // Fetch user's settings for this strategy
        const { data: userSettings } = await supabase
          .from('user_settings')
          .select('telegram_enabled, telegram_bot_token, telegram_chat_id')
          .eq('user_id', strategy.user_id)
          .single();

        // Get or create strategy live state
        let { data: liveState } = await supabase
          .from('strategy_live_states')
          .select('*')
          .eq('strategy_id', strategy.id)
          .eq('user_id', strategy.user_id)
          .single();

        if (!liveState) {
          const { data: newState } = await supabase
            .from('strategy_live_states')
            .insert({
              strategy_id: strategy.id,
              user_id: strategy.user_id,
              position_open: false
            })
            .select()
            .single();
          liveState = newState;
        }

        // Fetch market data for this strategy's symbol
        const candles = await fetchMarketData(strategy.symbol, strategy.timeframe, 100);
        const currentPrice = candles[candles.length - 1].close;

        // Get entry and exit conditions
        const entryConditions = strategy.strategy_conditions?.filter(
          (c: any) => c.order_type === 'entry'
        ) || [];
        const exitConditions = strategy.strategy_conditions?.filter(
          (c: any) => c.order_type === 'exit'
        ) || [];

        let signal = null;

        // Check for exit conditions if position is open
        if (liveState?.position_open && exitConditions.length > 0) {
          const exitMet = checkConditions(exitConditions, candles);
          
          if (exitMet) {
            signal = {
              signal_type: 'sell',
              price: currentPrice,
              reason: 'Exit conditions met',
              strategy_id: strategy.id,
              user_id: strategy.user_id,
              symbol: strategy.symbol,
              strategy_name: strategy.name
            };

            // Update live state
            await supabase
              .from('strategy_live_states')
              .update({
                position_open: false,
                entry_price: null,
                entry_time: null
              })
              .eq('id', liveState.id);

            console.log(`[CRON] EXIT signal generated for ${strategy.name}`);
          }
        }

        // Check for entry conditions if no position is open
        if (!liveState?.position_open && entryConditions.length > 0) {
          const entryMet = checkConditions(entryConditions, candles);
          
          if (entryMet) {
            signal = {
              signal_type: 'buy',
              price: currentPrice,
              reason: 'Entry conditions met',
              strategy_id: strategy.id,
              user_id: strategy.user_id,
              symbol: strategy.symbol,
              strategy_name: strategy.name
            };

            // Update live state
            await supabase
              .from('strategy_live_states')
              .update({
                position_open: true,
                entry_price: currentPrice,
                entry_time: new Date().toISOString()
              })
              .eq('id', liveState.id);

            console.log(`[CRON] ENTRY signal generated for ${strategy.name}`);
          }
        }

        // If signal was generated, save it and send notification
        if (signal) {
          // Insert signal into database
          await supabase
            .from('strategy_signals')
            .insert({
              strategy_id: signal.strategy_id,
              user_id: signal.user_id,
              signal_type: signal.signal_type,
              symbol: signal.symbol,
              price: signal.price,
              reason: signal.reason
            });

          allSignals.push(signal);

          // Send Telegram notification if enabled
          if (userSettings?.telegram_enabled && 
              userSettings?.telegram_bot_token && 
              userSettings?.telegram_chat_id) {
            try {
              await sendTelegramSignal(
                userSettings.telegram_bot_token,
                userSettings.telegram_chat_id,
                signal
              );
              console.log(`[CRON] Telegram notification sent for ${strategy.name}`);
            } catch (telegramError) {
              console.error('[CRON] Telegram notification failed:', telegramError);
            }
          }
        }

      } catch (strategyError) {
        console.error(`[CRON] Error processing strategy ${strategy.id}:`, strategyError);
        // Continue processing other strategies
      }
    }

    console.log(`[CRON] Monitoring complete. Generated ${allSignals.length} signals`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${strategies.length} strategies`,
        signals_generated: allSignals.length,
        signals: allSignals
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CRON] Global error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
