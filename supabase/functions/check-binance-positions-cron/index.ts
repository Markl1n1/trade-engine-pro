import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Position {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
}

async function getBinancePositions(apiKey: string, apiSecret: string, useTestnet: boolean): Promise<Position[]> {
  const baseUrl = useTestnet 
    ? 'https://testnet.binancefuture.com'
    : 'https://fapi.binance.com';
  
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
  
  const response = await fetch(
    `${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signatureHex}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey
      }
    }
  );
  
  if (!response.ok) {
    console.error(`[BINANCE] Failed to fetch positions: ${response.status}`);
    return [];
  }
  
  const positions = await response.json();
  return positions.filter((p: Position) => parseFloat(p.positionAmt) !== 0);
}

async function sendTelegramNotification(
  botToken: string, 
  chatId: string, 
  strategyName: string,
  symbol: string,
  entryPrice: number,
  exitPrice: number,
  reason: string
): Promise<void> {
  const pnlPercent = ((exitPrice - entryPrice) / entryPrice * 100).toFixed(2);
  
  const message = `🔴 *Position Closed*\n\n` +
    `📊 Strategy: ${strategyName}\n` +
    `💹 Pair: ${symbol}\n` +
    `⏰ Time: ${new Date().toISOString()}\n` +
    `📝 Reason: ${reason}\n` +
    `💰 Entry: ${entryPrice}\n` +
    `💰 Exit: ${exitPrice}\n` +
    `📈 P&L: ${pnlPercent}%`;
  
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    })
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[POSITION-SYNC] Starting position synchronization...');

    // Get all users with open positions in database
    const { data: openStates, error: statesError } = await supabase
      .from('strategy_live_states')
      .select(`
        id,
        strategy_id,
        user_id,
        position_open,
        entry_price,
        entry_time,
        strategies!inner(
          id,
          name,
          symbol,
          take_profit_percent,
          stop_loss_percent
        )
      `)
      .eq('position_open', true);

    if (statesError) {
      console.error('[POSITION-SYNC] Error fetching open states:', statesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch open states' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!openStates || openStates.length === 0) {
      console.log('[POSITION-SYNC] No open positions to check');
      return new Response(
        JSON.stringify({ message: 'No open positions to check' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[POSITION-SYNC] Checking ${openStates.length} open positions`);

    let closedCount = 0;
    let syncedCount = 0;

    // Group by user to minimize API calls
    const userGroups = openStates.reduce((acc, state) => {
      if (!acc[state.user_id]) {
        acc[state.user_id] = [];
      }
      acc[state.user_id].push(state);
      return acc;
    }, {} as Record<string, typeof openStates>);

    for (const [userId, states] of Object.entries(userGroups)) {
      // Get user settings
      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!userSettings) {
        console.log(`[POSITION-SYNC] Skipping user ${userId} - no settings found`);
        continue;
      }

      // Decrypt API credentials using secure vault
      const credentialType = userSettings.use_testnet ? 'binance_testnet' : 'binance_mainnet';
      const { data: credentials, error: credError } = await supabase
        .rpc('decrypt_credential', {
          p_user_id: userId,
          p_credential_type: credentialType,
          p_access_source: 'check-binance-positions-cron'
        });

      let apiKey: string | null = null;
      let apiSecret: string | null = null;

      if (credError || !credentials || credentials.length === 0) {
        // Fallback to plaintext during migration period
        console.log(`[POSITION-SYNC] No encrypted credentials for user ${userId}, using plaintext fallback`);
        apiKey = userSettings.use_testnet 
          ? userSettings.binance_testnet_api_key 
          : userSettings.binance_mainnet_api_key;
        apiSecret = userSettings.use_testnet 
          ? userSettings.binance_testnet_api_secret 
          : userSettings.binance_mainnet_api_secret;
      } else {
        // Use decrypted credentials
        apiKey = credentials[0].api_key;
        apiSecret = credentials[0].api_secret;
      }

      if (!apiKey || !apiSecret) {
        console.log(`[POSITION-SYNC] Skipping user ${userId} - no API keys configured`);
        continue;
      }

      // Get actual Binance positions
      const binancePositions = await getBinancePositions(
        apiKey,
        apiSecret,
        userSettings.use_testnet
      );

      console.log(`[POSITION-SYNC] User ${userId} has ${binancePositions.length} open positions on Binance`);

      // Check each database state against Binance reality
      for (const state of states) {
        const strategy = state.strategies as any;
        const binancePosition = binancePositions.find(p => p.symbol === strategy.symbol);

        if (!binancePosition) {
          // Position closed on Binance but still open in database
          console.log(`[POSITION-SYNC] Position closed on exchange for ${strategy.symbol}`);
          
          // Determine closure reason
          let reason = 'Unknown';
          const currentPrice = parseFloat(state.entry_price || '0');
          
          if (strategy.take_profit_percent && currentPrice > 0) {
            const tpPrice = currentPrice * (1 + strategy.take_profit_percent / 100);
            // Approximate check - in reality we'd need historical price data
            reason = 'TP Level Reached';
          } else if (strategy.stop_loss_percent && currentPrice > 0) {
            const slPrice = currentPrice * (1 - strategy.stop_loss_percent / 100);
            reason = 'SL Level Reached';
          }

          // Update database
          await supabase
            .from('strategy_live_states')
            .update({
              position_open: false,
              entry_price: null,
              entry_time: null
            })
            .eq('id', state.id);

          closedCount++;

          // Send Telegram notification
          if (userSettings.telegram_enabled && userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
            try {
              await sendTelegramNotification(
                userSettings.telegram_bot_token,
                userSettings.telegram_chat_id,
                strategy.name,
                strategy.symbol,
                parseFloat(state.entry_price || '0'),
                currentPrice,
                reason
              );
              console.log(`[POSITION-SYNC] Sent closure notification for ${strategy.symbol}`);
            } catch (telegramError) {
              console.error('[POSITION-SYNC] Failed to send Telegram notification:', telegramError);
            }
          }
        } else {
          syncedCount++;
          console.log(`[POSITION-SYNC] Position still open for ${strategy.symbol}`);
        }
      }
    }

    console.log(`[POSITION-SYNC] Complete: ${closedCount} closed, ${syncedCount} synced`);

    return new Response(
      JSON.stringify({
        success: true,
        closed: closedCount,
        synced: syncedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[POSITION-SYNC] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
