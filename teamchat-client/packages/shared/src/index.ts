/**
 * TeamChat Shared Package
 *
 * Contains all shared types, validation schemas, and constants used
 * across both the API and desktop applications. This ensures type
 * safety and consistency across the entire monorepo.
 *
 * Exports:
 * - Entity types (User, Message, Channel, etc.)
 * - Zod validation schemas for API input
 * - Socket.io event name constants
 * - HTTP status code and error code constants
 *
 * @module @teamchat/shared
 */

export * from './types/index.js';
export * from './schemas/index.js';

// ============================================
// Socket Event Names
// ============================================

/**
 * Socket.io event name constants.
 * Use these instead of string literals for type safety.
 */
export const SOCKET_EVENTS = {
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Auth
  AUTH: 'auth',
  AUTH_SUCCESS: 'auth:success',
  AUTH_ERROR: 'auth:error',

  // Channel/DM room management
  CHANNEL_JOIN: 'channel:join',
  CHANNEL_LEAVE: 'channel:leave',
  DM_JOIN: 'dm:join',
  DM_LEAVE: 'dm:leave',

  // Messages
  MESSAGE_CREATED: 'message:created',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',

  // Reactions
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',

  // Pinned messages
  MESSAGE_PINNED: 'message:pinned',
  MESSAGE_UNPINNED: 'message:unpinned',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  TYPING_UPDATE: 'typing:update',

  // Presence
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_SUBSCRIBE: 'presence:subscribe',

  // Interactions (bot button clicks, etc.)
  INTERACTION_TRIGGERED: 'interaction:triggered',
  INTERACTION_RESPONSE: 'interaction:response',

  // Calls
  CALL_INVITE: 'call:invite',
  CALL_RINGING: 'call:ringing',
  CALL_ACCEPTED: 'call:accepted',
  CALL_DECLINED: 'call:declined',
  CALL_JOIN: 'call:join',
  CALL_LEAVE: 'call:leave',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE: 'call:ice',
  CALL_HANGUP: 'call:hangup',
  CALL_SCREENSHARE_START: 'call:screenshare:start',
  CALL_SCREENSHARE_STOP: 'call:screenshare:stop',
  CALL_STATE_UPDATE: 'call:state:update',
  CALL_PARTICIPANT_JOINED: 'call:participant:joined',
  CALL_PARTICIPANT_LEFT: 'call:participant:left',
  CALL_MEDIA_STATE: 'call:media:state',
  CALL_ERROR: 'call:error',
} as const;

// ============================================
// HTTP Status Codes
// ============================================

/**
 * Standard HTTP status codes used in API responses.
 * Provides type-safe access instead of magic numbers.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ============================================
// Error Codes
// ============================================

/**
 * Application-specific error codes for structured error responses.
 * These codes help clients handle specific error conditions programmatically.
 */
export const ERROR_CODES = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // Permissions
  FORBIDDEN: 'FORBIDDEN',
  NOT_MEMBER: 'NOT_MEMBER',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',

  // Calls
  CALL_IN_PROGRESS: 'CALL_IN_PROGRESS',
  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  CALL_FULL: 'CALL_FULL',

  // Bots
  BOT_DISABLED: 'BOT_DISABLED',
  BOT_TOKEN_INVALID: 'BOT_TOKEN_INVALID',
  BOT_TOKEN_EXPIRED: 'BOT_TOKEN_EXPIRED',
  BOT_TOKEN_REVOKED: 'BOT_TOKEN_REVOKED',
  BOT_INSUFFICIENT_SCOPE: 'BOT_INSUFFICIENT_SCOPE',
  WEBHOOK_DISABLED: 'WEBHOOK_DISABLED',
  WEBHOOK_INVALID_TOKEN: 'WEBHOOK_INVALID_TOKEN',

  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// ============================================
// Utility Types
// ============================================

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
