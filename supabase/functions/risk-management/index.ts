// Risk Management Function
// Advanced risk management with partial closing and adaptive stops

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRiskManager, defaultRiskConfig, AdvancedRiskManager } from '../helpers/advanced-risk-manager.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RiskManagementRequest {
  action: 'calculate_position_size' | 'check_risk_limits' | 'handle_partial_closing' | 'update_adaptive_stops' | 'get_risk_report' | 'close_position_partial';
  positionId?: string;
  symbol?: string;
  entryPrice?: number;
  stopLoss?: number;
  currentPrice?: number;
  accountBalance?: number;
  volatility?: number;
  winRate?: number;
  atr?: number;
  trend?: 'up' | 'down' | 'sideways';
  closePercent?: number;
  config?: any;
}

interface RiskManagementResponse {
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

    const request: RiskManagementRequest = await req.json();
    console.log(`[RISK-MANAGEMENT] Processing request: ${request.action}`);

    // Get or create risk manager for user
    let riskManager: AdvancedRiskManager;
    
    // Try to get existing risk manager from cache or create new one
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const accountBalance = userSettings?.account_balance || 10000;
    const riskConfig = userSettings?.risk_config ? 
      { ...defaultRiskConfig, ...userSettings.risk_config } : 
      defaultRiskConfig;

    riskManager = createRiskManager(riskConfig, accountBalance);

    // Load existing positions
    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open');

    if (positions) {
      positions.forEach(pos => {
        // Add positions to risk manager
        // This would be implemented based on your position structure
      });
    }

    let response: RiskManagementResponse;

    switch (request.action) {
      case 'calculate_position_size':
        response = await handleCalculatePositionSize(riskManager, request);
        break;
        
      case 'check_risk_limits':
        response = await handleCheckRiskLimits(riskManager, request);
        break;
        
      case 'handle_partial_closing':
        response = await handlePartialClosing(riskManager, request);
        break;
        
      case 'update_adaptive_stops':
        response = await handleUpdateAdaptiveStops(riskManager, request);
        break;
        
      case 'get_risk_report':
        response = await handleGetRiskReport(riskManager);
        break;
        
      case 'close_position_partial':
        response = await handleClosePositionPartial(riskManager, request, supabase, user.id);
        break;
        
      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[RISK-MANAGEMENT] Error:', error);
    
    const errorResponse: RiskManagementResponse = {
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

// Handle calculate position size request
async function handleCalculatePositionSize(
  riskManager: AdvancedRiskManager, 
  request: RiskManagementRequest
): Promise<RiskManagementResponse> {
  try {
    if (!request.symbol || !request.entryPrice || !request.stopLoss || !request.accountBalance) {
      throw new Error('Missing required parameters for position size calculation');
    }

    const positionSize = riskManager.calculatePositionSize(
      request.symbol,
      request.entryPrice,
      request.stopLoss,
      request.accountBalance,
      request.volatility,
      request.winRate
    );

    return {
      success: true,
      data: {
        positionSize,
        riskAmount: positionSize * Math.abs(request.entryPrice - request.stopLoss),
        riskPercent: (positionSize * Math.abs(request.entryPrice - request.stopLoss) / request.accountBalance) * 100
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate position size'
    };
  }
}

// Handle check risk limits request
async function handleCheckRiskLimits(
  riskManager: AdvancedRiskManager, 
  request: RiskManagementRequest
): Promise<RiskManagementResponse> {
  try {
    if (!request.symbol || !request.entryPrice || !request.stopLoss) {
      throw new Error('Missing required parameters for risk check');
    }

    const positionSize = request.accountBalance ? 
      riskManager.calculatePositionSize(
        request.symbol,
        request.entryPrice,
        request.stopLoss,
        request.accountBalance,
        request.volatility,
        request.winRate
      ) : 1000; // Default size

    const riskCheck = riskManager.canOpenPosition(
      request.symbol,
      positionSize,
      request.entryPrice,
      request.stopLoss
    );

    return {
      success: true,
      data: {
        allowed: riskCheck.allowed,
        reason: riskCheck.reason,
        portfolioRisk: riskManager.calculatePortfolioRisk(),
        positionSize
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check risk limits'
    };
  }
}

// Handle partial closing request
async function handlePartialClosing(
  riskManager: AdvancedRiskManager, 
  request: RiskManagementRequest
): Promise<RiskManagementResponse> {
  try {
    if (!request.positionId || !request.currentPrice) {
      throw new Error('Missing required parameters for partial closing');
    }

    const position = riskManager.getPosition(request.positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    const partialCloseActions = riskManager.handlePartialClosing(position, request.currentPrice);

    return {
      success: true,
      data: {
        actions: partialCloseActions,
        position: position
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to handle partial closing'
    };
  }
}

// Handle update adaptive stops request
async function handleUpdateAdaptiveStops(
  riskManager: AdvancedRiskManager, 
  request: RiskManagementRequest
): Promise<RiskManagementResponse> {
  try {
    if (!request.positionId || !request.currentPrice || !request.atr) {
      throw new Error('Missing required parameters for adaptive stops');
    }

    const position = riskManager.getPosition(request.positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    const adaptiveStop = riskManager.calculateAdaptiveStopLoss(
      position,
      request.currentPrice,
      request.atr,
      request.trend || 'sideways'
    );

    // Update position with new stop loss
    riskManager.updatePosition(request.positionId, { stopLoss: adaptiveStop });

    return {
      success: true,
      data: {
        newStopLoss: adaptiveStop,
        position: position
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update adaptive stops'
    };
  }
}

// Handle get risk report request
async function handleGetRiskReport(riskManager: AdvancedRiskManager): Promise<RiskManagementResponse> {
  try {
    const report = riskManager.getRiskReport();

    return {
      success: true,
      data: report
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get risk report'
    };
  }
}

// Handle close position partial request
async function handleClosePositionPartial(
  riskManager: AdvancedRiskManager,
  request: RiskManagementRequest,
  supabase: any,
  userId: string
): Promise<RiskManagementResponse> {
  try {
    if (!request.positionId || !request.closePercent) {
      throw new Error('Missing required parameters for partial close');
    }

    const position = riskManager.getPosition(request.positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    const closeSize = position.size * (request.closePercent / 100);
    const profit = riskManager.calculateProfit(position, request.currentPrice || position.currentPrice);
    const profitPercent = (profit / (position.size * position.entryPrice)) * 100;

    // Update position in database
    const { error: updateError } = await supabase
      .from('positions')
      .update({
        size: position.size - closeSize,
        partial_closes: position.partialCloses.concat([{
          level: profitPercent,
          closedSize: closeSize,
          profit: profit * (request.closePercent / 100)
        }]),
        updated_at: new Date().toISOString()
      })
      .eq('id', request.positionId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Failed to update position: ${updateError.message}`);
    }

    // Update risk manager
    riskManager.updatePosition(request.positionId, {
      size: position.size - closeSize,
      partialCloses: position.partialCloses.concat([{
        level: profitPercent,
        closedSize: closeSize,
        profit: profit * (request.closePercent / 100)
      }])
    });

    return {
      success: true,
      data: {
        closedSize,
        profit,
        profitPercent,
        remainingSize: position.size - closeSize
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close position partially'
    };
  }
}
