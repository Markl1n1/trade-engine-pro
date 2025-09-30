import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the user from the authorization header
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user settings using the secure function
    const { data: credentials, error: credentialsError } = await supabase
      .rpc('get_user_api_credentials', { user_uuid: user.id });

    if (credentialsError || !credentials || credentials.length === 0) {
      throw new Error('API credentials not found');
    }

    const settings = credentials[0];

    if (!settings.binance_api_key || !settings.binance_api_secret) {
      throw new Error('Binance API credentials not configured');
    }

    // Determine base URL based on testnet setting
    const baseUrl = settings.use_testnet 
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';

    // Create signed request for account endpoint
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    // Create HMAC signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(settings.binance_api_secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(queryString)
    );
    
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Make request to Binance API
    const binanceUrl = `${baseUrl}/fapi/v2/account?${queryString}&signature=${signatureHex}`;
    
    const binanceResponse = await fetch(binanceUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': settings.binance_api_key,
      },
    });

    if (!binanceResponse.ok) {
      const errorData = await binanceResponse.text();
      console.error('Binance API error:', errorData);
      throw new Error(`Binance API error: ${errorData}`);
    }

    const accountData = await binanceResponse.json();

    // Extract relevant account information
    const balances = accountData.assets
      ?.filter((asset: any) => parseFloat(asset.walletBalance) > 0)
      .map((asset: any) => ({
        asset: asset.asset,
        balance: parseFloat(asset.walletBalance),
        unrealizedProfit: parseFloat(asset.unrealizedProfit),
      })) || [];

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Connected to Binance successfully',
        data: {
          canTrade: accountData.canTrade,
          canDeposit: accountData.canDeposit,
          canWithdraw: accountData.canWithdraw,
          totalWalletBalance: accountData.totalWalletBalance,
          totalUnrealizedProfit: accountData.totalUnrealizedProfit,
          balances: balances,
          environment: settings.use_testnet ? 'testnet' : 'mainnet',
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error testing Binance connection:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
