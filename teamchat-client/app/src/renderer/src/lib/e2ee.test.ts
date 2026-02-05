import { describe, it, expect, beforeAll } from 'vitest';
import { webcrypto } from 'crypto';
import { signData } from './e2ee';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

describe('signData', () => {
  beforeAll(() => {
    // Ensure Web Crypto is available in test environment
    if (!globalThis.crypto) {
      globalThis.crypto = webcrypto as unknown as Crypto;
    }
  });

  it('signs data using the provided private key', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );

    const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const privateKeyBase64 = arrayBufferToBase64(privateKeyBuffer);

    const data = 'hello-teamchat';
    const signatureBase64 = await signData(data, privateKeyBase64);
    const signatureBuffer = base64ToArrayBuffer(signatureBase64);

    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.publicKey,
      signatureBuffer,
      new TextEncoder().encode(data)
    );

    expect(verified).toBe(true);
  });
});
