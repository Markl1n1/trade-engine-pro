import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StrategyRequest {
  formula: string;
  name?: string;
  description?: string;
  symbol?: string;
  timeframe?: string;
}

interface GeneratedStrategy {
  name: string;
  description: string;
  strategy_type: string;
  code: string;
  parameters: Record<string, any>;
  implementation_files: string[];
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

    const request: StrategyRequest = await req.json();
    const { formula, name, description, symbol = "BTCUSDT", timeframe = "1h" } = request;

    if (!formula.trim()) {
      throw new Error('Strategy formula is required');
    }

    // Generate strategy based on formula
    const generatedStrategy = await generateStrategyFromFormula(formula, name, description);

    // Save strategy to database
    const { data: strategy, error: strategyError } = await supabase
      .from("strategies")
      .insert([{
        user_id: user.id,
        name: generatedStrategy.name,
        description: generatedStrategy.description,
        symbol,
        timeframe,
        strategy_type: generatedStrategy.strategy_type,
        initial_capital: 10000,
        ...generatedStrategy.parameters,
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (strategyError) throw strategyError;

    // TODO: Implement strategy code files
    // This would involve:
    // 1. Creating the strategy helper file
    // 2. Updating the backtest engine
    // 3. Adding to the strategy execution system

    return new Response(
      JSON.stringify({
        success: true,
        strategy: {
          id: strategy.id,
          name: strategy.name,
          description: strategy.description,
          strategy_type: strategy.strategy_type,
          parameters: generatedStrategy.parameters,
          implementation_files: generatedStrategy.implementation_files
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GENERATE-STRATEGY] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function generateStrategyFromFormula(
  formula: string, 
  customName?: string, 
  customDescription?: string
): Promise<GeneratedStrategy> {
  const formulaLower = formula.toLowerCase();
  
  // Detect strategy type based on formula keywords
  let strategyType = "custom";
  let name = customName || "Custom Strategy";
  let description = customDescription || "AI-generated strategy based on provided formula";
  let parameters: Record<string, any> = {};
  let implementationFiles: string[] = [];
  
  if (formulaLower.includes("sma") && formulaLower.includes("crossover")) {
    strategyType = "sma_crossover";
    name = customName || "SMA Crossover Strategy";
    description = customDescription || "Moving average crossover strategy with trend following logic";
    parameters = {
      sma_fast_period: 20,
      sma_slow_period: 200,
      rsi_period: 14,
      rsi_overbought: 70,
      rsi_oversold: 30,
      volume_multiplier: 1.2
    };
    implementationFiles = ["sma-crossover-strategy.ts"];
  } else if (formulaLower.includes("rsi") && formulaLower.includes("oversold")) {
    strategyType = "rsi_reversal";
    name = customName || "RSI Reversal Strategy";
    description = customDescription || "RSI-based mean reversion strategy";
    parameters = {
      rsi_period: 14,
      rsi_oversold: 30,
      rsi_overbought: 70,
      volume_multiplier: 1.0
    };
    implementationFiles = ["rsi-reversal-strategy.ts"];
  } else if (formulaLower.includes("bollinger") && formulaLower.includes("band")) {
    strategyType = "bollinger_bands";
    name = customName || "Bollinger Bands Strategy";
    description = customDescription || "Bollinger Bands mean reversion strategy";
    parameters = {
      bb_period: 20,
      bb_std_dev: 2,
      rsi_period: 14,
      volume_multiplier: 1.0
    };
    implementationFiles = ["bollinger-bands-strategy.ts"];
  } else if (formulaLower.includes("macd") && formulaLower.includes("crossover")) {
    strategyType = "macd_crossover";
    name = customName || "MACD Crossover Strategy";
    description = customDescription || "MACD crossover strategy with signal line confirmation";
    parameters = {
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      rsi_period: 14,
      volume_multiplier: 1.0
    };
    implementationFiles = ["macd-crossover-strategy.ts"];
  }
  
  // Generate JavaScript code for the strategy
  const code = generateStrategyCode(strategyType, parameters, formula);
  
  return {
    name,
    description,
    strategy_type: strategyType,
    code,
    parameters,
    implementation_files: implementationFiles
  };
}

function generateStrategyCode(strategyType: string, parameters: Record<string, any>, formula: string): string {
  const baseCode = `
// AI-Generated Strategy: ${formula}
// Generated on: ${new Date().toISOString()}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface StrategyConfig {
  ${Object.keys(parameters).map(key => `${key}: ${typeof parameters[key] === 'number' ? 'number' : 'string'};`).join('\n  ')}
}

interface StrategySignal {
  signal_type: 'BUY' | 'SELL' | null;
  reason: string;
  stop_loss?: number;
  take_profit?: number;
}

// Calculate SMA
function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// Calculate RSI
function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(50);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }
    }
  }
  
  return [50, ...result];
}

// Main strategy evaluation function
export function evaluateStrategy(
  candles: Candle[],
  config: StrategyConfig,
  positionOpen: boolean
): StrategySignal {
  console.log('[AI-STRATEGY] 🔍 Starting evaluation...');
  
  if (candles.length < 50) {
    return { signal_type: null, reason: 'Insufficient candle data' };
  }
  
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  // TODO: Implement strategy logic based on formula
  // This is where the AI-generated logic would go
  
  return { signal_type: null, reason: 'Strategy logic not implemented yet' };
}

// Default configuration
export const defaultConfig: StrategyConfig = {
  ${Object.entries(parameters).map(([key, value]) => `${key}: ${value}`).join(',\n  ')}
};
`;

  return baseCode;
}
