/**
 * Tailscale Utilities
 *
 * Helper functions for Tailscale network detection and validation.
 * Tailscale uses the CGNAT range 100.64.0.0/10 (100.64.0.0 - 100.127.255.255).
 */

import { networkInterfaces } from 'os';

/**
 * Check if an IP address is within the Tailscale CGNAT range (100.64.0.0/10)
 * Valid range: 100.64.0.0 - 100.127.255.255
 */
export function isTailscaleIP(ip: string): boolean {
  const match = ip.match(/^100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const secondOctet = parseInt(match[1], 10);
  const thirdOctet = parseInt(match[2], 10);
  const fourthOctet = parseInt(match[3], 10);

  // Validate octets are in valid range (0-255)
  if (thirdOctet > 255 || fourthOctet > 255) return false;

  // Second octet must be 64-127 for Tailscale CGNAT range
  return secondOctet >= 64 && secondOctet <= 127;
}

/**
 * Auto-detect the local Tailscale interface IP address.
 * Scans all network interfaces for an IP in the Tailscale range.
 *
 * @returns The first Tailscale IP found, or null if none detected
 */
export function detectTailscaleIP(): string | null {
  const interfaces = networkInterfaces();

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && isTailscaleIP(addr.address)) {
        console.log(`[Tailscale] Detected interface "${name}" with IP ${addr.address}`);
        return addr.address;
      }
    }
  }

  return null;
}

/**
 * Validate and warn about Tailscale binding configuration.
 * Call this after server starts to provide helpful diagnostics.
 */
export function validateTailscaleBinding(host: string, port: number, tailscaleEnabled: boolean): void {
  if (tailscaleEnabled) {
    if (isTailscaleIP(host)) {
      console.log(`[Tailscale] Server bound to tailnet interface ${host}:${port}`);
      console.log('[Tailscale] Server is NOT accessible from public internet');
    } else {
      console.warn(`⚠️  TAILSCALE_IP is set but server bound to ${host}:${port}`);
      console.warn('   This may indicate a configuration error');
    }
  } else if (host === '0.0.0.0') {
    const detectedIP = detectTailscaleIP();
    if (detectedIP) {
      console.log(`[Tailscale] Detected tailnet IP ${detectedIP}`);
      console.log('   Set TAILSCALE_IP to bind exclusively to tailnet');
    }
  }
}

/**
 * Check if an origin URL is from a Tailscale IP address.
 * Useful for CORS validation.
 */
export function isTailscaleOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return isTailscaleIP(url.hostname);
  } catch {
    return false;
  }
}
