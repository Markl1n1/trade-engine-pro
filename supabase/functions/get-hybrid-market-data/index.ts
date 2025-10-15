// Hybrid Market Data Function
// Provides market data using hybrid trading configuration

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HybridDataManager, createHybridDataManager, getOptimalHybridConfig } from '../helpers/hybrid-data-manager.ts';
import { HybridTradingConfig } from '../helpers/hybrid-trading-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketDataRequest {
  symbol: string;
  timeframe: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  useCache?: boolean;
}

interface MarketDataResponse {
  success: boolean;
  data?: any[];
  source: 'mainnet' | 'testnet' | 'cache' | 'database';
  quality: 'high' | 'medium' | 'low';
  warnings: string[];
  stats?: {
    totalRequests: number;
    cacheHits: number;
    averageQuality: number;
  };
  error?: string;
}

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

    const request: MarketDataRequest = await req.json();
    console.log(`[HYBRID-DATA] Request for ${request.symbol} ${request.timeframe}`);

    // Get user's trading configuration
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError) {
      throw new Error('Failed to fetch user settings');
    }

    // Create hybrid configuration
    const hybridConfig: HybridTradingConfig = {
      useMainnetData: settings.use_mainnet_data ?? true,
      useTestnetAPI: settings.use_testnet_api ?? true,
      paperTradingMode: settings.paper_trading_mode ?? true,
      realDataSimulation: settings.real_data_simulation ?? true,
      syncMainnetData: settings.sync_mainnet_data ?? true,
      cacheIndicators: settings.cache_indicators ?? true,
      maxPositionSize: settings.max_position_size ?? 1000,
      maxDailyTrades: settings.max_daily_trades ?? 10,
      riskWarningThreshold: settings.risk_warning_threshold ?? 5,
      validateDataIntegrity: settings.validate_data_integrity ?? true,
      handleMissingData: settings.handle_missing_data ?? 'interpolate',
      maxDataAge: settings.max_data_age_minutes ?? 5
    };

    // Create hybrid data manager
    const dataManager = createHybridDataManager(hybridConfig, settings.exchange_type || 'binance');

    // Get market data
    const result = await dataManager.getMarketData({
      symbol: request.symbol,
      timeframe: request.timeframe,
      startTime: request.startTime,
      endTime: request.endTime,
      limit: request.limit || 500
    });

    // Get trading mode info
    const modeInfo = dataManager.getTradingModeInfo();
    
    // Get statistics
    const stats = dataManager.getDataSourceStats();

    // Update user's hybrid stats
    await supabase.rpc('update_hybrid_stats', {
      p_user_id: user.id,
      p_stats: JSON.stringify({
        last_request: new Date().toISOString(),
        data_source: result.source,
        data_quality: result.quality,
        total_requests: stats.totalRequests + 1,
        cache_hits: stats.cacheHits,
        average_quality: stats.averageQuality
      })
    });

    const response: MarketDataResponse = {
      success: true,
      data: result.data,
      source: result.source,
      quality: result.quality,
      warnings: result.warnings,
      stats: {
        totalRequests: stats.totalRequests,
        cacheHits: stats.cacheHits,
        averageQuality: stats.averageQuality
      }
    };

    console.log(`[HYBRID-DATA] Success: ${result.data.length} candles from ${result.source} (quality: ${result.quality})`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[HYBRID-DATA] Error:', error);
    
    const errorResponse: MarketDataResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      source: 'error',
      quality: 'low',
      warnings: ['Failed to fetch market data']
    };

    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
