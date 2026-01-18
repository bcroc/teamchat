/**
 * Error Handling Utilities
 *
 * Provides a custom error class and pre-defined error factories for
 * consistent error handling across the API. All errors include:
 * - Standardized error codes from @teamchat/shared
 * - Appropriate HTTP status codes
 * - Optional details for debugging
 *
 * @module apps/api/src/lib/errors
 */

import { ERROR_CODES, HTTP_STATUS } from '@teamchat/shared';
import type { ErrorCode, HttpStatus } from '@teamchat/shared';

/**
 * Custom application error with structured response format.
 *
 * @example
 * throw new AppError('UNAUTHORIZED', 'Token expired', 401);
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: HttpStatus;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: HttpStatus = HTTP_STATUS.BAD_REQUEST,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Pre-defined error factory functions for common error cases.
 * Use these instead of creating AppError instances directly for consistency.
 */
export const errors = {
  unauthorized: (message = 'Unauthorized') =>
    new AppError(ERROR_CODES.UNAUTHORIZED, message, HTTP_STATUS.UNAUTHORIZED),

  forbidden: (message = 'Forbidden') =>
    new AppError(ERROR_CODES.FORBIDDEN, message, HTTP_STATUS.FORBIDDEN),

  notFound: (resource = 'Resource') =>
    new AppError(ERROR_CODES.NOT_FOUND, `${resource} not found`, HTTP_STATUS.NOT_FOUND),

  conflict: (message: string) =>
    new AppError(ERROR_CODES.ALREADY_EXISTS, message, HTTP_STATUS.CONFLICT),

  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError(ERROR_CODES.VALIDATION_ERROR, message, HTTP_STATUS.UNPROCESSABLE_ENTITY, details),

  invalidCredentials: () =>
    new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password', HTTP_STATUS.UNAUTHORIZED),

  emailExists: () =>
    new AppError(ERROR_CODES.EMAIL_EXISTS, 'Email already registered', HTTP_STATUS.CONFLICT),

  notMember: () =>
    new AppError(ERROR_CODES.NOT_MEMBER, 'You are not a member of this workspace', HTTP_STATUS.FORBIDDEN),

  insufficientRole: (requiredRole: string) =>
    new AppError(
      ERROR_CODES.INSUFFICIENT_ROLE,
      `This action requires ${requiredRole} role or higher`,
      HTTP_STATUS.FORBIDDEN
    ),

  rateLimited: () =>
    new AppError(ERROR_CODES.RATE_LIMITED, 'Too many requests', HTTP_STATUS.TOO_MANY_REQUESTS),

  callInProgress: () =>
    new AppError(ERROR_CODES.CALL_IN_PROGRESS, 'A call is already in progress', HTTP_STATUS.CONFLICT),

  callNotFound: () =>
    new AppError(ERROR_CODES.CALL_NOT_FOUND, 'Call not found or has ended', HTTP_STATUS.NOT_FOUND),

  callFull: () =>
    new AppError(ERROR_CODES.CALL_FULL, 'Call has reached maximum participants', HTTP_STATUS.CONFLICT),

  internal: (message = 'Internal server error') =>
    new AppError(ERROR_CODES.INTERNAL_ERROR, message, HTTP_STATUS.INTERNAL_SERVER_ERROR),

  // General resource errors
  alreadyExists: (message: string) =>
    new AppError(ERROR_CODES.ALREADY_EXISTS, message, HTTP_STATUS.CONFLICT),

  invalidInput: (message: string) =>
    new AppError(ERROR_CODES.VALIDATION_ERROR, message, HTTP_STATUS.BAD_REQUEST),

  // Bot errors
  botDisabled: () =>
    new AppError(ERROR_CODES.BOT_DISABLED, 'Bot is disabled', HTTP_STATUS.FORBIDDEN),

  botTokenInvalid: () =>
    new AppError(ERROR_CODES.BOT_TOKEN_INVALID, 'Invalid bot token', HTTP_STATUS.UNAUTHORIZED),

  botTokenExpired: () =>
    new AppError(ERROR_CODES.BOT_TOKEN_EXPIRED, 'Bot token has expired', HTTP_STATUS.UNAUTHORIZED),

  botTokenRevoked: () =>
    new AppError(ERROR_CODES.BOT_TOKEN_REVOKED, 'Bot token has been revoked', HTTP_STATUS.UNAUTHORIZED),

  botInsufficientScope: (requiredScope: string) =>
    new AppError(
      ERROR_CODES.BOT_INSUFFICIENT_SCOPE,
      `This action requires the '${requiredScope}' scope`,
      HTTP_STATUS.FORBIDDEN
    ),

  webhookDisabled: () =>
    new AppError(ERROR_CODES.WEBHOOK_DISABLED, 'Webhook is disabled', HTTP_STATUS.FORBIDDEN),

  webhookInvalidToken: () =>
    new AppError(ERROR_CODES.WEBHOOK_INVALID_TOKEN, 'Invalid webhook token', HTTP_STATUS.UNAUTHORIZED),
};
