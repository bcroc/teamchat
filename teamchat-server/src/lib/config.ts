import type { IceServer } from '@teamchat/shared';
import { z } from 'zod';
import { isTailscaleIP } from './tailscale.js';

/**
 * Custom Zod validator for Tailscale IP addresses
 * Validates that the IP is in the CGNAT range 100.64.0.0/10
 */
const tailscaleIPSchema = z.string().refine(
  (ip) => isTailscaleIP(ip),
  { message: 'TAILSCALE_IP must be a valid Tailscale IP (100.64.x.x - 100.127.x.x)' }
);

/**
 * Environment configuration schema with validation
 * All environment variables are validated at startup
 */
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_URL: z.string().url().optional(),

  // Tailscale - bind exclusively to tailnet interface
  TAILSCALE_IP: tailscaleIPSchema.optional(),

  // Security - JWT_SECRET is REQUIRED (no weak defaults)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // CORS - no default in production, must be explicitly configured
  CORS_ORIGIN: z.string(),
  
  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  
  // File uploads
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.coerce.number().int().min(1024).default(10485760),
  
  // WebRTC
  STUN_URLS: z.string().optional(),
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  
  // Database & Redis - validated elsewhere
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

/**
 * Generate a development-only secret (DO NOT use in production)
 * This is only used when NODE_ENV=development and no JWT_SECRET is provided
 */
function getDevDefaults(): Partial<Record<string, string>> {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return {
      JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production-32chars',
      CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    };
  }
  return {};
}

/**
 * Parse and validate environment variables
 * Throws descriptive errors if validation fails
 */
function parseEnv() {
  const envWithDefaults = { ...getDevDefaults(), ...process.env };
  const result = envSchema.safeParse(envWithDefaults);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error('❌ Environment validation failed:\n' + errors);
    console.error('\n💡 Required environment variables:');
    console.error('   JWT_SECRET: Generate with: openssl rand -base64 32');
    console.error('   CORS_ORIGIN: Comma-separated list of allowed origins');
    process.exit(1);
  }

  return result.data;
}

const env = parseEnv();

// Additional production security checks
if (env.NODE_ENV === 'production') {
  // Warn if CORS allows all origins
  if (env.CORS_ORIGIN === '*') {
    console.warn('⚠️  Warning: CORS_ORIGIN is set to "*" - this is insecure in production');
  }

  // Warn if using localhost in production CORS
  if (env.CORS_ORIGIN.includes('localhost')) {
    console.warn('⚠️  Warning: CORS_ORIGIN contains localhost - ensure this is intentional');
  }

  // Warn if TURN servers are not configured
  if (!process.env.TURN_URLS) {
    console.warn('⚠️  Warning: TURN_URLS not configured - WebRTC may fail behind strict NATs');
  }
}

/**
 * Application configuration object
 * Centralized, type-safe configuration with validated values
 */
export const config = {
  port: env.PORT,
  // Use TAILSCALE_IP if set, otherwise fall back to HOST
  host: env.TAILSCALE_IP || env.HOST,
  nodeEnv: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  apiUrl: env.API_URL || `http://localhost:${env.PORT}`,

  // Tailscale configuration
  tailscale: {
    ip: env.TAILSCALE_IP,
    isEnabled: !!env.TAILSCALE_IP,
  },

  cors: {
    origin: env.CORS_ORIGIN.split(',').map(s => s.trim()),
    credentials: true,
  },

  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  },

  upload: {
    dir: env.UPLOAD_DIR,
    maxFileSize: env.MAX_FILE_SIZE,
  },

  webrtc: {
    getIceServers(): IceServer[] {
      const stunUrls = env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
      const turnUrls = env.TURN_URLS;
      const turnUsername = env.TURN_USERNAME;
      const turnCredential = env.TURN_CREDENTIAL;

      const servers: IceServer[] = [
        { urls: stunUrls.split(',').map(s => s.trim()) },
      ];

      if (turnUrls && turnUsername && turnCredential) {
        servers.push({
          urls: turnUrls.split(',').map(s => s.trim()),
          username: turnUsername,
          credential: turnCredential,
        });
      }

      return servers;
    },
  },
  
  // Security settings
  security: {
    bcryptRounds: 12,
    tokenExpiry: '7d',
    refreshTokenExpiry: '30d',
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
  },
} as const;

// Export validated env for direct access if needed
export { env };
