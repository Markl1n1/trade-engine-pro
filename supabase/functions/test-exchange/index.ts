import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { makeExchangeRequest, parseAccountData, ExchangeConfig } from '../helpers/exchange-api.ts';

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
      .select('exchange_type, binance_mainnet_api_key, binance_mainnet_api_secret, binance_testnet_api_key, binance_testnet_api_secret, bybit_mainnet_api_key, bybit_mainnet_api_secret, bybit_testnet_api_key, bybit_testnet_api_secret, use_testnet')
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

    const exchangeType = (settings.exchange_type as 'binance' | 'bybit') || 'binance';

    console.log('Settings found:', {
      exchange_type: exchangeType,
      use_testnet: settings.use_testnet,
      has_testnet_key: exchangeType === 'binance' ? !!settings.binance_testnet_api_key : !!settings.bybit_testnet_api_key,
      has_testnet_secret: exchangeType === 'binance' ? !!settings.binance_testnet_api_secret : !!settings.bybit_testnet_api_secret,
      has_mainnet_key: exchangeType === 'binance' ? !!settings.binance_mainnet_api_key : !!settings.bybit_mainnet_api_key,
      has_mainnet_secret: exchangeType === 'binance' ? !!settings.binance_mainnet_api_secret : !!settings.bybit_mainnet_api_secret,
    });

    // Select correct credentials based on exchange and testnet mode
    let apiKey: string;
    let apiSecret: string;

    if (exchangeType === 'binance') {
      apiKey = settings.use_testnet 
        ? settings.binance_testnet_api_key 
        : settings.binance_mainnet_api_key;
      apiSecret = settings.use_testnet 
        ? settings.binance_testnet_api_secret 
        : settings.binance_mainnet_api_secret;
    } else {
      apiKey = settings.use_testnet 
        ? settings.bybit_testnet_api_key 
        : settings.bybit_mainnet_api_key;
      apiSecret = settings.use_testnet 
        ? settings.bybit_testnet_api_secret 
        : settings.bybit_mainnet_api_secret;
    }

    if (!apiKey || !apiSecret) {
      console.error('Missing credentials:', {
        exchange: exchangeType,
        mode: settings.use_testnet ? 'testnet' : 'mainnet',
        has_key: !!apiKey,
        has_secret: !!apiSecret,
      });
      throw new Error(`${exchangeType === 'binance' ? 'Binance' : 'Bybit'} API credentials not configured for ${settings.use_testnet ? 'testnet' : 'mainnet'}`);
    }

    console.log(`Using ${exchangeType} ${settings.use_testnet ? 'testnet' : 'mainnet'} credentials`);

    // Create exchange config
    const config: ExchangeConfig = {
      exchange: exchangeType,
      apiKey,
      apiSecret,
      testnet: settings.use_testnet
    };

    // Make request to exchange API
    const accountData = await makeExchangeRequest(config, 'account');
    
    // Parse account data to unified format
    const parsed = parseAccountData(accountData, exchangeType);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Connected to ${exchangeType === 'binance' ? 'Binance' : 'Bybit'} successfully`,
        data: {
          ...parsed,
          environment: settings.use_testnet ? 'testnet' : 'mainnet',
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error testing exchange connection:', error);
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
