import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import * as indicators from "../indicators/all-indicators.ts";

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
  strategy_id: string;
  position_open: boolean;
  entry_price?: number;
  entry_time?: number;
  last_signal_time?: number;
  range_high?: number;
  range_low?: number;
}

// Fetch recent candles from Binance
async function fetchMarketData(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[]> {
  const baseUrl = 'https://fapi.binance.com';
  const url = `${baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch market data: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.map((k: any) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    timestamp: k[0],
  }));
}

// Calculate indicator value
function calculateIndicator(
  type: string,
  candles: Candle[],
  params: any
): number | null {
  const closes = candles.map(c => c.close);
  
  try {
    switch (type.toLowerCase()) {
      case 'sma':
        const sma = indicators.calculateSMA(closes, params.period_1 || 20);
        return sma[sma.length - 1];
      
      case 'ema':
        const ema = indicators.calculateEMA(closes, params.period_1 || 20);
        return ema[ema.length - 1];
      
      case 'rsi':
        const rsi = indicators.calculateRSI(closes, params.period_1 || 14);
        return rsi[rsi.length - 1];
      
      case 'macd':
        const macd = indicators.calculateMACD(closes, 12, 26, 9);
        return macd.macd[macd.macd.length - 1];
      
      case 'bollinger_upper':
        const bb = indicators.calculateBollingerBands(closes, params.period_1 || 20, params.deviation || 2);
        return bb.upper[bb.upper.length - 1];
      
      case 'bollinger_lower':
        const bbLower = indicators.calculateBollingerBands(closes, params.period_1 || 20, params.deviation || 2);
        return bbLower.lower[bbLower.lower.length - 1];
      
      case 'atr':
        const atr = indicators.calculateATR(candles, params.period_1 || 14);
        return atr[atr.length - 1];
      
      case 'price':
        return closes[closes.length - 1];
      
      case 'volume':
        return candles[candles.length - 1].volume;
      
      default:
        console.warn(`Unknown indicator type: ${type}`);
        return null;
    }
  } catch (error) {
    console.error(`Error calculating ${type}:`, error);
    return null;
  }
}

// Evaluate condition
function evaluateCondition(
  condition: any,
  candles: Candle[]
): boolean {
  const value1 = calculateIndicator(condition.indicator_type, candles, condition);
  
  if (value1 === null) return false;
  
  let value2: number;
  if (condition.indicator_type_2) {
    const calc = calculateIndicator(condition.indicator_type_2, candles, {
      period_1: condition.period_2,
      deviation: condition.deviation,
    });
    if (calc === null) return false;
    value2 = calc;
  } else {
    value2 = condition.value;
  }
  
  switch (condition.operator.toLowerCase()) {
    case 'greater_than':
      return value1 > value2;
    case 'less_than':
      return value1 < value2;
    case 'crosses_above':
      if (candles.length < 2) return false;
      const prev1 = calculateIndicator(condition.indicator_type, candles.slice(0, -1), condition);
      const prev2 = condition.indicator_type_2
        ? calculateIndicator(condition.indicator_type_2, candles.slice(0, -1), {
            period_1: condition.period_2,
            deviation: condition.deviation,
          })
        : condition.value;
      return prev1 !== null && prev2 !== null && prev1 <= prev2 && value1 > value2;
    case 'crosses_below':
      if (candles.length < 2) return false;
      const prevCross1 = calculateIndicator(condition.indicator_type, candles.slice(0, -1), condition);
      const prevCross2 = condition.indicator_type_2
        ? calculateIndicator(condition.indicator_type_2, candles.slice(0, -1), {
            period_1: condition.period_2,
            deviation: condition.deviation,
          })
        : condition.value;
      return prevCross1 !== null && prevCross2 !== null && prevCross1 >= prevCross2 && value1 < value2;
    default:
      return false;
  }
}

// Check if all conditions are met
function checkConditions(
  conditions: any[],
  candles: Candle[]
): boolean {
  if (!conditions || conditions.length === 0) return false;
  
  // Group by logical operator (support for complex grouping)
  const results = conditions.map(c => evaluateCondition(c, candles));
  
  // For now, use AND logic (all conditions must be true)
  return results.every(r => r === true);
}

// Evaluate 4h Reentry strategy
function evaluate4hReentry(
  candles: Candle[],
  state: StrategyState,
  config: any
): { signal: 'buy' | 'sell' | 'close' | null; reason?: string } {
  const currentPrice = candles[candles.length - 1].close;
  
  // If position is open, check exit conditions
  if (state.position_open && state.entry_price) {
    const pnlPercent = ((currentPrice - state.entry_price) / state.entry_price) * 100;
    const rr = config.riskRewardRatio || 2;
    
    // Calculate stop loss and take profit based on range
    const rangeSize = (state.range_high || 0) - (state.range_low || 0);
    const stopLossPrice = state.entry_price - rangeSize;
    const takeProfitPrice = state.entry_price + (rangeSize * rr);
    
    if (currentPrice <= stopLossPrice) {
      return { signal: 'close', reason: 'Stop loss hit' };
    }
    
    if (currentPrice >= takeProfitPrice) {
      return { signal: 'close', reason: 'Take profit hit' };
    }
    
    return { signal: null };
  }
  
  // Look for 4h range and retest (simplified logic for real-time)
  // In real implementation, you'd analyze 4h candles properly
  if (candles.length >= 20) {
    const recentCandles = candles.slice(-20);
    const high = Math.max(...recentCandles.map(c => c.high));
    const low = Math.min(...recentCandles.map(c => c.low));
    const rangeSize = high - low;
    const rangeThreshold = 0.02; // 2% range
    
    // Check if price is retesting the low of the range
    if (currentPrice <= low * 1.005 && rangeSize / currentPrice > rangeThreshold) {
      state.range_high = high;
      state.range_low = low;
      return { signal: 'buy', reason: 'Retesting range low' };
    }
  }
  
  return { signal: null };
}

// Send Telegram notification
async function sendTelegramSignal(
  botToken: string,
  chatId: string,
  signal: {
    strategy_name: string;
    symbol: string;
    signal_type: string;
    price: number;
    reason?: string;
    stop_loss?: number;
    take_profit?: number;
  }
): Promise<void> {
  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const message = `
🚨 *Trading Signal Alert*

📊 ${signal.strategy_name}
💹 ${signal.symbol}
🎯 *${signal.signal_type}*
💰 $${signal.price.toFixed(2)}
${signal.stop_loss ? `🛑 SL: $${signal.stop_loss.toFixed(2)}` : ''}
${signal.take_profit ? `✅ TP: $${signal.take_profit.toFixed(2)}` : ''}

_Timestamp: ${timestamp}_
  `.trim();

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the user from the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Monitoring strategies for user: ${user.id}`);

    // Fetch user's active strategies
    const { data: strategies, error: strategiesError } = await supabase
      .from('strategies')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (strategiesError) {
      throw new Error('Failed to fetch strategies');
    }

    if (!strategies || strategies.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active strategies found', signals: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${strategies.length} active strategies`);

    // Fetch user settings for Telegram
    const { data: settings } = await supabase
      .from('user_settings')
      .select('telegram_bot_token, telegram_chat_id, telegram_enabled')
      .eq('user_id', user.id)
      .single();

    const telegramEnabled = settings?.telegram_enabled && settings?.telegram_bot_token && settings?.telegram_chat_id;

    const signals = [];

    // Process each strategy
    for (const strategy of strategies) {
      try {
        console.log(`Processing strategy: ${strategy.name} (${strategy.symbol})`);

        // Fetch recent market data
        const candles = await fetchMarketData(strategy.symbol, strategy.timeframe);

        // Get strategy state
        const { data: stateData } = await supabase
          .from('strategy_live_states')
          .select('*')
          .eq('strategy_id', strategy.id)
          .maybeSingle();

        const state: StrategyState = stateData || {
          strategy_id: strategy.id,
          position_open: false,
        };

        let signal: { signal: 'buy' | 'sell' | 'close' | null; reason?: string } = { signal: null };

        // Evaluate based on strategy type
        if (strategy.strategy_type === '4h_reentry') {
          signal = evaluate4hReentry(candles, state, strategy);
        } else {
          // Fetch standard conditions
          const { data: conditions } = await supabase
            .from('strategy_conditions')
            .select('*')
            .eq('strategy_id', strategy.id);

          const buyConditions = conditions?.filter(c => c.order_type === 'buy') || [];
          const sellConditions = conditions?.filter(c => c.order_type === 'sell') || [];

          if (!state.position_open && buyConditions.length > 0) {
            if (checkConditions(buyConditions, candles)) {
              signal = { signal: 'buy', reason: 'Buy conditions met' };
            }
          } else if (state.position_open && sellConditions.length > 0) {
            if (checkConditions(sellConditions, candles)) {
              signal = { signal: 'close', reason: 'Sell conditions met' };
            }
          }
        }

        // Process signal
        if (signal.signal) {
          const currentPrice = candles[candles.length - 1].close;
          const now = Date.now();

          // Rate limiting: Don't send duplicate signals within 5 minutes
          if (state.last_signal_time && (now - state.last_signal_time) < 300000) {
            console.log(`Rate limit: Skipping signal for ${strategy.name}`);
            continue;
          }

          signals.push({
            strategy_name: strategy.name,
            symbol: strategy.symbol,
            signal_type: signal.signal.toUpperCase(),
            price: currentPrice,
            reason: signal.reason,
          });

          // Update state
          if (signal.signal === 'buy') {
            state.position_open = true;
            state.entry_price = currentPrice;
            state.entry_time = now;
          } else if (signal.signal === 'close') {
            state.position_open = false;
            state.entry_price = undefined;
            state.entry_time = undefined;
          }
          state.last_signal_time = now;

          // Save state
          await supabase
            .from('strategy_live_states')
            .upsert({
              strategy_id: strategy.id,
              user_id: user.id,
              position_open: state.position_open,
              entry_price: state.entry_price,
              entry_time: state.entry_time ? new Date(state.entry_time).toISOString() : null,
              last_signal_time: new Date(state.last_signal_time).toISOString(),
              range_high: state.range_high,
              range_low: state.range_low,
              updated_at: new Date().toISOString(),
            });

          // Insert signal record for tracking
          await supabase
            .from('strategy_signals')
            .insert({
              user_id: user.id,
              strategy_id: strategy.id,
              symbol: strategy.symbol,
              signal_type: signal.signal.toUpperCase(),
              price: currentPrice,
              reason: signal.reason,
            });

          // Send Telegram notification
          if (telegramEnabled) {
            try {
              await sendTelegramSignal(
                settings.telegram_bot_token,
                settings.telegram_chat_id,
                {
                  strategy_name: strategy.name,
                  symbol: strategy.symbol,
                  signal_type: signal.signal.toUpperCase(),
                  price: currentPrice,
                  reason: signal.reason,
                  stop_loss: strategy.stop_loss_percent 
                    ? currentPrice * (1 - Math.abs(strategy.stop_loss_percent) / 100)
                    : undefined,
                  take_profit: strategy.take_profit_percent
                    ? currentPrice * (1 + Math.abs(strategy.take_profit_percent) / 100)
                    : undefined,
                }
              );
              console.log(`Telegram signal sent for ${strategy.name}`);
            } catch (telegramError) {
              console.error('Failed to send Telegram notification:', telegramError);
            }
          }
        }
      } catch (strategyError) {
        console.error(`Error processing strategy ${strategy.name}:`, strategyError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Monitored ${strategies.length} strategies`,
        signals,
        strategiesChecked: strategies.length,
        telegram_enabled: telegramEnabled,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in monitor-strategies:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
