/**
 * End-to-End Encryption Library
 *
 * Implements E2EE for TeamChat using:
 * - X25519 for key exchange (via Web Crypto API)
 * - AES-256-GCM for symmetric message encryption
 * - HKDF for key derivation
 *
 * Security Notes:
 * - Private keys never leave the device
 * - Each conversation has a unique symmetric key
 * - Keys are rotated periodically for forward secrecy
 *
 * @module apps/desktop/src/renderer/src/lib/e2ee
 */

import type { E2EEKeyPair, EncryptedMessage } from '@teamchat/shared';

// Constants
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const NONCE_LENGTH = 12; // 96 bits for AES-GCM
const SALT_LENGTH = 16;

// Storage keys
const PRIVATE_KEY_STORAGE = 'e2ee_private_key';
const DEVICE_ID_STORAGE = 'e2ee_device_id';

/**
 * Generate a unique device ID for this client
 */
export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_STORAGE);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE, deviceId);
  }
  return deviceId;
}

/**
 * Generate a new X25519 key pair for the user
 * Note: Web Crypto doesn't directly support X25519, so we use ECDH with P-256
 * For production, consider using a library like libsodium-wrappers
 */
export async function generateKeyPair(): Promise<E2EEKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256', // Using P-256 as Web Crypto doesn't support X25519 natively
    },
    true, // extractable
    ['deriveBits', 'deriveKey']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

/**
 * Store the private key securely in local storage
 * In production, consider using IndexedDB with encryption or system keychain
 */
export async function storePrivateKey(privateKey: string): Promise<void> {
  const secureStorage = await getSecureStorage();
  if (secureStorage) {
    await secureStorage.setE2EEKey(privateKey);
    return;
  }
  localStorage.setItem(PRIVATE_KEY_STORAGE, privateKey);
}

/**
 * Retrieve the stored private key
 */
export async function getStoredPrivateKey(): Promise<string | null> {
  const secureStorage = await getSecureStorage();
  if (secureStorage) {
    return await secureStorage.getE2EEKey();
  }
  return localStorage.getItem(PRIVATE_KEY_STORAGE);
}

/**
 * Import a private key from base64 for use in crypto operations
 */
async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  return crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits', 'deriveKey']
  );
}

/**
 * Import a public key from base64 for use in crypto operations
 */
async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
  return crypto.subtle.importKey(
    'raw',
    publicKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

/**
 * Derive a shared secret from our private key and their public key
 */
export async function deriveSharedSecret(
  ourPrivateKeyBase64: string,
  theirPublicKeyBase64: string
): Promise<CryptoKey> {
  const ourPrivateKey = await importPrivateKey(ourPrivateKeyBase64);
  const theirPublicKey = await importPublicKey(theirPublicKeyBase64);

  // Derive shared bits using ECDH
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    ourPrivateKey,
    256
  );

  // Use HKDF to derive the actual encryption key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(SALT_LENGTH), // Fixed salt for deterministic key derivation
      info: new TextEncoder().encode('teamchat-e2ee-v1'),
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a symmetric key for a new conversation
 */
export async function generateConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export a conversation key to raw bytes for sharing
 */
export async function exportConversationKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key);
}

/**
 * Import a conversation key from raw bytes
 */
export async function importConversationKey(keyBuffer: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a conversation key for a specific recipient using their public key
 */
export async function encryptKeyForRecipient(
  conversationKey: CryptoKey,
  ourPrivateKeyBase64: string,
  recipientPublicKeyBase64: string
): Promise<{ encryptedKey: string; nonce: string }> {
  const sharedKey = await deriveSharedSecret(ourPrivateKeyBase64, recipientPublicKeyBase64);
  const keyBuffer = await exportConversationKey(conversationKey);

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: nonce },
    sharedKey,
    keyBuffer
  );

  return {
    encryptedKey: arrayBufferToBase64(encrypted),
    nonce: arrayBufferToBase64(nonce),
  };
}

/**
 * Decrypt a conversation key received from another user
 */
export async function decryptKeyFromSender(
  encryptedKeyBase64: string,
  nonceBase64: string,
  ourPrivateKeyBase64: string,
  senderPublicKeyBase64: string
): Promise<CryptoKey> {
  const sharedKey = await deriveSharedSecret(ourPrivateKeyBase64, senderPublicKeyBase64);
  const encryptedBuffer = base64ToArrayBuffer(encryptedKeyBase64);
  const nonce = base64ToArrayBuffer(nonceBase64);

  const keyBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: nonce },
    sharedKey,
    encryptedBuffer
  );

  return importConversationKey(keyBuffer);
}

/**
 * Encrypt a message using the conversation key
 */
export async function encryptMessage(
  plaintext: string,
  conversationKey: CryptoKey,
  keyVersion: number
): Promise<EncryptedMessage> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: nonce },
    conversationKey,
    data
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    nonce: arrayBufferToBase64(nonce),
    keyVersion,
  };
}

/**
 * Decrypt a message using the conversation key
 */
export async function decryptMessage(
  encryptedMessage: EncryptedMessage,
  conversationKey: CryptoKey
): Promise<string> {
  const ciphertext = base64ToArrayBuffer(encryptedMessage.ciphertext);
  const nonce = base64ToArrayBuffer(encryptedMessage.nonce);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: nonce },
    conversationKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Sign data with our private key for verification
 */
export async function signData(data: string, privateKeyBase64: string): Promise<string> {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encoder.encode(data)
  );

  return arrayBufferToBase64(signature);
}

// ============================================
// Key Storage Manager
// ============================================

interface StoredConversationKey {
  conversationId: string;
  key: string; // Base64 encoded
  version: number;
}

const CONVERSATION_KEYS_STORAGE = 'e2ee_conversation_keys';

/**
 * Store a conversation key locally
 */
export function storeConversationKey(
  conversationId: string,
  keyBase64: string,
  version: number
): void {
  const keysJson = localStorage.getItem(CONVERSATION_KEYS_STORAGE);
  const keys: StoredConversationKey[] = keysJson ? JSON.parse(keysJson) : [];

  // Remove old version if exists
  const filtered = keys.filter(
    (k) => !(k.conversationId === conversationId && k.version === version)
  );

  filtered.push({ conversationId, key: keyBase64, version });
  localStorage.setItem(CONVERSATION_KEYS_STORAGE, JSON.stringify(filtered));
}

/**
 * Retrieve a conversation key from local storage
 */
export async function getStoredConversationKey(
  conversationId: string,
  version?: number
): Promise<CryptoKey | null> {
  const keysJson = localStorage.getItem(CONVERSATION_KEYS_STORAGE);
  if (!keysJson) return null;

  const keys: StoredConversationKey[] = JSON.parse(keysJson);
  const stored = keys.find(
    (k) =>
      k.conversationId === conversationId &&
      (version === undefined || k.version === version)
  );

  if (!stored) return null;

  const keyBuffer = base64ToArrayBuffer(stored.key);
  return importConversationKey(keyBuffer);
}

/**
 * Clear all stored keys (for logout)
 */
export async function clearStoredKeys(): Promise<void> {
  const secureStorage = await getSecureStorage();
  if (secureStorage) {
    await secureStorage.deleteE2EEKey();
  }
  localStorage.removeItem(PRIVATE_KEY_STORAGE);
  localStorage.removeItem(CONVERSATION_KEYS_STORAGE);
}

async function getSecureStorage(): Promise<{
  setE2EEKey: (key: string) => Promise<void>;
  getE2EEKey: () => Promise<string | null>;
  deleteE2EEKey: () => Promise<void>;
} | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  const api = window.electronAPI?.secureStorage;
  if (!api?.isAvailable) {
    return null;
  }
  const available = await api.isAvailable();
  if (!available) {
    return null;
  }
  if (!api.setE2EEKey || !api.getE2EEKey || !api.deleteE2EEKey) {
    return null;
  }
  return {
    setE2EEKey: api.setE2EEKey,
    getE2EEKey: api.getE2EEKey,
    deleteE2EEKey: api.deleteE2EEKey,
  };
}

// ============================================
// Utility Functions
// ============================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check if E2EE is available in this browser
 */
export function isE2EESupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  );
}
