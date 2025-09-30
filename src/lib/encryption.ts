/**
 * DEPRECATED: Client-side encryption utilities
 * 
 * This file is kept for backward compatibility but should NOT be used for new code.
 * 
 * Security Note:
 * - Lovable Cloud (Supabase) provides encryption at rest for all database data
 * - Transport layer security (HTTPS/TLS) protects data in transit
 * - Row Level Security (RLS) policies control access to sensitive data
 * - Client-side encryption adds complexity without meaningful security benefits
 * 
 * For API keys and secrets:
 * - Store them directly in the database (they're encrypted at rest)
 * - Use RLS policies to restrict access to user's own data
 * - Edge functions can securely access them server-side
 * 
 * This approach is more secure because:
 * 1. No weak key derivation vulnerabilities
 * 2. No client-side key management issues
 * 3. Server-side functions can access secrets without client-side decryption
 * 4. Simpler security model is easier to audit and maintain
 */

// Legacy functions kept for compatibility
export const encryptData = (data: string, userId: string): string => {
  console.warn('DEPRECATED: encryptData() is deprecated. Store data directly - Lovable Cloud provides encryption at rest.');
  return data;
};

export const decryptData = (encryptedData: string, userId: string): string => {
  console.warn('DEPRECATED: decryptData() is deprecated. Retrieve data directly from database.');
  return encryptedData;
};

export const isEncrypted = (data: string): boolean => {
  console.warn('DEPRECATED: isEncrypted() is deprecated.');
  return false;
};
