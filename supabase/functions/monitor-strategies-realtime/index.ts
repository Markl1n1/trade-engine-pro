import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXCHANGE_URLS = {
  binance: {
    mainnet: 'https://fapi.binance.com',
    testnet: 'https://testnet.binancefuture.com',
  },
  bybit: {
    mainnet: 'https://api.bybit.com',
    testnet: 'https://api-testnet.bybit.com',
  },
};

const INTERVAL_MAPPING: Record<string, Record<string, string>> = {
  binance: { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' },
  bybit: { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' },
};

// Fetch market data from exchange
async function fetchMarketData(symbol: string, interval: string, limit: number, config: any) {
  const exchange = (config.exchange_type || 'binance') as 'binance' | 'bybit';
  const baseUrl = config.use_testnet ? EXCHANGE_URLS[exchange].testnet : EXCHANGE_URLS[exchange].mainnet;
  const mappedInterval = INTERVAL_MAPPING[exchange][interval] || interval;
  
  const endpoint = exchange === 'binance' 
    ? `/fapi/v1/klines?symbol=${symbol}&interval=${mappedInterval}&limit=${limit}`
    : `/v5/market/kline?category=linear&symbol=${symbol}&interval=${mappedInterval}&limit=${limit}`;
  
  const response = await fetch(`${baseUrl}${endpoint}`);
  const data = await response.json();
  
  if (exchange === 'binance') {
    return data.map((k: any) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } else {
    return data.result.list.reverse().map((k: any) => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }
}

// Calculate indicators
function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      result.push(ema);
    } else {
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }
  }
  return result;
}

function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const changes: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1]);
  }
  
  for (let i = 0; i < changes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = changes.slice(i - period + 1, i + 1);
      const gains = slice.filter(x => x > 0).reduce((a, b) => a + b, 0) / period;
      const losses = Math.abs(slice.filter(x => x < 0).reduce((a, b) => a + b, 0)) / period;
      const rs = gains / (losses || 0.0001);
      result.push(100 - (100 / (1 + rs)));
    }
  }
  
  result.unshift(NaN);
  return result;
}

// Evaluate standard conditions
function evaluateCondition(condition: any, indicators: any, candles: any[]): boolean {
  const { indicator_type, operator, value, period_1 } = condition;
  const lastCandle = candles[candles.length - 1];
  
  let indicatorValue: number;
  
  switch (indicator_type) {
    case 'price':
      indicatorValue = lastCandle.close;
      break;
    case 'sma':
      const closes = candles.map(c => c.close);
      const sma = calculateSMA(closes, period_1 || 20);
      indicatorValue = sma[sma.length - 1];
      break;
    case 'ema':
      const closesEma = candles.map(c => c.close);
      const ema = calculateEMA(closesEma, period_1 || 20);
      indicatorValue = ema[ema.length - 1];
      break;
    case 'rsi':
      const closesRsi = candles.map(c => c.close);
      const rsi = calculateRSI(closesRsi, period_1 || 14);
      indicatorValue = rsi[rsi.length - 1];
      break;
    default:
      return false;
  }
  
  switch (operator) {
    case 'greater_than':
      return indicatorValue > value;
    case 'less_than':
      return indicatorValue < value;
    case 'crosses_above':
      return indicatorValue > value;
    case 'crosses_below':
      return indicatorValue < value;
    default:
      return false;
  }
}

// MSTG Strategy
function evaluateMSTG(candles: any[], config: any) {
  if (candles.length < 200) return null;
  
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  
  const currentPrice = closes[closes.length - 1];
  const momentum = ((currentPrice - closes[closes.length - 20]) / closes[closes.length - 20]) * 100;
  const trendScore = currentPrice > ema50[ema50.length - 1] ? 1 : -1;
  const volatility = (Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20))) / currentPrice;
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b) / 20;
  const relativeVolume = volumes[volumes.length - 1] / avgVolume;
  
  const weights = {
    momentum: config.mstg_weight_momentum || 0.25,
    trend: config.mstg_weight_trend || 0.35,
    volatility: config.mstg_weight_volatility || 0.20,
    relative: config.mstg_weight_relative || 0.20,
  };
  
  const ts = (momentum * weights.momentum) + 
             (trendScore * 35 * weights.trend) + 
             (volatility * 100 * weights.volatility) + 
             (relativeVolume * 20 * weights.relative);
  
  const longThreshold = config.mstg_long_threshold || 30;
  const shortThreshold = config.mstg_short_threshold || -30;
  
  if (ts >= longThreshold) return { type: 'BUY', reason: `MSTG TS: ${ts.toFixed(2)}` };
  if (ts <= shortThreshold) return { type: 'SELL', reason: `MSTG TS: ${ts.toFixed(2)}` };
  
  return null;
}

// ATH Guard Strategy
function evaluateATHGuard(candles: any[], config: any, liveState: any) {
  if (candles.length < 150) return null;
  
  const closes = candles.map(c => c.close);
  const ema50 = calculateEMA(closes, 50);
  const ema100 = calculateEMA(closes, 100);
  const ema150 = calculateEMA(closes, 150);
  const rsi = calculateRSI(closes, 14);
  
  const currentPrice = closes[closes.length - 1];
  const ema150Slope = ((ema150[ema150.length - 1] - ema150[ema150.length - 10]) / ema150[ema150.length - 10]) * 100;
  
  const slopeThreshold = config.ath_guard_ema_slope_threshold || 0.15;
  
  // Check bias
  const bullish = currentPrice > ema150[ema150.length - 1] && 
                  ema50[ema50.length - 1] > ema100[ema100.length - 1] && 
                  ema100[ema100.length - 1] > ema150[ema150.length - 1] &&
                  ema150Slope > slopeThreshold;
  
  if (!bullish || liveState?.position_open) return null;
  
  const pullbackTolerance = config.ath_guard_pullback_tolerance || 0.15;
  const pullbackLevel = ema150[ema150.length - 1] * (1 + pullbackTolerance / 100);
  
  if (currentPrice <= pullbackLevel && rsi[rsi.length - 1] < 70) {
    return { type: 'BUY', reason: 'ATH Guard pullback entry' };
  }
  
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[REALTIME] User ${user.id} requesting live monitoring`);

    // Get user settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!settings) {
      return new Response(JSON.stringify({ error: 'No settings found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get active strategies
    const { data: strategies, error: stratError } = await supabase
      .from('strategies')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (stratError || !strategies || strategies.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, generatedSignals: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const generatedSignals: any[] = [];

    for (const strategy of strategies) {
      try {
        // Fetch market data
        const candles = await fetchMarketData(
          strategy.symbol,
          strategy.timeframe,
          200,
          settings
        );

        if (!candles || candles.length === 0) continue;

        const lastCandle = candles[candles.length - 1];

        // Get live state
        const { data: liveState } = await supabase
          .from('strategy_live_states')
          .select('*')
          .eq('strategy_id', strategy.id)
          .single();

        // Skip if already processed this candle
        if (liveState?.last_processed_candle_time === lastCandle.timestamp) {
          continue;
        }

        let signal = null;

        // Evaluate based on strategy type
        if (strategy.strategy_type === 'mstg') {
          signal = evaluateMSTG(candles, strategy);
        } else if (strategy.strategy_type === 'ath_guard') {
          signal = evaluateATHGuard(candles, strategy, liveState);
        } else {
          // Standard strategy with conditions
          const { data: conditions } = await supabase
            .from('strategy_conditions')
            .select('*')
            .eq('strategy_id', strategy.id)
            .order('order_index');

          const buyConditions = conditions?.filter(c => c.order_type === 'buy') || [];
          const sellConditions = conditions?.filter(c => c.order_type === 'sell') || [];

          const buyMet = buyConditions.length > 0 && 
                        buyConditions.every(c => evaluateCondition(c, {}, candles));
          const sellMet = sellConditions.length > 0 && 
                         sellConditions.every(c => evaluateCondition(c, {}, candles));

          if (buyMet && !liveState?.position_open) {
            signal = { type: 'BUY', reason: 'Conditions met' };
          } else if (sellMet && liveState?.position_open) {
            signal = { type: 'SELL', reason: 'Conditions met' };
          }
        }

        if (signal) {
          // Insert signal
          const { data: newSignal, error: insertError } = await supabase
            .from('strategy_signals')
            .insert({
              strategy_id: strategy.id,
              user_id: user.id,
              symbol: strategy.symbol,
              signal_type: signal.type,
              price: lastCandle.close,
              reason: signal.reason,
              candle_close_time: lastCandle.timestamp,
              signal_hash: `${strategy.id}_${signal.type}_${lastCandle.timestamp}`,
            })
            .select()
            .single();

          if (!insertError && newSignal) {
            generatedSignals.push(newSignal);
            console.log(`[REALTIME] Generated ${signal.type} signal for ${strategy.name}`);
          }
        }

        // Update live state
        await supabase
          .from('strategy_live_states')
          .upsert({
            strategy_id: strategy.id,
            user_id: user.id,
            last_processed_candle_time: lastCandle.timestamp,
            last_signal_time: signal ? new Date().toISOString() : liveState?.last_signal_time,
            position_open: signal?.type === 'BUY' ? true : signal?.type === 'SELL' ? false : liveState?.position_open || false,
            entry_price: signal?.type === 'BUY' ? lastCandle.close : liveState?.entry_price,
          });

      } catch (error) {
        console.error(`[REALTIME] Error processing strategy ${strategy.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: strategies.length,
        generatedSignals,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[REALTIME] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
