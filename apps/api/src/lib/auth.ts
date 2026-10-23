/**
 * Session plumbing: sign a JWT into an httpOnly cookie, read it back, clear it.
 *
 * Design notes
 * - The token is signed with HS256 via Hono's built-in WebCrypto JWT helpers,
 *   so there is no extra dependency and it works on every runtime we deploy to.
 * - The cookie is httpOnly + SameSite=Lax: JavaScript can never read the token,
 *   and cross-site POSTs cannot replay it.
 * - A `Authorization: Bearer <jwt>` header is also accepted, which keeps the
 *   API usable from curl / tests / future mobile clients without weakening the
 *   browser path.
 */
import type { AuthUser, AuthSession } from '@quiz/shared/auth';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '@quiz/shared/auth';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { JWTPayload } from 'hono/utils/jwt/types';

import { env } from './env';

/** Claims carried by the session JWT. */
export type SessionClaims = JWTPayload & {
  /** User id. */
  sub: string;
  email: string;
  role: AuthUser['role'];
  /** Issued at / expiry, seconds since epoch (JWT standard claims). */
  iat: number;
  exp: number;
};

/**
 * Development fallback secret.
 *
 * A real secret is required in production (see `resolveJwtSecret`). Locally the
 * app must still run straight after `bun install`, so we sign with a constant
 * that is obviously unsafe — the warning makes it impossible to miss.
 */
const DEV_SECRET = 'dev-only-insecure-secret-change-me-quizplatform';
const MIN_SECRET_LENGTH = 32;

let warnedAboutDevSecret = false;

/** Resolve the signing secret, preferring configuration over the fallback. */
export function resolveJwtSecret(): string {
  const configured = env.JWT_SECRET?.trim();

  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production. ` +
        'Generate one with: openssl rand -base64 48',
    );
  }

  if (configured && configured.length > 0) {
    console.warn(
      `[auth] JWT_SECRET is shorter than ${MIN_SECRET_LENGTH} characters — using the insecure ` +
        'development secret instead. Set a longer JWT_SECRET in .env.',
    );
  } else if (!warnedAboutDevSecret && env.NODE_ENV !== 'test') {
    warnedAboutDevSecret = true;
    console.warn(
      '[auth] JWT_SECRET is not set — signing sessions with the insecure development secret. ' +
        'Generate one with: openssl rand -base64 48',
    );
  }

  return DEV_SECRET;
}

/** Seconds since epoch, for `iat` / `exp`. */
function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sign a freshly-issued session for this user. */
export async function createSession(
  user: Pick<AuthUser, 'id' | 'email' | 'role'>,
): Promise<{ token: string; expiresAt: string }> {
  const issuedAt = nowInSeconds();
  const expiresAtSeconds = issuedAt + SESSION_TTL_SECONDS;

  const claims: SessionClaims = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: issuedAt,
    exp: expiresAtSeconds,
  };

  const token = await sign(claims, resolveJwtSecret(), 'HS256');

  return { token, expiresAt: new Date(expiresAtSeconds * 1000).toISOString() };
}

/**
 * Verify a token's signature, algorithm and expiry.
 *
 * Returns `undefined` for anything untrustworthy — an expired, tampered or
 * foreign token is indistinguishable from "no session" on purpose.
 */
export async function verifySession(token: string): Promise<SessionClaims | undefined> {
  try {
    const payload = await verify(token, resolveJwtSecret(), 'HS256');

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.exp !== 'number' ||
      (payload.role !== 'ADMIN' && payload.role !== 'STUDENT')
    ) {
      return undefined;
    }

    return payload as unknown as SessionClaims;
  } catch {
    return undefined;
  }
}

/** Read the raw token: httpOnly cookie first, then a Bearer header. */
export function readSessionToken(c: Context): string | undefined {
  const cookie = getCookie(c, SESSION_COOKIE);
  if (cookie) return cookie;

  const header = c.req.header('authorization');
  if (!header) return undefined;

  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}

export function setSessionCookie(
  c: Context,
  token: string,
  options: { secure?: boolean } = {},
): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    // `Secure` in production; overridable so tests can pin both branches.
    secure: options.secure ?? env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context): void {
  // Path must match the one used when setting it, otherwise the browser keeps
  // sending the old value.
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Project a database row into the shape the API exposes. */
export function toAuthUser(row: {
  id: string;
  name: string;
  email: string;
  role: AuthUser['role'];
  status: AuthUser['status'];
  createdAt: Date;
}): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Convenience wrapper for the `{ user, expiresAt }` body of auth responses. */
export function toAuthSession(user: AuthUser, expiresAt: string): AuthSession {
  return { user, expiresAt };
}
