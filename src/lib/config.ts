import type { IceServer } from '@teamchat/shared';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },

  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
  },

  webrtc: {
    getIceServers(): IceServer[] {
      const stunUrls = process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
      const turnUrls = process.env.TURN_URLS;
      const turnUsername = process.env.TURN_USERNAME;
      const turnCredential = process.env.TURN_CREDENTIAL;

      const servers: IceServer[] = [
        { urls: stunUrls.split(',') },
      ];

      if (turnUrls && turnUsername && turnCredential) {
        servers.push({
          urls: turnUrls.split(','),
          username: turnUsername,
          credential: turnCredential,
        });
      }

      return servers;
    },
  },
} as const;
