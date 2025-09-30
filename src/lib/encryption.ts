import CryptoJS from 'crypto-js';

/**
 * Client-side encryption utilities for sensitive data
 * Uses AES-256 encryption with user-specific keys
 */

// Generate a user-specific encryption key based on their user ID and a secret
// In production, this should use a more sophisticated key derivation function
const getEncryptionKey = (userId: string): string => {
  // Create a deterministic key from user ID
  // Note: In production, consider using PBKDF2 or similar
  return CryptoJS.SHA256(userId + 'binance-trader-key-salt').toString();
};

/**
 * Encrypt sensitive data before storing in database
 */
export const encryptData = (data: string, userId: string): string => {
  if (!data || !userId) {
    throw new Error('Data and userId are required for encryption');
  }
  
  const key = getEncryptionKey(userId);
  const encrypted = CryptoJS.AES.encrypt(data, key).toString();
  return encrypted;
};

/**
 * Decrypt data retrieved from database
 */
export const decryptData = (encryptedData: string, userId: string): string => {
  if (!encryptedData || !userId) {
    return '';
  }
  
  try {
    const key = getEncryptionKey(userId);
    const decrypted = CryptoJS.AES.decrypt(encryptedData, key);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
};

/**
 * Check if a string appears to be encrypted
 */
export const isEncrypted = (data: string): boolean => {
  if (!data) return false;
  // AES encrypted strings from CryptoJS start with "U2FsdGVk" (base64 for "Salted")
  return data.startsWith('U2FsdGVk');
};
