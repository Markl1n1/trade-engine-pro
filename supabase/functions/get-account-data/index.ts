import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { sanitizeError, handleError } from '../helpers/error-sanitizer.ts';

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

  let user;
  try {
    // Create service role client for credentials operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    
    // Create user client for user_settings with proper auth context
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    const { data: { user: authUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
    user = authUser;

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Validate user ID
    if (!validateUserId(user.id)) {
      throw new Error('Invalid user ID format');
    }

    // Get user settings using secure RPC function
    const { data: settingsData, error: settingsError } = await supabaseUser
      .rpc('get_user_settings', { p_user_id: user.id });

    if (settingsError) {
      throw new Error(`Failed to fetch settings: ${settingsError.message}`);
    }

    const settings = settingsData && settingsData.length > 0 ? settingsData[0] : null;

    if (!settings) {
      throw new Error('No settings found');
    }

    // Determine exchange type
    const exchangeType = settings.exchange_type || 'binance';
    const tradingMode = settings.trading_mode || 'hybrid_safe';
    const useTestnet = settings.use_testnet || false;
    
    console.log(`[GET-ACCOUNT-DATA] User settings:`, {
      exchangeType,
      tradingMode,
      useTestnet,
      userId: user.id
    });

    // For Hybrid Live mode, always use testnet API for safety
    const shouldUseTestnetAPI = tradingMode === 'hybrid_live' ? true : useTestnet;

    // Determine credential type based on exchange and environment
    const credentialType = exchangeType === 'bybit' 
      ? (shouldUseTestnetAPI ? 'bybit_testnet' : 'bybit_mainnet')
      : (shouldUseTestnetAPI ? 'binance_testnet' : 'binance_mainnet');

    // Retrieve API credentials from secure vault using admin client
    const { data: credentials, error: credError } = await supabaseAdmin
      .rpc('retrieve_credential', {
        p_user_id: user.id,
        p_credential_type: credentialType
      });

    let apiKey: string | null = null;
    let apiSecret: string | null = null;
    let baseUrl: string;

    if (credError || !credentials || credentials.length === 0) {
      const sanitizedError = sanitizeError(credError);
      throw new Error(`API credentials not found or could not be decrypted. Please configure your API keys in Settings. ${sanitizedError}`);
    }

    // Use decrypted credentials
    apiKey = credentials[0].api_key;
    apiSecret = credentials[0].api_secret;
    
    if (exchangeType === 'bybit') {
      baseUrl = shouldUseTestnetAPI ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    } else {
      baseUrl = shouldUseTestnetAPI ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    }

    if (!apiKey || !apiSecret) {
      throw new Error(`${exchangeType.toUpperCase()} API credentials not configured for ${shouldUseTestnetAPI ? 'testnet' : 'mainnet'}`);
    }

    let accountData;
    
    // Initialize encoder for HMAC signatures (used by both Binance and Bybit)
    const encoder = new TextEncoder();
    
    if (exchangeType === 'bybit') {
      // Bybit API request
      const timestamp = Date.now();
      const recvWindow = '5000';
      const queryString = 'accountType=UNIFIED';
      
      // Create Bybit signature: timestamp + apiKey + recvWindow + queryString
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
        encoder.encode(timestamp + apiKey + recvWindow + queryString)
      );
      
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Fetch account data from Bybit
      const accountUrl = `${baseUrl}/v5/account/wallet-balance?${queryString}`;
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
      const tradesQueryString = 'accountType=UNIFIED';
      
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
        encoder.encode(tradesTimestamp + apiKey + tradesRecvWindow + tradesQueryString)
      );
      
      const tradesSignatureHex = Array.from(new Uint8Array(tradesSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const tradesUrl = `${baseUrl}/v5/execution/list?${tradesQueryString}`;
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
      const positionsQueryString = 'accountType=UNIFIED';
      
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
        encoder.encode(positionsTimestamp + apiKey + positionsRecvWindow + positionsQueryString)
      );
      
      const positionsSignatureHex = Array.from(new Uint8Array(positionsSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const positionsUrl = `${baseUrl}/v5/position/list?${positionsQueryString}`;
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
        console.log(`[GET-ACCOUNT-DATA] Bybit positions response:`, JSON.stringify(positionsData, null, 2));
        
        if (positionsData.retCode === 0) {
          const allPositions = positionsData.result.list || [];
          console.log(`[GET-ACCOUNT-DATA] Total positions from Bybit: ${allPositions.length}`);
          
          positions = allPositions
            .filter((pos: any) => {
              const size = parseFloat(pos.size);
              const hasPosition = size !== 0;
              console.log(`[GET-ACCOUNT-DATA] Position ${pos.symbol}: size=${size}, hasPosition=${hasPosition}`);
              return hasPosition;
            })
            .map((pos: any) => ({
              symbol: pos.symbol,
              positionAmt: parseFloat(pos.size),
              entryPrice: parseFloat(pos.avgPrice),
              unrealizedProfit: parseFloat(pos.unrealisedPnl),
              leverage: parseFloat(pos.leverage),
              side: pos.side,
            }));
          
          console.log(`[GET-ACCOUNT-DATA] Filtered positions: ${positions.length}`);
        } else {
          console.error(`[GET-ACCOUNT-DATA] Bybit positions API error: ${positionsData.retMsg}`);
        }
      } else {
        console.error(`[GET-ACCOUNT-DATA] Bybit positions HTTP error: ${positionsResponse.status} ${positionsResponse.statusText}`);
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

    // Determine trading mode info (use existing tradingMode variable)
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
    const { handleError } = await import('../helpers/error-sanitizer.ts');
    const sanitizedMessage = handleError({
      function: 'get-account-data',
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