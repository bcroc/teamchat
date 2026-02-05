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
/**
 * Socket.io event name constants.
 * Use these instead of string literals for type safety.
 */
export declare const SOCKET_EVENTS: {
    readonly CONNECTION: "connection";
    readonly DISCONNECT: "disconnect";
    readonly ERROR: "error";
    readonly AUTH: "auth";
    readonly AUTH_SUCCESS: "auth:success";
    readonly AUTH_ERROR: "auth:error";
    readonly CHANNEL_JOIN: "channel:join";
    readonly CHANNEL_LEAVE: "channel:leave";
    readonly DM_JOIN: "dm:join";
    readonly DM_LEAVE: "dm:leave";
    readonly MESSAGE_CREATED: "message:created";
    readonly MESSAGE_UPDATED: "message:updated";
    readonly MESSAGE_DELETED: "message:deleted";
    readonly REACTION_ADDED: "reaction:added";
    readonly REACTION_REMOVED: "reaction:removed";
    readonly MESSAGE_PINNED: "message:pinned";
    readonly MESSAGE_UNPINNED: "message:unpinned";
    readonly TYPING_START: "typing:start";
    readonly TYPING_STOP: "typing:stop";
    readonly TYPING_UPDATE: "typing:update";
    readonly PRESENCE_UPDATE: "presence:update";
    readonly PRESENCE_SUBSCRIBE: "presence:subscribe";
    readonly INTERACTION_TRIGGERED: "interaction:triggered";
    readonly INTERACTION_RESPONSE: "interaction:response";
    readonly CALL_INVITE: "call:invite";
    readonly CALL_RINGING: "call:ringing";
    readonly CALL_ACCEPTED: "call:accepted";
    readonly CALL_DECLINED: "call:declined";
    readonly CALL_JOIN: "call:join";
    readonly CALL_LEAVE: "call:leave";
    readonly CALL_OFFER: "call:offer";
    readonly CALL_ANSWER: "call:answer";
    readonly CALL_ICE: "call:ice";
    readonly CALL_HANGUP: "call:hangup";
    readonly CALL_SCREENSHARE_START: "call:screenshare:start";
    readonly CALL_SCREENSHARE_STOP: "call:screenshare:stop";
    readonly CALL_STATE_UPDATE: "call:state:update";
    readonly CALL_PARTICIPANT_JOINED: "call:participant:joined";
    readonly CALL_PARTICIPANT_LEFT: "call:participant:left";
    readonly CALL_MEDIA_STATE: "call:media:state";
    readonly CALL_ERROR: "call:error";
};
/**
 * Standard HTTP status codes used in API responses.
 * Provides type-safe access instead of magic numbers.
 */
export declare const HTTP_STATUS: {
    readonly OK: 200;
    readonly CREATED: 201;
    readonly NO_CONTENT: 204;
    readonly BAD_REQUEST: 400;
    readonly UNAUTHORIZED: 401;
    readonly FORBIDDEN: 403;
    readonly NOT_FOUND: 404;
    readonly CONFLICT: 409;
    readonly UNPROCESSABLE_ENTITY: 422;
    readonly TOO_MANY_REQUESTS: 429;
    readonly INTERNAL_SERVER_ERROR: 500;
};
/**
 * Application-specific error codes for structured error responses.
 * These codes help clients handle specific error conditions programmatically.
 */
export declare const ERROR_CODES: {
    readonly INVALID_CREDENTIALS: "INVALID_CREDENTIALS";
    readonly EMAIL_EXISTS: "EMAIL_EXISTS";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly SESSION_EXPIRED: "SESSION_EXPIRED";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly INVALID_INPUT: "INVALID_INPUT";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly ALREADY_EXISTS: "ALREADY_EXISTS";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly NOT_MEMBER: "NOT_MEMBER";
    readonly INSUFFICIENT_ROLE: "INSUFFICIENT_ROLE";
    readonly RATE_LIMITED: "RATE_LIMITED";
    readonly CALL_IN_PROGRESS: "CALL_IN_PROGRESS";
    readonly CALL_NOT_FOUND: "CALL_NOT_FOUND";
    readonly CALL_FULL: "CALL_FULL";
    readonly BOT_DISABLED: "BOT_DISABLED";
    readonly BOT_TOKEN_INVALID: "BOT_TOKEN_INVALID";
    readonly BOT_TOKEN_EXPIRED: "BOT_TOKEN_EXPIRED";
    readonly BOT_TOKEN_REVOKED: "BOT_TOKEN_REVOKED";
    readonly BOT_INSUFFICIENT_SCOPE: "BOT_INSUFFICIENT_SCOPE";
    readonly WEBHOOK_DISABLED: "WEBHOOK_DISABLED";
    readonly WEBHOOK_INVALID_TOKEN: "WEBHOOK_INVALID_TOKEN";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
};
export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
//# sourceMappingURL=index.d.ts.map