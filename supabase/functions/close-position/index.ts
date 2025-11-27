import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';
import { enhancedTelegramSignaler, PositionEvent } from '../helpers/enhanced-telegram-signaler.ts';
import { closePositionSchema, validateInput } from '../helpers/input-validation.ts';
import { sanitizeError, handleError } from '../helpers/error-sanitizer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let user;
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

    const { data: { user: authUser } } = await supabaseClient.auth.getUser();
    user = authUser;
    if (!user) {
      throw new Error('Unauthorized');
    }

    const body = await req.json();
    const { symbol, closeAll } = validateInput(closePositionSchema, body);

    // Create service role client for RPC calls
    const supabaseServiceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError) throw settingsError;

    // Retrieve Bybit API credentials from secure vault
    const exchangeType = settings.exchange_type || 'bybit';
    const credentialType = exchangeType === 'bybit' 
      ? (settings.use_testnet ? 'bybit_testnet' : 'bybit_mainnet')
      : (settings.use_testnet ? 'bybit_testnet' : 'bybit_mainnet'); // Default to Bybit
    
    const { data: credentials, error: credError } = await supabaseServiceClient
      .rpc('retrieve_credential', {
        p_user_id: user.id,
        p_credential_type: credentialType
      });

    let apiKey: string | null = null;
    let apiSecret: string | null = null;

    if (credError || !credentials || credentials.length === 0) {
      const sanitizedError = sanitizeError(credError);
      throw new Error(`API credentials not found or could not be decrypted. Please configure your API keys in Settings. ${sanitizedError}`);
    }

    // Use decrypted credentials
    apiKey = credentials[0].api_key;
    apiSecret = credentials[0].api_secret;

    if (!apiKey || !apiSecret) {
      throw new Error('Bybit API credentials not configured');
    }

    const baseUrl = settings.use_testnet
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';

    console.log(`Closing position(s) for user ${user.id.substring(0, 8)}...`);

    // Helper function to create Bybit signature
    const createBybitSignature = (params: string) => {
      return createHmac('sha256', apiSecret)
        .update(params)
        .digest('hex');
    };

    // Get current positions from Bybit
    const timestamp = Date.now();
    const recvWindow = '5000';
    const signParams = `${timestamp}${apiKey}${recvWindow}category=linear`;
    const signature = createBybitSignature(signParams);
    
    const positionsResponse = await fetch(
      `${baseUrl}/v5/position/list?category=linear`,
      {
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'Content-Type': 'application/json'
        },
      }
    );

    if (!positionsResponse.ok) {
      const errorText = await positionsResponse.text();
      throw new Error(`Failed to fetch positions from Bybit: ${errorText}`);
    }

    const positionsData = await positionsResponse.json();
    if (positionsData.retCode !== 0) {
      throw new Error(`Bybit API error: ${positionsData.retMsg}`);
    }
    
    const openPositions = (positionsData.result?.list || []).filter((p: any) => parseFloat(p.size) !== 0);

    console.log(`Found ${openPositions.length} open positions`);

    const closedPositions = [];

    for (const position of openPositions) {
      // Skip if we're only closing a specific symbol and this isn't it
      if (!closeAll && position.symbol !== symbol) {
        continue;
      }

      const positionSize = parseFloat(position.size);
      const closeSide = position.side === 'Buy' ? 'Sell' : 'Buy'; // Opposite side to close
      const isLongPosition = position.side === 'Buy'; // Original position direction
      const quantity = Math.abs(positionSize);

      console.log(`Closing ${position.symbol}: ${closeSide} ${quantity} (was ${position.side})`);

      // Place market order to close position via Bybit
      const orderTimestamp = Date.now();
      const orderRecvWindow = '5000';
      const orderBody = JSON.stringify({
        category: 'linear',
        symbol: position.symbol,
        side: closeSide,
        orderType: 'Market',
        qty: quantity.toFixed(3),
        reduceOnly: true
      });
      
      const orderSignParams = `${orderTimestamp}${apiKey}${orderRecvWindow}${orderBody}`;
      const orderSignature = createBybitSignature(orderSignParams);

      const orderResponse = await fetch(
        `${baseUrl}/v5/order/create`,
        {
          method: 'POST',
          headers: {
            'X-BAPI-API-KEY': apiKey,
            'X-BAPI-TIMESTAMP': orderTimestamp.toString(),
            'X-BAPI-SIGN': orderSignature,
            'X-BAPI-RECV-WINDOW': orderRecvWindow,
            'Content-Type': 'application/json'
          },
          body: orderBody,
        }
      );

      if (!orderResponse.ok) {
        const errorData = await orderResponse.text();
        console.error(`Failed to close ${position.symbol}:`, errorData);
        throw new Error(`Failed to close position for ${position.symbol}`);
      }

      const orderResult = await orderResponse.json();
      if (orderResult.retCode !== 0) {
        throw new Error(`Bybit order error: ${orderResult.retMsg}`);
      }
      
      const orderData = orderResult.result;
      closedPositions.push({
        symbol: position.symbol,
        side: closeSide,
        quantity: quantity,
        orderId: orderData.orderId,
      });

      // Update strategy live state if it exists
      const { data: liveState } = await supabaseClient
        .from('strategy_live_states')
        .select('id, strategy_id, entry_price')
        .eq('user_id', user.id)
        .eq('position_open', true)
        .limit(1)
        .single();

      if (liveState) {
        await supabaseClient
          .from('strategy_live_states')
          .update({
            position_open: false,
            entry_price: null,
            entry_time: null,
          })
          .eq('id', liveState.id);

        console.log(`Updated strategy live state for ${position.symbol}`);
        
        // Calculate P&L correctly based on position direction
        const entryPrice = parseFloat(liveState.entry_price || position.avgPrice || '0');
        const exitPrice = parseFloat(position.markPrice);
        
        // FIX: Correct P&L calculation for LONG vs SHORT positions
        // LONG: profit when exitPrice > entryPrice
        // SHORT: profit when exitPrice < entryPrice
        let pnlPercent = 0;
        let pnlAmount = 0;
        
        if (entryPrice > 0) {
          if (isLongPosition) {
            // LONG position: (exit - entry) / entry
            pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
            pnlAmount = (exitPrice - entryPrice) * quantity;
          } else {
            // SHORT position: (entry - exit) / entry
            pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
            pnlAmount = (entryPrice - exitPrice) * quantity;
          }
        }
        
        console.log(`[CLOSE-POSITION] P&L calculation: ${isLongPosition ? 'LONG' : 'SHORT'} position, entry=${entryPrice}, exit=${exitPrice}, pnl%=${pnlPercent.toFixed(2)}%`);
        
        // Send "Position Closed" Telegram notification
        const { data: userSettingsData } = await supabaseClient
          .from('user_settings')
          .select('telegram_enabled, telegram_bot_token, telegram_chat_id, trading_mode')
          .eq('user_id', user.id)
          .single();
        
        const { data: strategyData } = await supabaseClient
          .from('strategies')
          .select('id, name')
          .eq('id', liveState.strategy_id)
          .single();
        
        if (userSettingsData?.telegram_enabled && userSettingsData.telegram_bot_token && userSettingsData.telegram_chat_id) {
          try {
            // Create position event with enhanced signaling
            const positionEvent: PositionEvent = {
              id: crypto.randomUUID(),
              signalId: `close_${Date.now()}`,
              originalSignalId: undefined,
              eventType: 'closed',
              symbol: position.symbol,
              entryPrice: entryPrice,
              exitPrice: exitPrice,
              positionSize: quantity,
              pnlPercent: pnlPercent,
              pnlAmount: pnlAmount,
              reason: 'Manual Close',
              timestamp: Date.now(),
              tradingMode: userSettingsData.trading_mode || 'mainnet_only'
            };

            // Send enhanced Telegram notification
            await enhancedTelegramSignaler.sendPositionEvent(positionEvent, userSettingsData);
            
            // Store position event in database
            await supabaseClient
              .from('position_events')
              .insert({
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
                timestamp: new Date(positionEvent.timestamp).toISOString()
              });
            
            console.log(`[ENHANCED-CLOSE] Sent enhanced position closed notification for ${position.symbol}, P&L: ${pnlPercent.toFixed(2)}%`);
          } catch (telegramError) {
            console.error('[ENHANCED-CLOSE] Failed to send enhanced Telegram notification:', telegramError);
          }
        }

        // Update order_executions if exists
        await supabaseServiceClient
          .from('order_executions')
          .update({
            closed_at: new Date().toISOString(),
            exit_price: exitPrice,
            pnl_percent: pnlPercent,
            pnl_amount: pnlAmount,
            close_reason: 'Manual Close',
            status: 'closed'
          })
          .eq('strategy_id', liveState.strategy_id)
          .eq('user_id', user.id)
          .eq('status', 'filled');
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
    const { handleError } = await import('../helpers/error-sanitizer.ts');
    const sanitizedMessage = handleError({
      function: 'close-position',
      userId: user?.id,
      error,
    });
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: sanitizedMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
