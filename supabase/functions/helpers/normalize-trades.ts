/**
 * Unified Trade Normalization
 * Ensures all trades from different strategies have the same format
 */

export interface NormalizedTrade {
  type: 'buy' | 'sell';
  entry_time: number; // Unix timestamp in milliseconds
  exit_time?: number; // Unix timestamp in milliseconds
  entry_price: number;
  exit_price?: number;
  profit?: number;
  profit_percent?: number;
  exit_reason?: string;
  quantity?: number;
}

/**
 * Normalize trade time to Unix timestamp (milliseconds)
 */
function normalizeTime(time: string | number | undefined | null): number | undefined {
  if (!time && time !== 0) return undefined;
  
  if (typeof time === 'number') {
    // If it's already a timestamp, ensure it's in milliseconds
    // Timestamps < 1e12 are in seconds, >= 1e12 are in milliseconds
    // Also handle negative timestamps (shouldn't happen but just in case)
    if (time < 0) return undefined;
    return time < 1e12 ? time * 1000 : time;
  }
  
  if (typeof time === 'string') {
    // Try parsing as ISO string or timestamp string
    const parsed = new Date(time).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    // Try parsing as number string
    const numParsed = parseFloat(time);
    if (!isNaN(numParsed) && numParsed > 0) {
      return numParsed < 1e12 ? numParsed * 1000 : numParsed;
    }
    return undefined;
  }
  
  return undefined;
}

/**
 * Calculate profit percentage from entry and exit prices
 */
function calculateProfitPercent(
  entryPrice: number,
  exitPrice: number | undefined,
  type: 'buy' | 'sell'
): number | undefined {
  if (!exitPrice || !entryPrice) return undefined;
  
  if (type === 'buy') {
    return ((exitPrice - entryPrice) / entryPrice) * 100;
  } else {
    return ((entryPrice - exitPrice) / entryPrice) * 100;
  }
}

/**
 * Normalize a single trade to unified format
 */
function normalizeSingleTrade(trade: any): NormalizedTrade | null {
  if (!trade) {
    console.warn('[NORMALIZE] Trade is null or undefined');
    return null;
  }
  
  // Ensure type is present and valid
  let type: 'buy' | 'sell' = 'buy';
  if (trade.type) {
    type = trade.type.toLowerCase() === 'sell' ? 'sell' : 'buy';
  } else if (trade.side) {
    type = trade.side.toLowerCase() === 'sell' ? 'sell' : 'buy';
  }
  
  // Normalize entry_time - try multiple possible field names
  let entryTime = normalizeTime(trade.entry_time);
  if (!entryTime) {
    // Try alternative field names
    entryTime = normalizeTime(trade.entryTime) || normalizeTime(trade.open_time) || normalizeTime(trade.timestamp);
  }
  
  if (!entryTime) {
    console.warn('[NORMALIZE] Trade missing entry_time. Trade keys:', Object.keys(trade), 'Trade:', JSON.stringify(trade).substring(0, 200));
    return null;
  }
  
  // Ensure entry_price is present - try multiple possible field names
  let entryPrice = parseFloat(trade.entry_price);
  if (isNaN(entryPrice) || entryPrice <= 0) {
    entryPrice = parseFloat(trade.entryPrice) || parseFloat(trade.price) || parseFloat(trade.open);
  }
  
  if (isNaN(entryPrice) || entryPrice <= 0) {
    console.warn('[NORMALIZE] Trade missing or invalid entry_price. Trade keys:', Object.keys(trade), 'Trade:', JSON.stringify(trade).substring(0, 200));
    return null;
  }
  
  // Normalize exit_time (optional) - try multiple possible field names
  let exitTime = normalizeTime(trade.exit_time);
  if (!exitTime) {
    exitTime = normalizeTime(trade.exitTime) || normalizeTime(trade.close_time);
  }
  
  // Normalize exit_price (optional) - try multiple possible field names
  let exitPrice: number | undefined = undefined;
  if (trade.exit_price) {
    exitPrice = parseFloat(trade.exit_price);
  } else if (trade.exitPrice) {
    exitPrice = parseFloat(trade.exitPrice);
  } else if (trade.close_price) {
    exitPrice = parseFloat(trade.close_price);
  }
  
  if (exitPrice !== undefined && (isNaN(exitPrice) || exitPrice <= 0)) {
    exitPrice = undefined;
  }
  
  // Calculate or use existing profit
  let profit = trade.profit !== undefined ? parseFloat(trade.profit) : undefined;
  if (profit === undefined && exitPrice) {
    // Calculate profit from prices
    if (type === 'buy') {
      profit = exitPrice - entryPrice;
    } else {
      profit = entryPrice - exitPrice;
    }
    // Adjust for quantity if available
    if (trade.quantity) {
      profit = profit * parseFloat(trade.quantity);
    }
  }
  
  // Calculate profit_percent if not present
  let profitPercent = trade.profit_percent !== undefined 
    ? parseFloat(trade.profit_percent) 
    : undefined;
  
  if (profitPercent === undefined && exitPrice) {
    profitPercent = calculateProfitPercent(entryPrice, exitPrice, type);
  }
  
  // Normalize exit_reason
  const exitReason = trade.exit_reason || trade.exitReason || undefined;
  
  // Normalize quantity
  const quantity = trade.quantity ? parseFloat(trade.quantity) : undefined;
  
  return {
    type,
    entry_time: entryTime,
    exit_time: exitTime,
    entry_price: entryPrice,
    exit_price: exitPrice,
    profit,
    profit_percent: profitPercent,
    exit_reason: exitReason,
    quantity
  };
}

/**
 * Normalize array of trades to unified format
 * Filters out invalid trades and ensures consistent structure
 */
export function normalizeTrades(trades: any[]): NormalizedTrade[] {
  if (!Array.isArray(trades)) {
    console.warn('[NORMALIZE] Trades is not an array:', trades);
    return [];
  }
  
  const normalized: NormalizedTrade[] = [];
  
  for (const trade of trades) {
    const normalizedTrade = normalizeSingleTrade(trade);
    if (normalizedTrade) {
      normalized.push(normalizedTrade);
    }
  }
  
  // Sort by entry_time
  normalized.sort((a, b) => a.entry_time - b.entry_time);
  
  console.log(`[NORMALIZE] Normalized ${normalized.length} trades from ${trades.length} input trades`);
  
  return normalized;
}

