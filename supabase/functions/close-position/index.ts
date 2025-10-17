import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';
import { enhancedTelegramSignaler, PositionEvent } from '../helpers/enhanced-telegram-signaler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { symbol, closeAll } = await req.json();

    // Get user settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError) throw settingsError;

    const apiKey = settings.use_testnet 
      ? settings.binance_testnet_api_key 
      : settings.binance_mainnet_api_key;
    const apiSecret = settings.use_testnet 
      ? settings.binance_testnet_api_secret 
      : settings.binance_mainnet_api_secret;

    if (!apiKey || !apiSecret) {
      throw new Error('Binance API credentials not configured');
    }

    const baseUrl = settings.use_testnet
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';

    console.log(`Closing position(s) for user ${user.id.substring(0, 8)}...`);

    // Helper function to create signature
    const createSignature = (queryString: string) => {
      return createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');
    };

    // Get current positions
    const timestamp = Date.now();
    const positionsQuery = `timestamp=${timestamp}`;
    const positionsSignature = createSignature(positionsQuery);
    
    const positionsResponse = await fetch(
      `${baseUrl}/fapi/v2/positionRisk?${positionsQuery}&signature=${positionsSignature}`,
      {
        headers: {
          'X-MBX-APIKEY': apiKey,
        },
      }
    );

    if (!positionsResponse.ok) {
      throw new Error('Failed to fetch positions from Binance');
    }

    const positions = await positionsResponse.json();
    const openPositions = positions.filter((p: any) => parseFloat(p.positionAmt) !== 0);

    console.log(`Found ${openPositions.length} open positions`);

    const closedPositions = [];

    for (const position of openPositions) {
      // Skip if we're only closing a specific symbol and this isn't it
      if (!closeAll && position.symbol !== symbol) {
        continue;
      }

      const positionAmt = parseFloat(position.positionAmt);
      const side = positionAmt > 0 ? 'SELL' : 'BUY'; // Opposite side to close
      const quantity = Math.abs(positionAmt);

      console.log(`Closing ${position.symbol}: ${side} ${quantity}`);

      // Place market order to close position
      const orderTimestamp = Date.now();
      const orderParams = new URLSearchParams({
        symbol: position.symbol,
        side: side,
        type: 'MARKET',
        quantity: quantity.toString(),
        timestamp: orderTimestamp.toString(),
      });

      const orderSignature = createSignature(orderParams.toString());
      orderParams.append('signature', orderSignature);

      const orderResponse = await fetch(
        `${baseUrl}/fapi/v1/order`,
        {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: orderParams.toString(),
        }
      );

      if (!orderResponse.ok) {
        const errorData = await orderResponse.text();
        console.error(`Failed to close ${position.symbol}:`, errorData);
        throw new Error(`Failed to close position for ${position.symbol}`);
      }

      const orderData = await orderResponse.json();
      closedPositions.push({
        symbol: position.symbol,
        side: side,
        quantity: quantity,
        orderId: orderData.orderId,
      });

      // Update strategy live state if it exists
      const { data: liveState } = await supabaseClient
        .from('strategy_live_states')
        .select('id, strategy_id')
        .eq('user_id', user.id)
        .eq('position_open', true)
        .limit(1)
        .single();

      if (liveState) {
        const { data: entryPriceData } = await supabaseClient
          .from('strategy_live_states')
          .select('entry_price')
          .eq('id', liveState.id)
          .single();
        
        await supabaseClient
          .from('strategy_live_states')
          .update({
            position_open: false,
            entry_price: null,
            entry_time: null,
          })
          .eq('id', liveState.id);

        console.log(`Updated strategy live state for ${position.symbol}`);
        
        // Send "Position Closed" Telegram notification
        const { data: userSettingsData } = await supabaseClient
          .from('user_settings')
          .select('telegram_enabled, telegram_bot_token, telegram_chat_id')
          .eq('user_id', user.id)
          .single();
        
        const { data: strategyData } = await supabaseClient
          .from('strategies')
          .select('id, name')
          .eq('id', liveState.strategy_id)
          .single();
        
        if (userSettingsData?.telegram_enabled && userSettingsData.telegram_bot_token && userSettingsData.telegram_chat_id) {
          try {
            const pnlPercent = entryPriceData?.entry_price 
              ? (((parseFloat(position.markPrice) - parseFloat(entryPriceData.entry_price)) / parseFloat(entryPriceData.entry_price)) * 100)
              : 0;
            
            const pnlAmount = entryPriceData?.entry_price 
              ? parseFloat(position.markPrice) - parseFloat(entryPriceData.entry_price)
              : 0;

            // Create position event with enhanced signaling
            const positionEvent: PositionEvent = {
              id: crypto.randomUUID(),
              signalId: `close_${Date.now()}`,
              originalSignalId: (entryPriceData as any)?.signal_id, // Reference to original signal
              eventType: 'closed',
              symbol: position.symbol,
              entryPrice: parseFloat(entryPriceData?.entry_price || '0'),
              exitPrice: parseFloat(position.markPrice),
              positionSize: parseFloat(position.positionAmt),
              pnlPercent: pnlPercent,
              pnlAmount: pnlAmount,
              reason: 'Manual Close',
              timestamp: Date.now(),
              tradingMode: (userSettingsData as any).trading_mode || 'mainnet_only'
            };

            // Send enhanced Telegram notification
            await enhancedTelegramSignaler.sendPositionEvent(positionEvent, userSettingsData);
            
            // Store position event in database
            await supabaseClient
              .from('position_events')
              .insert({
                signal_id: positionEvent.signalId,
                original_signal_id: positionEvent.originalSignalId,
                user_id: user.id,
                strategy_id: strategyData?.id,
                event_type: positionEvent.eventType,
                symbol: positionEvent.symbol,
                entry_price: positionEvent.entryPrice,
                exit_price: positionEvent.exitPrice,
                position_size: positionEvent.positionSize,
                pnl_percent: positionEvent.pnlPercent,
                pnl_amount: positionEvent.pnlAmount,
                reason: positionEvent.reason,
                timestamp: new Date(positionEvent.timestamp).toISOString(),
                trading_mode: positionEvent.tradingMode
              });
            
            console.log(`[ENHANCED-CLOSE] Sent enhanced position closed notification for ${position.symbol}`);
          } catch (telegramError) {
            console.error('[ENHANCED-CLOSE] Failed to send enhanced Telegram notification:', telegramError);
          }
        }
      }
    }

    console.log(`Successfully closed ${closedPositions.length} position(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        closedPositions: closedPositions,
        message: `Successfully closed ${closedPositions.length} position(s)`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error closing position:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
