// Performance Dashboard
// Real-time performance monitoring and optimization

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { performanceOptimizer } from '../helpers/performance-optimizer.ts';
import { performanceMonitor } from '../helpers/performance-monitor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PerformanceRequest {
  action: 'get_metrics' | 'get_alerts' | 'optimize' | 'get_report' | 'start_monitoring' | 'stop_monitoring';
  thresholds?: {
    maxExecutionTime?: number;
    maxMemoryUsage?: number;
    maxCacheMissRate?: number;
    maxErrorRate?: number;
  };
}

interface PerformanceResponse {
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

    const request: PerformanceRequest = await req.json();
    console.log(`[PERFORMANCE-DASHBOARD] Processing request: ${request.action}`);

    let response: PerformanceResponse;

    switch (request.action) {
      case 'get_metrics':
        response = await handleGetMetrics();
        break;
        
      case 'get_alerts':
        response = await handleGetAlerts();
        break;
        
      case 'optimize':
        response = await handleOptimize();
        break;
        
      case 'get_report':
        response = await handleGetReport();
        break;
        
      case 'start_monitoring':
        response = await handleStartMonitoring();
        break;
        
      case 'stop_monitoring':
        response = await handleStopMonitoring();
        break;
        
      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[PERFORMANCE-DASHBOARD] Error:', error);
    
    const errorResponse: PerformanceResponse = {
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

// Handle get metrics request
async function handleGetMetrics(): Promise<PerformanceResponse> {
  try {
    const optimizerMetrics = performanceOptimizer.getMetrics();
    const monitorMetrics = performanceMonitor.getMetrics();
    const cacheStats = performanceOptimizer.getCacheStats();
    
    return {
      success: true,
      data: {
        optimizer: optimizerMetrics,
        monitor: monitorMetrics,
        cache: cacheStats,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get metrics'
    };
  }
}

// Handle get alerts request
async function handleGetAlerts(): Promise<PerformanceResponse> {
  try {
    const alerts = performanceMonitor.getAlerts(20);
    const alertsBySeverity = {
      critical: performanceMonitor.getAlertsBySeverity('critical'),
      high: performanceMonitor.getAlertsBySeverity('high'),
      medium: performanceMonitor.getAlertsBySeverity('medium'),
      low: performanceMonitor.getAlertsBySeverity('low')
    };
    
    return {
      success: true,
      data: {
        alerts,
        alertsBySeverity,
        totalAlerts: alerts.length,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get alerts'
    };
  }
}

// Handle optimize request
async function handleOptimize(): Promise<PerformanceResponse> {
  try {
    const optimizationResult = performanceMonitor.optimizeSystem();
    
    // Clear cache if needed
    const cacheStats = performanceOptimizer.getCacheStats();
    if (cacheStats.hitRate < 0.7) {
      performanceOptimizer.clearCache();
      optimizationResult.actions.push('Cleared cache to improve hit rate');
    }
    
    return {
      success: true,
      data: {
        optimization: optimizationResult,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to optimize system'
    };
  }
}

// Handle get report request
async function handleGetReport(): Promise<PerformanceResponse> {
  try {
    const report = performanceMonitor.getPerformanceReport();
    const optimizerMetrics = performanceOptimizer.getMetrics();
    const cacheStats = performanceOptimizer.getCacheStats();
    
    return {
      success: true,
      data: {
        report,
        optimizer: optimizerMetrics,
        cache: cacheStats,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get report'
    };
  }
}

// Handle start monitoring request
async function handleStartMonitoring(): Promise<PerformanceResponse> {
  try {
    performanceMonitor.startMonitoring(10000); // 10 second interval
    
    return {
      success: true,
      data: {
        message: 'Performance monitoring started',
        interval: 10000,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start monitoring'
    };
  }
}

// Handle stop monitoring request
async function handleStopMonitoring(): Promise<PerformanceResponse> {
  try {
    performanceMonitor.stopMonitoring();
    
    return {
      success: true,
      data: {
        message: 'Performance monitoring stopped',
        timestamp: Date.now()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop monitoring'
    };
  }
}
