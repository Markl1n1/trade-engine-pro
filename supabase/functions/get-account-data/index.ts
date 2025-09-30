import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    // Get user settings to determine which API keys to use
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('binance_mainnet_api_key, binance_mainnet_api_secret, binance_testnet_api_key, binance_testnet_api_secret, use_testnet')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      throw new Error('Failed to fetch settings');
    }

    if (!settings) {
      throw new Error('No settings found');
    }

    // Select correct credentials based on testnet mode
    const apiKey = settings.use_testnet 
      ? settings.binance_testnet_api_key 
      : settings.binance_mainnet_api_key;
    
    const apiSecret = settings.use_testnet 
      ? settings.binance_testnet_api_secret 
      : settings.binance_mainnet_api_secret;

    if (!apiKey || !apiSecret) {
      throw new Error(`Binance API credentials not configured for ${settings.use_testnet ? 'testnet' : 'mainnet'}`);
    }

    const baseUrl = settings.use_testnet 
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';

    // Create signed request for account endpoint
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
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

    // Fetch account data
    const accountUrl = `${baseUrl}/fapi/v2/account?${queryString}&signature=${signatureHex}`;
    const accountResponse = await fetch(accountUrl, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    if (!accountResponse.ok) {
      const errorData = await accountResponse.text();
      console.error('Binance account API error:', errorData);
      throw new Error(`Binance API error: ${errorData}`);
    }

    const accountData = await accountResponse.json();

    // Fetch user's trade history for win rate calculation
    const tradesQueryString = `timestamp=${Date.now()}`;
    const tradesKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const tradesSignature = await crypto.subtle.sign(
      'HMAC',
      tradesKey,
      encoder.encode(tradesQueryString)
    );
    
    const tradesSignatureHex = Array.from(new Uint8Array(tradesSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const tradesUrl = `${baseUrl}/fapi/v1/userTrades?${tradesQueryString}&signature=${tradesSignatureHex}`;
    const tradesResponse = await fetch(tradesUrl, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    let winRate = 0;
    let totalTrades = 0;
    let winningTrades = 0;

    if (tradesResponse.ok) {
      const trades = await tradesResponse.json();
      totalTrades = trades.length;
      winningTrades = trades.filter((trade: any) => parseFloat(trade.realizedPnl) > 0).length;
      winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    }

    // Extract positions and balances
    const positions = accountData.positions
      ?.filter((pos: any) => parseFloat(pos.positionAmt) !== 0)
      .map((pos: any) => ({
        symbol: pos.symbol,
        positionAmt: parseFloat(pos.positionAmt),
        entryPrice: parseFloat(pos.entryPrice),
        unrealizedProfit: parseFloat(pos.unrealizedProfit),
        leverage: parseFloat(pos.leverage),
        side: parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT',
      })) || [];

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
        data: {
          totalWalletBalance: parseFloat(accountData.totalWalletBalance),
          totalUnrealizedProfit: parseFloat(accountData.totalUnrealizedProfit),
          totalMarginBalance: parseFloat(accountData.totalMarginBalance),
          availableBalance: parseFloat(accountData.availableBalance),
          positions: positions,
          balances: balances,
          openPositionsCount: positions.length,
          winRate: winRate,
          totalTrades: totalTrades,
          environment: settings.use_testnet ? 'testnet' : 'mainnet',
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error fetching account data:', error);
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";