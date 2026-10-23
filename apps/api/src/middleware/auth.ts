import type { Role } from '@quiz/shared';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';

import { readSessionToken, toAuthUser, verifySession } from '../lib/auth';
import { ApiError } from '../lib/errors';
import type { AppEnv } from '../lib/types';

/**
 * Require a valid session.
 *
 * The JWT proves who signed in; the database row is the authority on whether
 * that user still exists and is active. Re-reading it on every protected
 * request is a single indexed lookup, and it makes deactivation immediate
 * instead of "whenever the token happens to expire".
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readSessionToken(c);

  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }

  const claims = await verifySession(token);

  if (!claims) {
    throw new ApiError(
      401,
      'INVALID_SESSION',
      'Your session is invalid or has expired. Sign in again.',
    );
  }

  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      status: schema.users.status,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, claims.sub))
    .limit(1);

  if (!row) {
    throw new ApiError(401, 'INVALID_SESSION', 'This account no longer exists.');
  }

  if (row.status !== 'ACTIVE') {
    throw new ApiError(
      403,
      'ACCOUNT_INACTIVE',
      'This account is inactive. Contact an administrator.',
    );
  }

  c.set('user', toAuthUser(row));
  c.set('claims', claims);

  await next();
});

/**
 * Require one of the given roles. Must be registered after `requireAuth`.
 *
 * Used from Day 3 onwards; kept here so every protected route composes the
 * same two guards instead of inventing its own check.
 */
export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');

    if (!user) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    }

    if (!roles.includes(user.role)) {
      throw new ApiError(403, 'FORBIDDEN', `This action requires ${roles.join(' or ')} access.`);
    }

    await next();
  });
}
