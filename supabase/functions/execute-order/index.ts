import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { getBybitConstraints, roundToStepSize, roundToTickSize, validateOrder } from '../helpers/exchange-constraints.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExecuteOrderRequest {
  signal_id: string;
  strategy_id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  signal_type: 'BUY' | 'SELL';
  price: number;
  stop_loss?: number;
  take_profit?: number;
  position_size_percent: number;
  initial_capital?: number;
  use_testnet: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let user;
  try {
    const authHeader = req.headers.get('Authorization');
    const userIdHeader = req.headers.get('x-user-id');
    
    // Support both user auth and service role with user-id header (for cron calls)
    let supabaseClient;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      // Check if it's service role key
      if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
        // Service role call - use user-id header
        if (!userIdHeader) {
          throw new Error('x-user-id header required when using service role key');
        }
        const supabaseServiceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        // Get user by ID
        const { data: userData, error: userError } = await supabaseServiceClient.auth.admin.getUserById(userIdHeader);
        if (userError || !userData?.user) {
          throw new Error(`User not found: ${userError?.message || 'Unknown error'}`);
        }
        user = userData.user;
        supabaseClient = supabaseServiceClient;
      } else {
        // Regular user token
        supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          {
            global: {
              headers: { Authorization: authHeader },
            },
          }
        );
        const { data: { user: authUser } } = await supabaseClient.auth.getUser();
        user = authUser;
        if (!user) {
          throw new Error('Unauthorized');
        }
      }
    } else {
      throw new Error('Authorization header required');
    }

    const body: ExecuteOrderRequest = await req.json();
    const {
      signal_id,
      strategy_id,
      symbol,
      side,
      signal_type,
      price,
      stop_loss,
      take_profit,
      position_size_percent,
      initial_capital,
      use_testnet,
    } = body;

    // Validate required fields
    if (!signal_id || !strategy_id || !symbol || !side || !price) {
      throw new Error('Missing required fields: signal_id, strategy_id, symbol, side, price');
    }

    // Create service role client for credential retrieval
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
    const credentialType = use_testnet ? 'bybit_testnet' : 'bybit_mainnet';
    
    const { data: credentials, error: credError } = await supabaseServiceClient
      .rpc('retrieve_credential', {
        p_user_id: user.id,
        p_credential_type: credentialType
      });

    if (credError || !credentials || credentials.length === 0) {
      throw new Error(`API credentials not found for ${credentialType}. Please configure your API keys in Settings.`);
    }

    const apiKey = credentials[0].api_key;
    const apiSecret = credentials[0].api_secret;

    if (!apiKey || !apiSecret) {
      throw new Error('Bybit API credentials not configured');
    }

    const baseUrl = use_testnet
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';

    console.log(`[EXECUTE-ORDER] Executing ${side} order for ${symbol} at ${price} (${use_testnet ? 'TESTNET' : 'MAINNET'})`);

    // Get exchange constraints
    const constraints = getBybitConstraints(symbol);

    // Calculate position size
    // Get account balance
    const timestamp = Date.now();
    const recvWindow = '5000';
    const queryString = 'accountType=UNIFIED';
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(timestamp + apiKey + recvWindow + queryString)
    );
    
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const accountResponse = await fetch(
      `${baseUrl}/v5/account/wallet-balance?${queryString}`,
      {
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'X-BAPI-SIGN': signatureHex,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!accountResponse.ok) {
      const errorText = await accountResponse.text();
      throw new Error(`Failed to fetch account balance: ${errorText}`);
    }

    const accountData = await accountResponse.json();
    if (accountData.retCode !== 0) {
      throw new Error(`Bybit API error: ${accountData.retMsg}`);
    }

    const account = accountData.result.list?.[0];
    const usdtBalance = account?.coin?.find((c: any) => c.coin === 'USDT')?.walletBalance || '0';
    const availableBalance = parseFloat(usdtBalance);

    // Calculate position size based on position_size_percent
    const positionValue = (availableBalance * position_size_percent) / 100;
    const quantity = positionValue / price;

    // Round quantity to step size
    const roundedQuantity = roundToStepSize(quantity, constraints.stepSize);
    
    // Round price to tick size
    const roundedPrice = roundToTickSize(price, constraints.priceTick);

    // Validate order
    const validation = validateOrder(roundedQuantity, roundedPrice, constraints);
    if (!validation.valid) {
      throw new Error(`Order validation failed: ${validation.reason}`);
    }

    // Ensure minimum quantity
    if (roundedQuantity < constraints.minQty) {
      throw new Error(`Calculated quantity ${roundedQuantity} is below minimum ${constraints.minQty}`);
    }

    // Ensure minimum notional
    const notional = roundedQuantity * roundedPrice;
    if (notional < constraints.minNotional) {
      throw new Error(`Notional value ${notional} is below minimum ${constraints.minNotional} USDT`);
    }

    console.log(`[EXECUTE-ORDER] Order details: ${roundedQuantity} ${symbol} at ${roundedPrice} (notional: ${notional.toFixed(2)} USDT)`);

    // Create order on Bybit
    const orderTimestamp = Date.now();
    const orderBody = JSON.stringify({
      category: 'linear',
      symbol: symbol,
      side: side,
      orderType: 'Market',
      qty: roundedQuantity.toFixed(constraints.stepSize.toString().split('.')[1]?.length || 3),
      reduceOnly: false,
    });

    const orderSignParams = `${orderTimestamp}${apiKey}${recvWindow}${orderBody}`;
    const orderSignature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(orderSignParams)
    );
    
    const orderSignatureHex = Array.from(new Uint8Array(orderSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const orderResponse = await fetch(
      `${baseUrl}/v5/order/create`,
      {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': orderTimestamp.toString(),
          'X-BAPI-SIGN': orderSignatureHex,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'Content-Type': 'application/json'
        },
        body: orderBody,
      }
    );

    if (!orderResponse.ok) {
      const errorData = await orderResponse.text();
      console.error(`[EXECUTE-ORDER] Failed to create order:`, errorData);
      throw new Error(`Failed to create order: ${errorData}`);
    }

    const orderResult = await orderResponse.json();
    if (orderResult.retCode !== 0) {
      throw new Error(`Bybit order error: ${orderResult.retMsg}`);
    }

    const orderData = orderResult.result;
    console.log(`[EXECUTE-ORDER] Order created successfully: ${orderData.orderId}`);

    // Update strategy live state
    await supabaseClient
      .from('strategy_live_states')
      .upsert({
        strategy_id: strategy_id,
        user_id: user.id,
        position_open: true,
        entry_price: roundedPrice,
        entry_time: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'strategy_id'
      });

    // Store order execution record
    const { error: insertError } = await supabaseClient
      .from('order_executions')
      .insert({
        signal_id: signal_id,
        strategy_id: strategy_id,
        user_id: user.id,
        symbol: symbol,
        side: side,
        order_id: orderData.orderId,
        quantity: roundedQuantity,
        price: roundedPrice,
        stop_loss: stop_loss,
        take_profit: take_profit,
        status: 'filled',
        exchange: 'bybit',
        testnet: use_testnet,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      // Table might not exist, log but don't fail
      console.warn('[EXECUTE-ORDER] Could not save order execution record:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderData.orderId,
        symbol: symbol,
        side: side,
        quantity: roundedQuantity,
        price: roundedPrice,
        notional: notional,
        message: `Order executed successfully on ${use_testnet ? 'TESTNET' : 'MAINNET'}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[EXECUTE-ORDER] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to execute order',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

