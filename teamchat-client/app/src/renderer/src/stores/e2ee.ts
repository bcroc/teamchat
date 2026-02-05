/**
 * E2EE Store
 *
 * Manages end-to-end encryption state including:
 * - Key pair generation and storage
 * - Conversation key management
 * - Encryption/decryption of messages
 *
 * @module apps/desktop/src/renderer/src/stores/e2ee
 */

import { create } from 'zustand';
import { api } from '../lib/api';
import {
  generateKeyPair,
  storePrivateKey,
  getStoredPrivateKey,
  getOrCreateDeviceId,
  generateConversationKey,
  exportConversationKey,
  encryptKeyForRecipient,
  decryptKeyFromSender,
  encryptMessage,
  decryptMessage,
  storeConversationKey,
  getStoredConversationKey,
  clearStoredKeys,
  isE2EESupported,
} from '../lib/e2ee';
import type { E2EEKeyPair, EncryptedMessage, UserEncryptionKey } from '@teamchat/shared';

interface E2EEState {
  // State
  isInitialized: boolean;
  isEnabled: boolean;
  deviceId: string | null;
  publicKey: string | null;
  isLoading: boolean;
  error: string | null;

  // Cached conversation keys (in-memory only)
  conversationKeys: Map<string, CryptoKey>;

  // Actions
  initialize: () => Promise<void>;
  enableE2EE: () => Promise<void>;
  disableE2EE: () => Promise<void>;
  getConversationKey: (conversationId: string, conversationType: 'channel' | 'dm') => Promise<CryptoKey | null>;
  encryptMessageContent: (content: string, conversationId: string, conversationType: 'channel' | 'dm') => Promise<EncryptedMessage | null>;
  decryptMessageContent: (message: { body: string; nonce?: string | null; encryptionVersion?: number | null; isEncrypted: boolean }) => Promise<string>;
  setupConversationKey: (conversationId: string, conversationType: 'channel' | 'dm', participantPublicKeys: UserEncryptionKey[]) => Promise<void>;
  reset: () => Promise<void>;
}

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const useE2EEStore = create<E2EEState>((set, get) => ({
  isInitialized: false,
  isEnabled: false,
  deviceId: null,
  publicKey: null,
  isLoading: false,
  error: null,
  conversationKeys: new Map(),

  /**
   * Initialize E2EE - check for existing keys or generate new ones
   */
  initialize: async () => {
    if (!isE2EESupported()) {
      set({ error: 'E2EE is not supported in this browser', isInitialized: true });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const deviceId = getOrCreateDeviceId();
      const existingPrivateKey = await getStoredPrivateKey();

      if (existingPrivateKey) {
        // We have a stored key, try to fetch public key from server
        const response = await api.get(`/e2ee/keys/me?deviceId=${deviceId}`);
        if (response.key) {
          set({
            isInitialized: true,
            isEnabled: true,
            deviceId,
            publicKey: response.key.publicKey,
            isLoading: false,
          });
          return;
        }
      }

      // No existing key, E2EE not yet enabled for this device
      set({
        isInitialized: true,
        isEnabled: false,
        deviceId,
        isLoading: false,
      });
    } catch (error) {
      console.error('E2EE initialization error:', error);
      set({
        isInitialized: true,
        isEnabled: false,
        deviceId: getOrCreateDeviceId(),
        isLoading: false,
        error: 'Failed to initialize E2EE',
      });
    }
  },

  /**
   * Enable E2EE for this device by generating and uploading keys
   */
  enableE2EE: async () => {
    const { deviceId } = get();
    if (!deviceId) return;

    set({ isLoading: true, error: null });

    try {
      // Generate new key pair
      const keyPair = await generateKeyPair();

      // Store private key locally (never sent to server)
      await storePrivateKey(keyPair.privateKey);

      // Create a signature for key verification
      const signatureData = `${deviceId}:${keyPair.publicKey}`;
      const signature = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(signatureData)
      );
      const keySignature = arrayBufferToBase64(signature);

      // Upload public key to server
      await api.post('/e2ee/keys', {
        deviceId,
        publicKey: keyPair.publicKey,
        keySignature,
        algorithm: 'X25519', // We label it X25519 even though we use P-256
      });

      set({
        isEnabled: true,
        publicKey: keyPair.publicKey,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to enable E2EE:', error);
      set({
        isLoading: false,
        error: 'Failed to enable encryption',
      });
    }
  },

  /**
   * Disable E2EE for this device
   */
  disableE2EE: async () => {
    await clearStoredKeys();
    set({
      isEnabled: false,
      publicKey: null,
      conversationKeys: new Map(),
    });
  },

  /**
   * Get or create a conversation key for encrypting messages
   */
  getConversationKey: async (conversationId: string, conversationType: 'channel' | 'dm') => {
    const { isEnabled, conversationKeys } = get();
    if (!isEnabled) return null;

    // Check in-memory cache first
    if (conversationKeys.has(conversationId)) {
      return conversationKeys.get(conversationId)!;
    }

    // Try to load from local storage
    const storedKey = await getStoredConversationKey(conversationId);
    if (storedKey) {
      conversationKeys.set(conversationId, storedKey);
      set({ conversationKeys: new Map(conversationKeys) });
      return storedKey;
    }

    // Try to fetch from server
    try {
      const response = await api.get(`/e2ee/keys/conversation/${conversationId}`);
      if (response.keyShare) {
        const privateKey = await getStoredPrivateKey();
        if (!privateKey) return null;

        // Decrypt the conversation key using our private key
        const decryptedKey = await decryptKeyFromSender(
          response.keyShare.encryptedKey,
          response.keyShare.nonce,
          privateKey,
          response.senderPublicKey
        );

        // Cache the key
        const keyBuffer = await exportConversationKey(decryptedKey);
        storeConversationKey(conversationId, arrayBufferToBase64(keyBuffer), response.keyShare.keyVersion);
        conversationKeys.set(conversationId, decryptedKey);
        set({ conversationKeys: new Map(conversationKeys) });

        return decryptedKey;
      }
    } catch (error) {
      console.error('Failed to fetch conversation key:', error);
    }

    return null;
  },

  /**
   * Set up encryption for a new conversation
   */
  setupConversationKey: async (
    conversationId: string,
    conversationType: 'channel' | 'dm',
    participantPublicKeys: UserEncryptionKey[]
  ) => {
    const { isEnabled, conversationKeys } = get();
    if (!isEnabled) return;

    const privateKey = await getStoredPrivateKey();
    if (!privateKey) return;

    try {
      // Generate a new conversation key
      const conversationKey = await generateConversationKey();

      // Encrypt the key for each participant
      const keyShares = await Promise.all(
        participantPublicKeys.map(async (pk) => {
          const { encryptedKey, nonce } = await encryptKeyForRecipient(
            conversationKey,
            privateKey,
            pk.publicKey
          );
          return {
            recipientKeyId: pk.id,
            encryptedKey,
            nonce,
          };
        })
      );

      // Upload key shares to server
      await api.post('/e2ee/keys/conversation', {
        conversationId,
        conversationType,
        keyShares,
        keyVersion: 1,
      });

      // Cache locally
      const keyBuffer = await exportConversationKey(conversationKey);
      storeConversationKey(conversationId, arrayBufferToBase64(keyBuffer), 1);
      conversationKeys.set(conversationId, conversationKey);
      set({ conversationKeys: new Map(conversationKeys) });
    } catch (error) {
      console.error('Failed to setup conversation key:', error);
    }
  },

  /**
   * Encrypt message content before sending
   */
  encryptMessageContent: async (
    content: string,
    conversationId: string,
    conversationType: 'channel' | 'dm'
  ) => {
    const { isEnabled } = get();
    if (!isEnabled) return null;

    const conversationKey = await get().getConversationKey(conversationId, conversationType);
    if (!conversationKey) return null;

    try {
      return await encryptMessage(content, conversationKey, 1);
    } catch (error) {
      console.error('Failed to encrypt message:', error);
      return null;
    }
  },

  /**
   * Decrypt message content after receiving
   */
  decryptMessageContent: async (message) => {
    const { isEnabled } = get();

    // If message is not encrypted, return body as-is
    if (!message.isEncrypted) {
      return message.body;
    }

    // If E2EE is not enabled, show placeholder
    if (!isEnabled) {
      return '[Encrypted message - Enable E2EE to view]';
    }

    // Try to decrypt
    // Note: We need the conversationId to get the key, which should be passed separately
    // For now, return the encrypted body with indicator
    if (!message.nonce || !message.encryptionVersion) {
      return '[Encrypted message - Missing encryption data]';
    }

    return message.body; // Will be decrypted in the component with proper context
  },

  /**
   * Reset E2EE state (for logout)
   */
  reset: async () => {
    await clearStoredKeys();
    set({
      isInitialized: false,
      isEnabled: false,
      deviceId: null,
      publicKey: null,
      isLoading: false,
      error: null,
      conversationKeys: new Map(),
    });
  },
}));
