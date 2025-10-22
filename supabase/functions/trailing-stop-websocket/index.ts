import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// WebSocket connections for real-time price monitoring
const activeConnections = new Map<string, WebSocket>();
const trailingStopStates = new Map<string, any>();

// Trailing Stop Manager for Real-time Monitoring
class RealtimeTrailingStopManager {
  private maxProfitPercent: number = 0;
  private trailingPercent: number;
  private isActive: boolean = false;
  private entryPrice: number = 0;
  private positionType: 'buy' | 'sell' = 'buy';
  private positionId: string = '';
  private symbol: string = '';
  
  constructor(trailingPercent: number, entryPrice: number, positionType: 'buy' | 'sell', positionId: string, symbol: string, isActive: boolean = false, maxProfitPercent: number = 0) {
    this.trailingPercent = trailingPercent;
    this.entryPrice = entryPrice;
    this.positionType = positionType;
    this.positionId = positionId;
    this.symbol = symbol;
    this.isActive = isActive;
    this.maxProfitPercent = maxProfitPercent;
  }
  
  // Check if trailing stop should trigger
  checkTrailingStop(currentPrice: number): { shouldClose: boolean; reason: string; profitPercent: number } {
    const currentProfitPercent = this.calculateProfitPercent(currentPrice);
    
    if (!this.isActive) {
      if (currentProfitPercent > 0) {
        this.isActive = true;
        this.maxProfitPercent = currentProfitPercent;
        console.log(`[REALTIME-TRAILING] Activated at ${currentProfitPercent.toFixed(2)}% profit for ${this.symbol} (${this.positionId})`);
        return { shouldClose: false, reason: 'TRAILING_ACTIVATED', profitPercent: currentProfitPercent };
      }
      return { shouldClose: false, reason: 'NO_PROFIT_YET', profitPercent: currentProfitPercent };
    }
    
    if (currentProfitPercent > this.maxProfitPercent) {
      this.maxProfitPercent = currentProfitPercent;
      console.log(`[REALTIME-TRAILING] New max profit: ${currentProfitPercent.toFixed(2)}% for ${this.symbol} (${this.positionId})`);
    }
    
    const trailingThreshold = this.maxProfitPercent - this.trailingPercent;
    
    if (currentProfitPercent < trailingThreshold) {
      console.log(`[REALTIME-TRAILING] 🚨 TRIGGERED: ${currentProfitPercent.toFixed(2)}% < ${trailingThreshold.toFixed(2)}% (max: ${this.maxProfitPercent.toFixed(2)}%) for ${this.symbol} (${this.positionId})`);
      return { shouldClose: true, reason: 'TRAILING_STOP_TRIGGERED', profitPercent: currentProfitPercent };
    }
    
    return { shouldClose: false, reason: 'TRAILING_ACTIVE', profitPercent: currentProfitPercent };
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

// Close position on exchange
async function closePositionOnExchange(
  userId: string, 
  positionId: string, 
  symbol: string, 
  positionType: 'buy' | 'sell',
  exchangeType: string = 'bybit'
): Promise<boolean> {
  try {
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
      console.log(`[REALTIME-TRAILING] ✅ Successfully closed position ${positionId} for ${symbol}`);
      return true;
    } else {
      console.error(`[REALTIME-TRAILING] ❌ Failed to close position ${positionId}:`, await closeResponse.text());
      return false;
    }
  } catch (error) {
    console.error(`[REALTIME-TRAILING] ❌ Error closing position ${positionId}:`, error);
    return false;
  }
}

// Process price update for trailing stop
async function processPriceUpdate(symbol: string, price: number) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  // Get all active trailing stop states for this symbol
  const { data: states, error } = await supabase
    .from('trailing_stop_states')
    .select('*')
    .eq('symbol', symbol)
    .eq('is_active', true);
  
  if (error || !states || states.length === 0) {
    return;
  }
  
  console.log(`[REALTIME-TRAILING] Processing ${states.length} trailing stops for ${symbol} at ${price}`);
  
  for (const state of states) {
    try {
      // Create trailing stop manager from stored state
      const trailingStopManager = new RealtimeTrailingStopManager(
        state.trailing_percent,
        state.entry_price,
        state.position_type,
        state.position_id,
        state.symbol,
        state.is_active,
        state.max_profit_percent
      );
      
      // Check if trailing stop should trigger
      const result = trailingStopManager.checkTrailingStop(price);
      
      if (result.shouldClose) {
        console.log(`[REALTIME-TRAILING] 🚨 TRAILING STOP TRIGGERED for ${symbol}: ${result.reason} (${result.profitPercent.toFixed(2)}%)`);
        
        // Close position on exchange
        const closed = await closePositionOnExchange(
          state.user_id,
          state.position_id,
          state.symbol,
          state.position_type
        );
        
        if (closed) {
          // Remove trailing stop state
          await supabase
            .from('trailing_stop_states')
            .delete()
            .eq('id', state.id);
          
          console.log(`[REALTIME-TRAILING] ✅ Position ${state.position_id} closed due to trailing stop`);
        }
      } else {
        // Update trailing stop state
        const newState = trailingStopManager.getState();
        await supabase
          .from('trailing_stop_states')
          .update(newState)
          .eq('id', state.id);
        
        console.log(`[REALTIME-TRAILING] 📊 Updated trailing stop for ${symbol}: ${result.reason} (${result.profitPercent.toFixed(2)}%)`);
      }
    } catch (error) {
      console.error(`[REALTIME-TRAILING] ❌ Error processing trailing stop for ${state.id}:`, error);
    }
  }
}

// WebSocket connection to Bybit for real-time prices
function connectToBybitWebSocket() {
  const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
  
  ws.onopen = () => {
    console.log('[REALTIME-TRAILING] 🔗 Connected to Bybit WebSocket');
    
    // Subscribe to ticker updates for all active symbols
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Get all active symbols
    supabase
      .from('trailing_stop_states')
      .select('symbol')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const symbols = [...new Set(data.map(s => s.symbol))];
          console.log(`[REALTIME-TRAILING] 📡 Subscribing to ${symbols.length} symbols: ${symbols.join(', ')}`);
          
          // Subscribe to ticker updates
          const subscribeMessage = {
            op: 'subscribe',
            args: symbols.map(symbol => `tickers.${symbol}`)
          };
          
          ws.send(JSON.stringify(subscribeMessage));
        }
      });
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.topic && data.topic.startsWith('tickers.')) {
        const symbol = data.topic.replace('tickers.', '');
        const price = parseFloat(data.data.lastPrice);
        
        if (price > 0) {
          processPriceUpdate(symbol, price);
        }
      }
    } catch (error) {
      console.error('[REALTIME-TRAILING] ❌ Error processing WebSocket message:', error);
    }
  };
  
  ws.onclose = () => {
    console.log('[REALTIME-TRAILING] 🔌 Bybit WebSocket disconnected, reconnecting in 5 seconds...');
    setTimeout(connectToBybitWebSocket, 5000);
  };
  
  ws.onerror = (error) => {
    console.error('[REALTIME-TRAILING] ❌ WebSocket error:', error);
  };
  
  return ws;
}

// Start WebSocket connection
let bybitWebSocket: WebSocket | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle WebSocket upgrade
  if (req.headers.get('Upgrade') === 'websocket') {
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    socket.onopen = () => {
      console.log('[REALTIME-TRAILING] 🔗 Client connected to trailing stop WebSocket');
      
      // Start Bybit WebSocket connection if not already started
      if (!bybitWebSocket) {
        bybitWebSocket = connectToBybitWebSocket();
      }
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'subscribe') {
          // Client wants to subscribe to specific symbols
          console.log(`[REALTIME-TRAILING] 📡 Client subscribed to: ${data.symbols?.join(', ')}`);
        }
      } catch (error) {
        console.error('[REALTIME-TRAILING] ❌ Error processing client message:', error);
      }
    };
    
    socket.onclose = () => {
      console.log('[REALTIME-TRAILING] 🔌 Client disconnected from trailing stop WebSocket');
    };
    
    socket.onerror = (error) => {
      console.error('[REALTIME-TRAILING] ❌ Client WebSocket error:', error);
    };
    
    return response;
  }

  // Handle HTTP requests
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'start_monitoring':
        // Start WebSocket monitoring
        if (!bybitWebSocket) {
          bybitWebSocket = connectToBybitWebSocket();
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Real-time trailing stop monitoring started',
            status: 'active'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      case 'stop_monitoring':
        // Stop WebSocket monitoring
        if (bybitWebSocket) {
          bybitWebSocket.close();
          bybitWebSocket = null;
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Real-time trailing stop monitoring stopped',
            status: 'inactive'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      case 'get_status':
        // Get monitoring status
        return new Response(
          JSON.stringify({ 
            success: true, 
            status: bybitWebSocket ? 'active' : 'inactive',
            connections: activeConnections.size
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error: any) {
    console.error('[REALTIME-TRAILING] ❌ Error:', error);
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
