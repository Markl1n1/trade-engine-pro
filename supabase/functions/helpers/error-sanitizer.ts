/**
 * Error Sanitization Utility
 * Prevents information leakage by returning generic error messages to clients
 * while logging detailed errors server-side for debugging
 */

export const ERROR_MESSAGES = {
  AUTH_FAILED: 'Authentication failed. Please check your credentials.',
  INVALID_INPUT: 'Invalid request parameters provided.',
  EXCHANGE_ERROR: 'Exchange API error occurred. Please try again.',
  SETTINGS_NOT_FOUND: 'User settings not found. Please configure your account.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  RATE_LIMIT: 'Too many requests. Please try again later.',
  INVALID_SYMBOL: 'Invalid trading symbol provided.',
  POSITION_ERROR: 'Unable to process position. Please try again.',
} as const;

interface ErrorContext {
  function: string;
  userId?: string;
  error: any;
  metadata?: Record<string, any>;
}

/**
 * Sanitizes error messages for client responses
 * @param error - The original error object
 * @returns Generic user-friendly error message
 */
export function sanitizeError(error: any): string {
  const message = error?.message?.toLowerCase() || '';
  
  // Map specific error types to generic messages
  if (message.includes('unauthorized') || message.includes('authentication')) {
    return ERROR_MESSAGES.AUTH_FAILED;
  }
  
  if (message.includes('validation') || message.includes('invalid')) {
    return ERROR_MESSAGES.INVALID_INPUT;
  }
  
  if (message.includes('binance') || message.includes('bybit') || message.includes('exchange')) {
    return ERROR_MESSAGES.EXCHANGE_ERROR;
  }
  
  if (message.includes('not found') && message.includes('settings')) {
    return ERROR_MESSAGES.SETTINGS_NOT_FOUND;
  }
  
  if (message.includes('rate limit') || message.includes('too many')) {
    return ERROR_MESSAGES.RATE_LIMIT;
  }
  
  if (message.includes('symbol')) {
    return ERROR_MESSAGES.INVALID_SYMBOL;
  }
  
  if (message.includes('position')) {
    return ERROR_MESSAGES.POSITION_ERROR;
  }
  
  // Default generic message
  return ERROR_MESSAGES.INTERNAL_ERROR;
}

/**
 * Logs detailed error information server-side for debugging
 * @param context - Error context including function name, user ID, and metadata
 */
export function logDetailedError(context: ErrorContext): void {
  const { function: functionName, userId, error, metadata } = context;
  
  console.error('[SECURITY_ERROR]', {
    function: functionName,
    userId: userId || 'unknown',
    message: error?.message || 'Unknown error',
    stack: error?.stack,
    metadata,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Complete error handling: logs detailed info and returns sanitized message
 * @param context - Error context
 * @returns Sanitized error message for client
 */
export function handleError(context: ErrorContext): string {
  logDetailedError(context);
  return sanitizeError(context.error);
}
