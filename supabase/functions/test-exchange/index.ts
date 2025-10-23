import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sanitizeError, handleError } from '../helpers/error-sanitizer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestExchangeRequest {
  useTestnet: boolean;
  exchangeType?: 'bybit';
}

interface TestExchangeResponse {
  success: boolean;
  data?: {
    environment: 'testnet' | 'mainnet';
    totalWalletBalance: number;
    exchangeType: string;
  };
  error?: string;
}

Deno.serve(async (req): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let user;
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(token);
    user = authUser;

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: TestExchangeRequest = await req.json();
    const { useTestnet, exchangeType = 'bybit' } = body;

    console.log(`[TEST-EXCHANGE] Testing ${exchangeType} ${useTestnet ? 'testnet' : 'mainnet'} connection`);

    // Determine which exchange to test (default to Bybit)
    const actualExchangeType = exchangeType || 'bybit';
    const isTestnet = useTestnet;
    
    // Determine credential type based on exchange and environment
    const credentialType = actualExchangeType === 'bybit' 
      ? (useTestnet ? 'bybit_testnet' : 'bybit_mainnet')
      : (useTestnet ? 'binance_testnet' : 'binance_mainnet');

    // Retrieve API credentials from secure vault
    const { data: credentials, error: credError } = await supabaseClient
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
      throw new Error(`${actualExchangeType.toUpperCase()} ${useTestnet ? 'testnet' : 'mainnet'} API credentials not configured`);
    }

    // Test Bybit connection
    return await testBybitConnection(apiKey, apiSecret, isTestnet);

  } catch (error: any) {
    const { handleError } = await import('../helpers/error-sanitizer.ts');
    const sanitizedMessage = handleError({
      function: 'test-exchange',
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

async function testBybitConnection(apiKey: string, apiSecret: string, isTestnet: boolean): Promise<Response> {
  try {
    console.log(`[TEST-EXCHANGE] Testing Bybit ${isTestnet ? 'testnet' : 'mainnet'} connection`);
    
    const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const timestamp = Date.now();
    const recvWindow = '5000';
    
    // Generate signature
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
      encoder.encode(timestamp + apiKey + recvWindow)
    );
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Test account balance
    const accountUrl = `${baseUrl}/v5/account/wallet-balance?accountType=UNIFIED`;
    const response = await fetch(accountUrl, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'X-BAPI-SIGN': signatureHex,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Bybit API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }

    const totalWalletBalance = data.result.list
      ?.filter((account: any) => account.accountType === 'UNIFIED')
      ?.reduce((sum: number, account: any) => sum + parseFloat(account.totalWalletBalance || 0), 0) || 0;

    const responseData: TestExchangeResponse = {
      success: true,
      data: {
        environment: isTestnet ? 'testnet' : 'mainnet',
        totalWalletBalance,
        exchangeType: 'bybit'
      }
    };
    
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    const { handleError } = await import('../helpers/error-sanitizer.ts');
    const sanitizedMessage = handleError({
      function: 'test-exchange/testBybitConnection',
      error,
    });
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: sanitizedMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
