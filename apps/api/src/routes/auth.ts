import { randomUUID } from 'node:crypto';

import {
  loginSchema,
  registerSchema,
  type AuthSession,
  type LogoutResponse,
} from '@quiz/shared/auth';
import { hashPassword, verifyPassword } from '@quiz/shared/crypto';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import {
  clearSessionCookie,
  createSession,
  setSessionCookie,
  toAuthSession,
  toAuthUser,
} from '../lib/auth';
import { ApiError, jsonBody } from '../lib/errors';
import type { AppEnv } from '../lib/types';
import { requireAuth } from '../middleware/auth';

/**
 * A throwaway hash used when the email is unknown.
 *
 * Without it, "unknown email" would answer noticeably faster than "wrong
 * password" and quietly turn the login form into a user-enumeration oracle.
 */
let decoyHash: Promise<string> | undefined;

function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(randomUUID());
  return decoyHash;
}

/** True when the driver reports the unique-email index rejecting a write. */
function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint failed|sqlite_constraint_unique/i.test(message);
}

export const authRoutes = new Hono<AppEnv>()
  /** Student self-registration. The role is always STUDENT — never client-chosen. */
  .post('/register', jsonBody(registerSchema), async (c) => {
    const input = c.req.valid('json');

    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, input.email))
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    }

    const passwordHash = await hashPassword(input.password);
    let row: typeof schema.users.$inferSelect;

    try {
      const inserted = await db
        .insert(schema.users)
        .values({
          id: randomUUID(),
          name: input.name,
          email: input.email,
          passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
        })
        .returning();

      row = inserted[0]!;
    } catch (error) {
      // A concurrent registration can slip past the check above; the unique
      // index is the real guard, so translate its rejection too.
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      }
      throw error;
    }

    const user = toAuthUser(row);
    const { token, expiresAt } = await createSession(user);
    setSessionCookie(c, token);

    return c.json<AuthSession>(toAuthSession(user, expiresAt), 201);
  })

  /** Exchange email + password for a session cookie. */
  .post('/login', jsonBody(loginSchema), async (c) => {
    const input = c.req.valid('json');

    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, input.email))
      .limit(1);

    if (!row) {
      await verifyPassword(input.password, await getDecoyHash());
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    const valid = await verifyPassword(input.password, row.passwordHash);

    if (!valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    if (row.status !== 'ACTIVE') {
      throw new ApiError(
        403,
        'ACCOUNT_INACTIVE',
        'This account is inactive. Contact an administrator.',
      );
    }

    const user = toAuthUser(row);
    const { token, expiresAt } = await createSession(user);
    setSessionCookie(c, token);

    return c.json<AuthSession>(toAuthSession(user, expiresAt), 200);
  })

  /** Clear the cookie. Idempotent: signing out twice is not an error. */
  .post('/logout', (c) => {
    clearSessionCookie(c);
    return c.json<LogoutResponse>({ success: true }, 200);
  })

  /** Who am I? Used by the web app to render session-aware UI. */
  .get('/me', requireAuth, (c) => {
    const user = c.get('user');
    const claims = c.get('claims');

    return c.json<AuthSession>(toAuthSession(user, new Date(claims.exp * 1000).toISOString()), 200);
  });
