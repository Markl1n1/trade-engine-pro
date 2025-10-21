// Input validation schemas for edge functions
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Signal validation schema
export const signalSchema = z.object({
  type: z.literal('signal'),
  signal: z.object({
    id: z.string().uuid(),
    strategyId: z.string().uuid(),
    userId: z.string().uuid(),
    signal: z.enum(['buy', 'sell', 'hold']),
    symbol: z.string().regex(/^[A-Z0-9]{4,12}$/, 'Invalid symbol format'),
    price: z.number().positive().finite(),
    timestamp: z.number().int().positive(),
    mode: z.string(),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    channels: z.array(z.string()),
    metadata: z.object({
      indicators: z.any(),
      conditions: z.any(),
      risk: z.any()
    })
  })
});

// Backtest validation schema
export const backtestSchema = z.object({
  strategyId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  initialBalance: z.number().positive().max(1000000000, 'Initial balance too large'),
  leverage: z.number().int().min(1).max(125, 'Leverage must be between 1 and 125'),
  makerFee: z.number().min(0).max(1, 'Maker fee must be between 0 and 1'),
  takerFee: z.number().min(0).max(1, 'Taker fee must be between 0 and 1'),
  slippage: z.number().min(0).max(1, 'Slippage must be between 0 and 1'),
  stopLossPercent: z.number().min(0).max(100).optional(),
  takeProfitPercent: z.number().min(0).max(1000).optional(),
  trailingStopPercent: z.number().min(0).max(100).optional(),
  productType: z.enum(['spot', 'futures']).optional(),
  executionTiming: z.enum(['open', 'close']).optional()
});

// Close position validation schema
export const closePositionSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{4,12}$/, 'Invalid symbol format').optional(),
  closeAll: z.boolean().optional()
}).refine(data => data.symbol || data.closeAll, {
  message: 'Either symbol or closeAll must be provided'
});

// Symbol validation
export const symbolSchema = z.string().regex(/^[A-Z0-9]{4,12}$/, 'Invalid symbol format');

// Timeframe validation
export const timeframeSchema = z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '3d', '1w']);

// Trading mode validation
export const tradingModeSchema = z.enum([
  'testnet_only',
  'hybrid_safe', 
  'hybrid_live',
  'paper_trading',
  'mainnet_only'
]);

// Validate input and return typed result or throw error
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw new Error(`Validation failed: ${messages}`);
    }
    throw error;
  }
}
