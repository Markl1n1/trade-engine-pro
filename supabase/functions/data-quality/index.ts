// Data Quality Function
// Comprehensive data validation, cleaning, and quality monitoring

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createDataQualityManager, defaultDataQualityConfig } from '../helpers/data-quality-manager.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DataQualityRequest {
  action: 'validate_data' | 'clean_data' | 'get_quality_report' | 'monitor_quality' | 'fix_issues';
  symbol?: string;
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  data?: any[];
  config?: any;
  autoFix?: boolean;
}

interface DataQualityResponse {
  success: boolean;
  data?: any;
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

    const request: DataQualityRequest = await req.json();
    console.log(`[DATA-QUALITY] Processing request: ${request.action}`);

    // Get user's data quality configuration
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('data_quality_config')
      .eq('user_id', user.id)
      .single();

    const config = userSettings?.data_quality_config ? 
      { ...defaultDataQualityConfig, ...userSettings.data_quality_config } : 
      defaultDataQualityConfig;

    const dataQualityManager = createDataQualityManager(config);

    let response: DataQualityResponse;

    switch (request.action) {
      case 'validate_data':
        response = await handleValidateData(dataQualityManager, request, supabase);
        break;
        
      case 'clean_data':
        response = await handleCleanData(dataQualityManager, request, supabase);
        break;
        
      case 'get_quality_report':
        response = await handleGetQualityReport(dataQualityManager, request, supabase);
        break;
        
      case 'monitor_quality':
        response = await handleMonitorQuality(dataQualityManager, request, supabase);
        break;
        
      case 'fix_issues':
        response = await handleFixIssues(dataQualityManager, request, supabase, user.id);
        break;
        
      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[DATA-QUALITY] Error:', error);
    
    const errorResponse: DataQualityResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
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

// Handle validate data request
async function handleValidateData(
  dataQualityManager: any, 
  request: DataQualityRequest,
  supabase: any
): Promise<DataQualityResponse> {
  try {
    let candles: any[] = [];
    
    if (request.data) {
      // Use provided data
      candles = request.data;
    } else if (request.symbol && request.timeframe) {
      // Fetch data from database
      const { data: marketData, error } = await supabase
        .from('market_data')
        .select('*')
        .eq('symbol', request.symbol)
        .eq('timeframe', request.timeframe)
        .gte('open_time', request.startDate ? new Date(request.startDate).getTime() : 0)
        .lte('open_time', request.endDate ? new Date(request.endDate).getTime() : Date.now())
        .order('open_time', { ascending: true });

      if (error) throw error;
      if (!marketData || marketData.length === 0) {
        throw new Error('No data found for validation');
      }

      candles = marketData.map((d: any) => ({
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume),
        open_time: d.open_time,
        close_time: d.close_time
      }));
    } else {
      throw new Error('Either data or symbol/timeframe must be provided');
    }

    const qualityReport = dataQualityManager.validateDataset(candles);

    return {
      success: true,
      data: {
        report: qualityReport,
        dataPoints: candles.length,
        validatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate data'
    };
  }
}

// Handle clean data request
async function handleCleanData(
  dataQualityManager: any, 
  request: DataQualityRequest,
  supabase: any
): Promise<DataQualityResponse> {
  try {
    let candles: any[] = [];
    
    if (request.data) {
      candles = request.data;
    } else if (request.symbol && request.timeframe) {
      const { data: marketData, error } = await supabase
        .from('market_data')
        .select('*')
        .eq('symbol', request.symbol)
        .eq('timeframe', request.timeframe)
        .gte('open_time', request.startDate ? new Date(request.startDate).getTime() : 0)
        .lte('open_time', request.endDate ? new Date(request.endDate).getTime() : Date.now())
        .order('open_time', { ascending: true });

      if (error) throw error;
      if (!marketData || marketData.length === 0) {
        throw new Error('No data found for cleaning');
      }

      candles = marketData.map((d: any) => ({
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume),
        open_time: d.open_time,
        close_time: d.close_time
      }));
    } else {
      throw new Error('Either data or symbol/timeframe must be provided');
    }

    const cleaningResult = dataQualityManager.cleanDataset(candles);

    return {
      success: true,
      data: {
        originalCount: candles.length,
        cleanedCount: cleaningResult.cleaned.length,
        removedCount: cleaningResult.removed.length,
        filledCount: cleaningResult.filled.length,
        cleanedData: cleaningResult.cleaned,
        removedData: cleaningResult.removed,
        filledData: cleaningResult.filled,
        cleanedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clean data'
    };
  }
}

// Handle get quality report request
async function handleGetQualityReport(
  dataQualityManager: any, 
  request: DataQualityRequest,
  supabase: any
): Promise<DataQualityResponse> {
  try {
    if (!request.symbol || !request.timeframe) {
      throw new Error('Symbol and timeframe are required for quality report');
    }

    // Get recent data for quality assessment
    const { data: marketData, error } = await supabase
      .from('market_data')
      .select('*')
      .eq('symbol', request.symbol)
      .eq('timeframe', request.timeframe)
      .gte('open_time', Date.now() - (24 * 60 * 60 * 1000)) // Last 24 hours
      .order('open_time', { ascending: true });

    if (error) throw error;
    if (!marketData || marketData.length === 0) {
      throw new Error('No recent data found for quality assessment');
    }

    const candles = marketData.map((d: any) => ({
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volume),
      open_time: d.open_time,
      close_time: d.close_time
    }));

    const qualityReport = dataQualityManager.validateDataset(candles);

    // Save quality report to database
    await supabase
      .from('data_quality_reports')
      .insert({
        symbol: request.symbol,
        timeframe: request.timeframe,
        quality_score: qualityReport.score,
        overall_quality: qualityReport.overall,
        issues_count: qualityReport.issues.length,
        metrics: qualityReport.metrics,
        created_at: new Date().toISOString()
      });

    return {
      success: true,
      data: {
        report: qualityReport,
        symbol: request.symbol,
        timeframe: request.timeframe,
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get quality report'
    };
  }
}

// Handle monitor quality request
async function handleMonitorQuality(
  dataQualityManager: any, 
  request: DataQualityRequest,
  supabase: any
): Promise<DataQualityResponse> {
  try {
    // Get all active symbols and timeframes
    const { data: activeData, error } = await supabase
      .from('market_data')
      .select('symbol, timeframe')
      .gte('open_time', Date.now() - (60 * 60 * 1000)) // Last hour
      .order('open_time', { ascending: false });

    if (error) throw error;

    const qualityAlerts: any[] = [];
    const monitoredPairs = new Set<string>();

    // Group by symbol and timeframe
    const dataGroups: { [key: string]: any[] } = {};
    for (const item of activeData || []) {
      const key = `${item.symbol}_${item.timeframe}`;
      if (!dataGroups[key]) {
        dataGroups[key] = [];
        monitoredPairs.add(key);
      }
      dataGroups[key].push(item);
    }

    // Check quality for each pair
    for (const [key, data] of Object.entries(dataGroups)) {
      const [symbol, timeframe] = key.split('_');
      
      const candles = data.map(d => ({
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume),
        open_time: d.open_time,
        close_time: d.close_time
      }));

      const qualityReport = dataQualityManager.validateDataset(candles);
      
      // Check for quality alerts
      if (qualityReport.score < 70) {
        qualityAlerts.push({
          symbol,
          timeframe,
          score: qualityReport.score,
          issues: qualityReport.issues.length,
          severity: qualityReport.overall === 'poor' ? 'critical' : 'warning'
        });
      }
    }

    return {
      success: true,
      data: {
        monitoredPairs: Array.from(monitoredPairs),
        qualityAlerts,
        totalPairs: Object.keys(dataGroups).length,
        alertCount: qualityAlerts.length,
        monitoredAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to monitor quality'
    };
  }
}

// Handle fix issues request
async function handleFixIssues(
  dataQualityManager: any, 
  request: DataQualityRequest,
  supabase: any,
  userId: string
): Promise<DataQualityResponse> {
  try {
    if (!request.symbol || !request.timeframe) {
      throw new Error('Symbol and timeframe are required for fixing issues');
    }

    // Get data to fix
    const { data: marketData, error } = await supabase
      .from('market_data')
      .select('*')
      .eq('symbol', request.symbol)
      .eq('timeframe', request.timeframe)
      .gte('open_time', request.startDate ? new Date(request.startDate).getTime() : 0)
      .lte('open_time', request.endDate ? new Date(request.endDate).getTime() : Date.now())
      .order('open_time', { ascending: true });

    if (error) throw error;
    if (!marketData || marketData.length === 0) {
      throw new Error('No data found to fix');
    }

    const candles = marketData.map((d: any) => ({
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volume),
      open_time: d.open_time,
      close_time: d.close_time
    }));

    // Clean the data
    const cleaningResult = dataQualityManager.cleanDataset(candles);

    if (request.autoFix && cleaningResult.cleaned.length > 0) {
      // Update database with cleaned data
      for (const cleanedCandle of cleaningResult.cleaned) {
        await supabase
          .from('market_data')
          .update({
            open: cleanedCandle.open.toString(),
            high: cleanedCandle.high.toString(),
            low: cleanedCandle.low.toString(),
            close: cleanedCandle.close.toString(),
            volume: cleanedCandle.volume.toString(),
            updated_at: new Date().toISOString()
          })
          .eq('symbol', request.symbol)
          .eq('timeframe', request.timeframe)
          .eq('open_time', cleanedCandle.open_time);
      }

      // Log the fix
      await supabase
        .from('data_quality_fixes')
        .insert({
          user_id: userId,
          symbol: request.symbol,
          timeframe: request.timeframe,
          original_count: candles.length,
          cleaned_count: cleaningResult.cleaned.length,
          removed_count: cleaningResult.removed.length,
          filled_count: cleaningResult.filled.length,
          fixed_at: new Date().toISOString()
        });
    }

    return {
      success: true,
      data: {
        originalCount: candles.length,
        cleanedCount: cleaningResult.cleaned.length,
        removedCount: cleaningResult.removed.length,
        filledCount: cleaningResult.filled.length,
        autoFixed: request.autoFix || false,
        fixedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fix issues'
    };
  }
}
