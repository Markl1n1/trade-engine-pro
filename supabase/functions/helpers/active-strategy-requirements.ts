import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface StrategyRequirements {
  symbols: string[];
  timeframes: string[];
  indicators: string[];
  activeStrategies: any[];
}

/**
 * Get requirements for all active strategies to optimize resource usage
 * Only fetches data for symbols/indicators currently in use by active strategies
 */
export async function getActiveStrategyRequirements(
  supabaseClient: SupabaseClient
): Promise<StrategyRequirements> {
  console.log('Fetching active strategy requirements...');

  // Query all active strategies
  const { data: activeStrategies, error: strategiesError } = await supabaseClient
    .from('strategies')
    .select('id, symbol, timeframe, strategy_type, user_id')
    .eq('status', 'active');

  if (strategiesError) {
    console.error('Error fetching active strategies:', strategiesError);
    return { symbols: [], timeframes: [], indicators: [], activeStrategies: [] };
  }

  if (!activeStrategies || activeStrategies.length === 0) {
    console.log('No active strategies found');
    return { symbols: [], timeframes: [], indicators: [], activeStrategies: [] };
  }

  console.log(`Found ${activeStrategies.length} active strategies`);

  // Get all conditions for active strategies
  const strategyIds = activeStrategies.map(s => s.id);
  const { data: conditions, error: conditionsError } = await supabaseClient
    .from('strategy_conditions')
    .select('indicator_type, indicator_type_2')
    .in('strategy_id', strategyIds);

  if (conditionsError) {
    console.error('Error fetching conditions:', conditionsError);
  }

  // Extract unique symbols, timeframes, and indicators (filter out null/undefined)
  const uniqueSymbols = [...new Set(activeStrategies
    .map(s => s.symbol)
    .filter(symbol => symbol && typeof symbol === 'string' && symbol.trim() !== '')
  )];
  const uniqueTimeframes = [...new Set(activeStrategies
    .map(s => s.timeframe)
    .filter(timeframe => timeframe && typeof timeframe === 'string' && timeframe.trim() !== '')
  )];
  const uniqueIndicators = new Set<string>();

  if (conditions) {
    conditions.forEach(c => {
      if (c.indicator_type) uniqueIndicators.add(c.indicator_type);
      if (c.indicator_type_2) uniqueIndicators.add(c.indicator_type_2);
    });
  }

  console.log('Active strategy requirements:', {
    symbols: uniqueSymbols,
    timeframes: uniqueTimeframes,
    indicatorCount: uniqueIndicators.size,
  });

  return {
    symbols: uniqueSymbols,
    timeframes: uniqueTimeframes,
    indicators: Array.from(uniqueIndicators),
    activeStrategies,
  };
}
