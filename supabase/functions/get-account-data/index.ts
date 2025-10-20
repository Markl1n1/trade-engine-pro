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

    // Get user settings to determine which API keys to use
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('binance_mainnet_api_key, binance_mainnet_api_secret, binance_testnet_api_key, binance_testnet_api_secret, bybit_mainnet_api_key, bybit_mainnet_api_secret, bybit_testnet_api_key, bybit_testnet_api_secret, exchange_type, use_testnet, trading_mode, use_mainnet_data, use_testnet_api, paper_trading_mode')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      throw new Error('Failed to fetch settings');
    }

    if (!settings) {
      throw new Error('No settings found');
    }

    // Determine exchange type
    const exchangeType = settings.exchange_type || 'binance';
    const useTestnet = settings.use_testnet || false;

    // Select correct credentials based on exchange and testnet mode
    let apiKey, apiSecret, baseUrl;
    
    if (exchangeType === 'bybit') {
      apiKey = useTestnet ? settings.bybit_testnet_api_key : settings.bybit_mainnet_api_key;
      apiSecret = useTestnet ? settings.bybit_testnet_api_secret : settings.bybit_mainnet_api_secret;
      baseUrl = useTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    } else {
      apiKey = useTestnet ? settings.binance_testnet_api_key : settings.binance_mainnet_api_key;
      apiSecret = useTestnet ? settings.binance_testnet_api_secret : settings.binance_mainnet_api_secret;
      baseUrl = useTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    }

    if (!apiKey || !apiSecret) {
      throw new Error(`${exchangeType.toUpperCase()} API credentials not configured for ${useTestnet ? 'testnet' : 'mainnet'}`);
    }

    let accountData;
    
    // Initialize encoder for HMAC signatures (used by both Binance and Bybit)
    const encoder = new TextEncoder();
    
    if (exchangeType === 'bybit') {
      // Bybit API request
      const timestamp = Date.now();
      const recvWindow = '5000';
      
      // Create Bybit signature
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

      // Fetch account data from Bybit
      const accountUrl = `${baseUrl}/v5/account/wallet-balance?accountType=UNIFIED`;
      const accountResponse = await fetch(accountUrl, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'X-BAPI-SIGN': signatureHex,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'Content-Type': 'application/json'
        }
      });

      if (!accountResponse.ok) {
        const errorData = await accountResponse.text();
        console.error('Bybit account API error:', errorData);
        throw new Error(`Bybit API error: ${errorData}`);
      }

      const bybitResponse = await accountResponse.json();
      if (bybitResponse.retCode !== 0) {
        throw new Error(`Bybit API error: ${bybitResponse.retMsg}`);
      }
      
      accountData = bybitResponse.result;
    } else {
      // Binance API request
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

      accountData = await accountResponse.json();
    }

    // Fetch user's trade history for win rate calculation
    let winRate = 0;
    let totalTrades = 0;
    let winningTrades = 0;

    if (exchangeType === 'bybit') {
      // Bybit trades request
      const tradesTimestamp = Date.now();
      const tradesRecvWindow = '5000';
      
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
        encoder.encode(tradesTimestamp + apiKey + tradesRecvWindow)
      );
      
      const tradesSignatureHex = Array.from(new Uint8Array(tradesSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const tradesUrl = `${baseUrl}/v5/execution/list?accountType=UNIFIED`;
      const tradesResponse = await fetch(tradesUrl, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': tradesTimestamp.toString(),
          'X-BAPI-SIGN': tradesSignatureHex,
          'X-BAPI-RECV-WINDOW': tradesRecvWindow,
          'Content-Type': 'application/json'
        }
      });

      if (tradesResponse.ok) {
        const tradesData = await tradesResponse.json();
        if (tradesData.retCode === 0) {
          const trades = tradesData.result.list || [];
          totalTrades = trades.length;
          winningTrades = trades.filter((trade: any) => parseFloat(trade.execFee || 0) > 0).length;
          winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        }
      }
    } else {
      // Binance trades request
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

      if (tradesResponse.ok) {
        const trades = await tradesResponse.json();
        totalTrades = trades.length;
        winningTrades = trades.filter((trade: any) => parseFloat(trade.realizedPnl) > 0).length;
        winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      }
    }

    // Extract positions and balances based on exchange
    let positions = [];
    let balances = [];
    let totalWalletBalance = 0;
    let totalUnrealizedProfit = 0;
    let totalMarginBalance = 0;
    let availableBalance = 0;

    if (exchangeType === 'bybit') {
      // Bybit data structure
      const bybitBalances = accountData.list || [];
      balances = bybitBalances
        .filter((account: any) => account.accountType === 'UNIFIED')
        .flatMap((account: any) => 
          account.coin?.filter((coin: any) => parseFloat(coin.walletBalance) > 0)
            .map((coin: any) => ({
              asset: coin.coin,
              balance: parseFloat(coin.walletBalance),
              unrealizedProfit: parseFloat(coin.unrealizedPnl || 0),
            })) || []
        );

      // Calculate totals for Bybit
      totalWalletBalance = bybitBalances
        .filter((account: any) => account.accountType === 'UNIFIED')
        .reduce((sum: number, account: any) => sum + parseFloat(account.totalWalletBalance || 0), 0);
      
      totalUnrealizedProfit = bybitBalances
        .filter((account: any) => account.accountType === 'UNIFIED')
        .reduce((sum: number, account: any) => sum + parseFloat(account.totalUnrealizedPnl || 0), 0);

      // For Bybit, we need to fetch positions separately
      const positionsTimestamp = Date.now();
      const positionsRecvWindow = '5000';
      
      const positionsKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(apiSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const positionsSignature = await crypto.subtle.sign(
        'HMAC',
        positionsKey,
        encoder.encode(positionsTimestamp + apiKey + positionsRecvWindow)
      );
      
      const positionsSignatureHex = Array.from(new Uint8Array(positionsSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const positionsUrl = `${baseUrl}/v5/position/list?accountType=UNIFIED`;
      const positionsResponse = await fetch(positionsUrl, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': positionsTimestamp.toString(),
          'X-BAPI-SIGN': positionsSignatureHex,
          'X-BAPI-RECV-WINDOW': positionsRecvWindow,
          'Content-Type': 'application/json'
        }
      });

      if (positionsResponse.ok) {
        const positionsData = await positionsResponse.json();
        if (positionsData.retCode === 0) {
          positions = (positionsData.result.list || [])
            .filter((pos: any) => parseFloat(pos.size) !== 0)
            .map((pos: any) => ({
              symbol: pos.symbol,
              positionAmt: parseFloat(pos.size),
              entryPrice: parseFloat(pos.avgPrice),
              unrealizedProfit: parseFloat(pos.unrealisedPnl),
              leverage: parseFloat(pos.leverage),
              side: pos.side,
            }));
        }
      }
    } else {
      // Binance data structure
      positions = accountData.positions
        ?.filter((pos: any) => parseFloat(pos.positionAmt) !== 0)
        .map((pos: any) => ({
          symbol: pos.symbol,
          positionAmt: parseFloat(pos.positionAmt),
          entryPrice: parseFloat(pos.entryPrice),
          unrealizedProfit: parseFloat(pos.unrealizedProfit),
          leverage: parseFloat(pos.leverage),
          side: parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT',
        })) || [];

      balances = accountData.assets
        ?.filter((asset: any) => parseFloat(asset.walletBalance) > 0)
        .map((asset: any) => ({
          asset: asset.asset,
          balance: parseFloat(asset.walletBalance),
          unrealizedProfit: parseFloat(asset.unrealizedProfit),
        })) || [];

      totalWalletBalance = parseFloat(accountData.totalWalletBalance);
      totalUnrealizedProfit = parseFloat(accountData.totalUnrealizedProfit);
      totalMarginBalance = parseFloat(accountData.totalMarginBalance);
      availableBalance = parseFloat(accountData.availableBalance);
    }

    // Determine trading mode info
    const tradingMode = settings.trading_mode || 'mainnet_only';
    const dataSource = settings.use_mainnet_data ? 'mainnet' : 'testnet';
    const executionMode = settings.paper_trading_mode ? 'paper' : (settings.use_testnet ? 'simulated' : 'real');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          totalWalletBalance: totalWalletBalance,
          totalUnrealizedProfit: totalUnrealizedProfit,
          totalMarginBalance: totalMarginBalance,
          availableBalance: availableBalance,
          positions: positions,
          balances: balances,
          openPositionsCount: positions.length,
          winRate: winRate,
          totalTrades: totalTrades,
          environment: useTestnet ? 'testnet' : 'mainnet',
          tradingMode: tradingMode,
          dataSource: dataSource,
          executionMode: executionMode,
          exchangeType: exchangeType,
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