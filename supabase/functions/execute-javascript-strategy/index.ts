// Execute JavaScript Strategy Function
// Safe execution of custom JavaScript trading strategies

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { strategyExecutor } from '../helpers/javascript-strategy-executor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExecutionRequest {
  strategyId?: string;
  code?: string;
  candles: any[];
  indicators?: Record<string, any>;
  config?: Record<string, any>;
  position?: {
    open: boolean;
    entryPrice: number;
    entryTime: number;
    type: 'LONG' | 'SHORT';
  };
  testMode?: boolean;
}

interface ExecutionResponse {
  success: boolean;
  result?: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reason: string;
    metadata?: Record<string, any>;
  };
  error?: string;
  executionTime?: number;
  strategyInfo?: {
    name: string;
    type: string;
    version: string;
  };
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

    const request: ExecutionRequest = await req.json();
    console.log(`[EXECUTE-JS-STRATEGY] Starting execution for strategy: ${request.strategyId || 'custom'}`);

    let strategyCode: string;
    let strategyInfo: any = {};

    // Get strategy code
    if (request.strategyId) {
      // Fetch strategy from database
      const { data: strategy, error: strategyError } = await supabase
        .from('strategies')
        .select('*')
        .eq('id', request.strategyId)
        .eq('user_id', user.id)
        .single();

      if (strategyError) {
        throw new Error(`Failed to fetch strategy: ${strategyError.message}`);
      }

      if (!strategy.code) {
        throw new Error('Strategy has no JavaScript code');
      }

      strategyCode = strategy.code;
      strategyInfo = {
        name: strategy.name,
        type: strategy.strategy_type,
        version: strategy.version || '1.0.0'
      };
    } else if (request.code) {
      // Use provided code
      strategyCode = request.code;
    } else {
      throw new Error('Either strategyId or code must be provided');
    }

    // Prepare execution context
    const context = {
      candles: request.candles,
      indicators: request.indicators || {},
      config: request.config || {},
      position: request.position || {
        open: false,
        entryPrice: 0,
        entryTime: 0,
        type: 'LONG' as const
      }
    };

    console.log(`[EXECUTE-JS-STRATEGY] Executing strategy with ${context.candles.length} candles`);

    // Execute strategy
    const startTime = Date.now();
    const executionResult = await strategyExecutor.executeStrategy(strategyCode, context);
    const executionTime = Date.now() - startTime;

    if (executionResult.error) {
      console.error(`[EXECUTE-JS-STRATEGY] Execution error:`, executionResult.error);
      
      const errorResponse: ExecutionResponse = {
        success: false,
        error: executionResult.error.message,
        executionTime
      };

      return new Response(
        JSON.stringify(errorResponse),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[EXECUTE-JS-STRATEGY] Strategy executed successfully in ${executionTime}ms`);
    console.log(`[EXECUTE-JS-STRATEGY] Result:`, executionResult.result);

    // Log execution for monitoring
    if (!request.testMode) {
      await supabase
        .from('strategy_executions')
        .insert({
          strategy_id: request.strategyId,
          user_id: user.id,
          execution_time: executionTime,
          result: executionResult.result,
          success: true,
          created_at: new Date().toISOString()
        });
    }

    const response: ExecutionResponse = {
      success: true,
      result: executionResult.result,
      executionTime,
      strategyInfo
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[EXECUTE-JS-STRATEGY] Error:', error);
    
    const errorResponse: ExecutionResponse = {
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

