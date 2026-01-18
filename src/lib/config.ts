import type { IceServer } from '@teamchat/shared';
import { z } from 'zod';

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
  
  // Security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  
  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  
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
 * Parse and validate environment variables
 * Throws descriptive errors if validation fails
 */
function parseEnv() {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
    console.error('❌ Environment validation failed:\n' + errors);
    
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
  
  return result.success ? result.data : envSchema.parse({});
}

const env = parseEnv();

// Validate JWT_SECRET in production
if (env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters in production');
    process.exit(1);
  }
}

/**
 * Application configuration object
 * Centralized, type-safe configuration with validated values
 */
export const config = {
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  apiUrl: env.API_URL || `http://localhost:${env.PORT}`,

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
