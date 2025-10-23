import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`[TEST-TELEGRAM] Testing Telegram for user: ${user.id}`);

    // Get user's Telegram settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('telegram_bot_token, telegram_chat_id, telegram_enabled')
      .eq('user_id', user.id)
      .single();

    if (settingsError || !settings) {
      throw new Error('Could not retrieve Telegram settings');
    }

    if (!settings.telegram_enabled) {
      throw new Error('Telegram integration is not enabled. Please enable it in Settings.');
    }

    if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
      throw new Error('Telegram bot token or chat ID not configured. Please configure in Settings.');
    }

    // Send test message via Telegram Bot API
    const telegramUrl = `https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`;
    
    const testMessage = `✅ *Telegram Integration Test*\n\nYour Trade Engine PRO is successfully connected to Telegram!\n\nTimestamp: ${new Date().toISOString()}`;

    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: settings.telegram_chat_id,
        text: testMessage,
        parse_mode: 'Markdown',
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      console.error('[TEST-TELEGRAM] Telegram API error:', result);
      throw new Error(result.description || 'Failed to send Telegram message');
    }

    console.log('[TEST-TELEGRAM] Test message sent successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test message sent successfully! Check your Telegram.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[TEST-TELEGRAM] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send test message';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
