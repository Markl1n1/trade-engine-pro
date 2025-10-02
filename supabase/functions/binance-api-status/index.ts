import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExchangeMetrics {
  symbol: string;
  ufr?: number;
  ifer?: number;
  gcr?: number;
  dr?: number;
  tmv?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user's Binance API credentials
    const { data: settings } = await supabaseClient
      .from('user_settings')
      .select('binance_api_key, binance_api_secret, use_testnet, binance_testnet_api_key, binance_testnet_api_secret')
      .eq('user_id', user.id)
      .single();

    if (!settings) {
      return new Response(JSON.stringify({ error: 'API credentials not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = settings.use_testnet ? settings.binance_testnet_api_key : settings.binance_api_key;
    const apiSecret = settings.use_testnet ? settings.binance_testnet_api_secret : settings.binance_api_secret;

    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: 'Binance API credentials not set' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate timestamp and signature
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const messageData = encoder.encode(queryString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Fetch API trading status from Binance
    const baseUrl = settings.use_testnet 
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';
    
    const url = `${baseUrl}/fapi/v1/apiTradingStatus?${queryString}&signature=${signatureHex}`;
    
    const response = await fetch(url, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Binance API Status:', data);

    // Extract metrics from response
    const indicators = data.indicators || {};
    
    // Store metrics in database
    const metrics: ExchangeMetrics = {
      symbol: 'ACCOUNT', // Account-wide metrics
      ufr: indicators.UFR || null,
      ifer: indicators.IFER || null,
      gcr: indicators.GCR || null,
      dr: indicators.DR || null,
      tmv: indicators.TMV || null,
    };

    const { error: insertError } = await supabaseClient
      .from('exchange_metrics')
      .insert({
        user_id: user.id,
        ...metrics,
      });

    if (insertError) {
      console.error('Error storing metrics:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        metrics,
        rawData: data,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in binance-api-status:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
