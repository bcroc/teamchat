/**
 * Client Configuration Module
 *
 * Centralized configuration for the TeamChat desktop application.
 * All environment-based settings should be accessed through this module.
 */

interface AppConfig {
  readonly api: {
    readonly baseUrl: string;
    readonly timeout: number;
  };
  readonly socket: {
    readonly url: string;
    readonly reconnectionAttempts: number;
    readonly reconnectionDelay: number;
    readonly reconnectionDelayMax: number;
    readonly timeout: number;
  };
  readonly webrtc: {
    readonly turnServerUrl: string;
    readonly turnServerUsername: string;
    readonly turnServerCredential: string;
  };
  readonly app: {
    readonly isDev: boolean;
    readonly version: string;
  };
}

// Safely get environment variables with fallbacks
const getEnvVar = (key: string, fallback: string = ''): string => {
  if (typeof import.meta.env !== 'undefined') {
    return (import.meta.env[key] as string) || fallback;
  }
  return fallback;
};

// Validate URL format
const validateUrl = (url: string, name: string): string => {
  try {
    new URL(url);
    return url;
  } catch {
    console.warn(`Invalid ${name} URL: ${url}, using fallback`);
    return 'http://localhost:3001';
  }
};

const apiBaseUrl = validateUrl(
  getEnvVar('VITE_API_URL', 'http://localhost:3001'),
  'API'
);

export const config: AppConfig = {
  api: {
    baseUrl: apiBaseUrl,
    timeout: 30000, // 30 seconds
  },
  socket: {
    url: apiBaseUrl,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    timeout: 20000,
  },
  webrtc: {
    turnServerUrl: getEnvVar('VITE_TURN_SERVER_URL', ''),
    turnServerUsername: getEnvVar('VITE_TURN_SERVER_USERNAME', ''),
    turnServerCredential: getEnvVar('VITE_TURN_SERVER_CREDENTIAL', ''),
  },
  app: {
    isDev: getEnvVar('DEV', 'false') === 'true' || import.meta.env.DEV,
    version: getEnvVar('VITE_APP_VERSION', '1.0.0'),
  },
} as const;

// Log config in development
if (config.app.isDev) {
  console.log('[Config] Loaded configuration:', {
    apiUrl: config.api.baseUrl,
    socketUrl: config.socket.url,
    isDev: config.app.isDev,
  });
}

export default config;
