/**
 * Security Utilities
 * 
 * Provides security-focused utilities including:
 * - Login attempt rate limiting
 * - IP-based blocking
 * - Timing-safe comparison helpers
 * 
 * @module apps/api/src/lib/security
 */

import { redis } from './redis.js';
import { config } from './config.js';

const LOGIN_ATTEMPTS_PREFIX = 'login_attempts:';
const LOGIN_LOCKOUT_PREFIX = 'login_lockout:';

/**
 * Check if an account is locked due to too many failed attempts
 */
export async function isAccountLocked(email: string): Promise<boolean> {
  const key = `${LOGIN_LOCKOUT_PREFIX}${email.toLowerCase()}`;
  const locked = await redis.get(key);
  return locked !== null;
}

/**
 * Record a failed login attempt
 * Returns true if account should be locked
 */
export async function recordFailedLogin(email: string, ip: string): Promise<boolean> {
  const emailKey = `${LOGIN_ATTEMPTS_PREFIX}${email.toLowerCase()}`;
  const ipKey = `${LOGIN_ATTEMPTS_PREFIX}ip:${ip}`;
  
  // Increment both email and IP counters
  const [emailAttempts, ipAttempts] = await Promise.all([
    redis.incr(emailKey),
    redis.incr(ipKey),
  ]);
  
  // Set TTL if this is the first attempt
  if (emailAttempts === 1) {
    await redis.expire(emailKey, 900); // 15 minutes
  }
  if (ipAttempts === 1) {
    await redis.expire(ipKey, 900);
  }
  
  const maxAttempts = config.security.maxLoginAttempts;
  
  // Lock if too many attempts from email or IP
  if (emailAttempts >= maxAttempts || ipAttempts >= maxAttempts * 3) {
    const lockKey = `${LOGIN_LOCKOUT_PREFIX}${email.toLowerCase()}`;
    const lockDuration = Math.floor(config.security.lockoutDuration / 1000);
    await redis.setex(lockKey, lockDuration, '1');
    return true;
  }
  
  return false;
}

/**
 * Clear failed login attempts after successful login
 */
export async function clearFailedLogins(email: string): Promise<void> {
  const emailKey = `${LOGIN_ATTEMPTS_PREFIX}${email.toLowerCase()}`;
  await redis.del(emailKey);
}

/**
 * Get remaining login attempts for an email
 */
export async function getRemainingAttempts(email: string): Promise<number> {
  const key = `${LOGIN_ATTEMPTS_PREFIX}${email.toLowerCase()}`;
  const attempts = await redis.get(key);
  const used = attempts ? parseInt(attempts, 10) : 0;
  return Math.max(0, config.security.maxLoginAttempts - used);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Sanitize user input to prevent log injection
 */
export function sanitizeForLogs(input: string): string {
  return input
    .replace(/[\r\n]/g, '') // Remove newlines
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable chars
    .slice(0, 200); // Limit length
}

/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}
