import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Helper function to retrieve encrypted API credentials
 * Note: This function returns encrypted data that should be decrypted client-side
 * for maximum security. The encryption key is derived from the user's ID
 * and never leaves the client.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get encrypted credentials
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('binance_api_key, binance_api_secret, use_testnet')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      throw settingsError;
    }

    if (!settings) {
      throw new Error('Settings not found');
    }

    // Return encrypted data - client will decrypt
    // In a real implementation with server-side decryption, you would decrypt here
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          binance_api_key: settings.binance_api_key,
          binance_api_secret: settings.binance_api_secret,
          use_testnet: settings.use_testnet,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error:', error);
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
