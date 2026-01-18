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

export interface JwtPayload {
  sub: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

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
    .sign(JWT_SECRET);

  return token;
}

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
    };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: FastifyRequest): string | null {
  // Check Authorization header first
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check cookie
  const cookieToken = request.cookies?.token;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export function setTokenCookie(reply: FastifyReply, token: string): void {
  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export function clearTokenCookie(reply: FastifyReply): void {
  reply.clearCookie('token', {
    path: '/',
  });
}
