import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Input validation
const validateUserId = (userId: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(userId);
};

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

    // Validate user ID
    if (!validateUserId(user.id)) {
      throw new Error('Invalid user ID format');
    }

    // Get encrypted credentials from database
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('binance_mainnet_api_key, binance_mainnet_api_secret, binance_testnet_api_key, binance_testnet_api_secret, use_testnet')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      console.error('Settings fetch error:', settingsError);
      throw new Error('Failed to fetch settings');
    }

    if (!settings) {
      console.error('No settings found for user:', user.id);
      throw new Error('No settings found');
    }

    console.log('Settings found:', {
      use_testnet: settings.use_testnet,
      has_testnet_key: !!settings.binance_testnet_api_key,
      has_testnet_secret: !!settings.binance_testnet_api_secret,
      has_mainnet_key: !!settings.binance_mainnet_api_key,
      has_mainnet_secret: !!settings.binance_mainnet_api_secret,
    });

    // Select correct credentials based on testnet mode
    const apiKey = settings.use_testnet 
      ? settings.binance_testnet_api_key 
      : settings.binance_mainnet_api_key;
    
    const apiSecret = settings.use_testnet 
      ? settings.binance_testnet_api_secret 
      : settings.binance_mainnet_api_secret;

    if (!apiKey || !apiSecret) {
      console.error('Missing credentials:', {
        mode: settings.use_testnet ? 'testnet' : 'mainnet',
        has_key: !!apiKey,
        has_secret: !!apiSecret,
      });
      throw new Error(`Binance API credentials not configured for ${settings.use_testnet ? 'testnet' : 'mainnet'}`);
    }

    console.log(`Using ${settings.use_testnet ? 'testnet' : 'mainnet'} credentials`);

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
      encoder.encode(apiSecret),
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
        'X-MBX-APIKEY': apiKey,
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
