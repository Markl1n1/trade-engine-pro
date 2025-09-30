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

    // Get user settings to retrieve telegram credentials
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('telegram_bot_token, telegram_chat_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      throw new Error('Failed to fetch settings');
    }

    if (!settings || !settings.telegram_bot_token || !settings.telegram_chat_id) {
      throw new Error('Telegram credentials not configured');
    }

    // Send test message using Telegram Bot API
    const telegramUrl = `https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`;
    const message = '🤖 Test message from Binance Futures Trader\n\nYour Telegram bot is configured correctly!';

    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: settings.telegram_chat_id,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      console.error('Telegram API error:', telegramData);
      throw new Error(telegramData.description || 'Failed to send Telegram message');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test message sent successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error sending test message:', error);
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
