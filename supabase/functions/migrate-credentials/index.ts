import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    console.log('[MIGRATE-CREDENTIALS] Starting credential migration...');

    // Get all users with API keys
    const { data: userSettings, error: fetchError } = await supabase
      .from('user_settings')
      .select('user_id, binance_mainnet_api_key, binance_mainnet_api_secret, binance_testnet_api_key, binance_testnet_api_secret, bybit_mainnet_api_key, bybit_mainnet_api_secret, bybit_testnet_api_key, bybit_testnet_api_secret')
      .or('binance_mainnet_api_key.not.is.null,binance_testnet_api_key.not.is.null,bybit_mainnet_api_key.not.is.null,bybit_testnet_api_key.not.is.null');

    if (fetchError) {
      throw new Error(`Failed to fetch user settings: ${fetchError.message}`);
    }

    if (!userSettings || userSettings.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No credentials to migrate' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[MIGRATE-CREDENTIALS] Found ${userSettings.length} users with credentials`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const settings of userSettings) {
      try {
        console.log(`[MIGRATE-CREDENTIALS] Migrating credentials for user ${settings.user_id.substring(0, 8)}...`);
        
        // Call the migration function
        const { data: result, error: migrateError } = await supabase
          .rpc('migrate_user_credentials_to_encrypted', {
            p_user_id: settings.user_id
          });

        if (migrateError) {
          console.error(`[MIGRATE-CREDENTIALS] Error for user ${settings.user_id}:`, migrateError);
          errorCount++;
          errors.push(`${settings.user_id}: ${migrateError.message}`);
        } else if (result) {
          console.log(`[MIGRATE-CREDENTIALS] ✓ Migrated credentials for user ${settings.user_id.substring(0, 8)}`);
          successCount++;
        } else {
          console.log(`[MIGRATE-CREDENTIALS] ⚠ No credentials to migrate for user ${settings.user_id.substring(0, 8)}`);
        }
      } catch (error: any) {
        console.error(`[MIGRATE-CREDENTIALS] Exception for user ${settings.user_id}:`, error);
        errorCount++;
        errors.push(`${settings.user_id}: ${error.message}`);
      }
    }

    console.log(`[MIGRATE-CREDENTIALS] Migration complete: ${successCount} successful, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Credential migration complete',
        total: userSettings.length,
        migrated: successCount,
        errors: errorCount,
        errorDetails: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[MIGRATE-CREDENTIALS] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});