import * as jose from 'jose';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthUser } from '@teamchat/shared';

// Security: Require JWT_SECRET in production
const jwtSecretString = process.env.JWT_SECRET;
if (!jwtSecretString && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
if (jwtSecretString && jwtSecretString.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}
const JWT_SECRET = new TextEncoder().encode(jwtSecretString || 'dev-secret-change-me-not-for-production');
const JWT_ISSUER = 'teamchat';
const JWT_AUDIENCE = 'teamchat-app';
const TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY = '30d';

export interface JwtPayload {
  sub: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  iat?: number;
  exp?: number;
}

/**
 * Sign a new JWT token for authenticated user
 * Includes all necessary claims for stateless authentication
 */
export async function signToken(user: AuthUser): Promise<string> {
  const token = await new jose.SignJWT({
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(TOKEN_EXPIRY)
    .setJti(crypto.randomUUID()) // Unique token ID for potential revocation
    .sign(JWT_SECRET);

  return token;
}

/**
 * Sign a refresh token with longer expiry
 */
export async function signRefreshToken(userId: string): Promise<string> {
  const token = await new jose.SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .setJti(crypto.randomUUID())
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify and decode a JWT token
 * Returns null if token is invalid, expired, or tampered with
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      displayName: payload.displayName as string,
      avatarUrl: payload.avatarUrl as string | null | undefined,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Extract token from request (header or cookie)
 * Prioritizes Authorization header for API clients
 */
export function getTokenFromRequest(request: FastifyRequest): string | null {
  // Check Authorization header first (preferred for API clients)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    // Security: Basic token format validation
    if (token.length > 0 && token.split('.').length === 3) {
      return token;
    }
  }

  // Check cookie (for browser clients)
  const cookieToken = request.cookies?.token;
  if (cookieToken && cookieToken.split('.').length === 3) {
    return cookieToken;
  }

  return null;
}

/**
 * Set secure token cookie for browser authentication
 */
export function setTokenCookie(reply: FastifyReply, token: string): void {
  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Clear authentication cookie on logout
 */
export function clearTokenCookie(reply: FastifyReply): void {
  reply.clearCookie('token', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}
