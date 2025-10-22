import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Trailing Stop Manager for Live Trading
class LiveTrailingStopManager {
  private maxProfitPercent: number = 0;
  private trailingPercent: number;
  private isActive: boolean = false;
  private entryPrice: number = 0;
  private positionType: 'buy' | 'sell' = 'buy';
  private positionId: string = '';
  
  constructor(trailingPercent: number, entryPrice: number, positionType: 'buy' | 'sell', positionId: string, isActive: boolean = false, maxProfitPercent: number = 0) {
    this.trailingPercent = trailingPercent;
    this.entryPrice = entryPrice;
    this.positionType = positionType;
    this.positionId = positionId;
    this.isActive = isActive;
    this.maxProfitPercent = maxProfitPercent;
  }
  
  // Check if trailing stop should trigger
  checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string } {
    if (!this.isActive) {
      const currentProfitPercent = this.calculateProfitPercent(currentPrice);
      if (currentProfitPercent > 0) {
        this.isActive = true;
        this.maxProfitPercent = currentProfitPercent;
        console.log(`[LIVE-TRAILING] Activated at ${currentProfitPercent.toFixed(2)}% profit for position ${this.positionId}`);
        return { shouldClose: false, reason: 'TRAILING_ACTIVATED' };
      }
      return { shouldClose: false, reason: 'NO_PROFIT_YET' };
    }
    
    const currentProfitPercent = this.calculateProfitPercent(currentPrice);
    if (currentProfitPercent > this.maxProfitPercent) {
      this.maxProfitPercent = currentProfitPercent;
      console.log(`[LIVE-TRAILING] New max profit: ${currentProfitPercent.toFixed(2)}% for position ${this.positionId}`);
    }
    
    const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
    
    if (currentProfitPercent < trailingThreshold) {
      console.log(`[LIVE-TRAILING] Triggered: ${currentProfitPercent.toFixed(2)}% < ${trailingThreshold.toFixed(2)}% (max: ${this.maxProfitPercent.toFixed(2)}%) for position ${this.positionId}`);
      return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED' };
    }
    
    return { shouldClose: false, reason: 'TRAILING_ACTIVE' };
  }
  
  // Calculate profit percentage from entry price
  private calculateProfitPercent(currentPrice: number): number {
    if (this.positionType === 'buy') {
      return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
    } else {
      return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
    }
  }
  
  // Get current state for database update
  getState() {
    return {
      is_active: this.isActive,
      max_profit_percent: this.maxProfitPercent,
      updated_at: new Date().toISOString()
    };
  }
}

// Get current price from exchange
async function getCurrentPrice(symbol: string, exchangeType: string = 'bybit'): Promise<number> {
  try {
    if (exchangeType === 'bybit') {
      const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
      const data = await response.json();
      if (data.retCode === 0 && data.result.list.length > 0) {
        return parseFloat(data.result.list[0].lastPrice);
      }
    } else {
      // Binance fallback
      const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      return parseFloat(data.price);
    }
    throw new Error(`Failed to fetch price for ${symbol}`);
  } catch (error) {
    console.error(`[TRAILING-MONITOR] Failed to get current price for ${symbol}:`, error);
    throw error;
  }
}

// Close position on exchange
async function closePositionOnExchange(
  userId: string, 
  positionId: string, 
  symbol: string, 
  positionType: 'buy' | 'sell',
  exchangeType: string = 'bybit'
): Promise<boolean> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Get user credentials
    const credentialType = exchangeType === 'bybit' ? 'bybit_testnet' : 'binance_testnet';
    const { data: credentials } = await supabase
      .rpc('retrieve_credential', {
        p_user_id: userId,
        p_credential_type: credentialType
      });
    
    if (!credentials || credentials.length === 0) {
      console.error(`[TRAILING-MONITOR] No credentials found for user ${userId}`);
      return false;
    }
    
    // For now, we'll use the close-position function
    const closeResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/close-position`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        symbol: symbol,
        closeAll: false
      })
    });
    
    if (closeResponse.ok) {
      console.log(`[TRAILING-MONITOR] Successfully closed position ${positionId} for ${symbol}`);
      return true;
    } else {
      console.error(`[TRAILING-MONITOR] Failed to close position ${positionId}:`, await closeResponse.text());
      return false;
    }
  } catch (error) {
    console.error(`[TRAILING-MONITOR] Error closing position ${positionId}:`, error);
    return false;
  }
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

    console.log('[TRAILING-MONITOR] Starting trailing stop monitoring...');

    // Get all active trailing stop states
    const { data: trailingStates, error: statesError } = await supabase
      .from('trailing_stop_states')
      .select('*')
      .eq('is_active', true);

    if (statesError) {
      console.error('[TRAILING-MONITOR] Error fetching trailing stop states:', statesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch trailing stop states' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!trailingStates || trailingStates.length === 0) {
      console.log('[TRAILING-MONITOR] No active trailing stop states found');
      return new Response(
        JSON.stringify({ message: 'No active trailing stop states' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[TRAILING-MONITOR] Monitoring ${trailingStates.length} active trailing stop states`);

    let triggeredCount = 0;
    let updatedCount = 0;

    // Process each trailing stop state
    for (const state of trailingStates) {
      try {
        // Get current price for the symbol
        const currentPrice = await getCurrentPrice(state.symbol || 'BTCUSDT');
        
        // Create trailing stop manager from stored state
        const trailingStopManager = new LiveTrailingStopManager(
          state.trailing_percent,
          state.entry_price,
          state.position_type,
          state.position_id,
          state.is_active,
          state.max_profit_percent
        );
        
        // Check if trailing stop should trigger
        const result = trailingStopManager.checkTrailingStop(currentPrice);
        
        if (result.shouldClose) {
          console.log(`[TRAILING-MONITOR] Trailing stop triggered for position ${state.position_id}: ${result.reason}`);
          
          // Close position on exchange
          const closed = await closePositionOnExchange(
            state.user_id,
            state.position_id,
            state.symbol || 'BTCUSDT',
            state.position_type
          );
          
          if (closed) {
            // Remove trailing stop state
            await supabase
              .from('trailing_stop_states')
              .delete()
              .eq('id', state.id);
            
            triggeredCount++;
            console.log(`[TRAILING-MONITOR] Successfully closed position ${state.position_id} due to trailing stop`);
          }
        } else {
          // Update trailing stop state
          const newState = trailingStopManager.getState();
          await supabase
            .from('trailing_stop_states')
            .update(newState)
            .eq('id', state.id);
          
          updatedCount++;
        }
      } catch (error) {
        console.error(`[TRAILING-MONITOR] Error processing trailing stop state ${state.id}:`, error);
      }
    }

    console.log(`[TRAILING-MONITOR] Monitoring complete: ${triggeredCount} triggered, ${updatedCount} updated`);

    return new Response(
      JSON.stringify({
        success: true,
        triggered: triggeredCount,
        updated: updatedCount,
        total: trailingStates.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[TRAILING-MONITOR] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
