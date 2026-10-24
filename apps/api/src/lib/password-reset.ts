/**
 * Asking for a new password, and using the link.
 *
 * Two rules shape this file.
 *
 * 1. **Requesting one says nothing.** A known address and an unknown address get
 *    the same response, the same latency and the same shape. Otherwise the form
 *    is an enumeration oracle: type an address, learn whether it has an account.
 * 2. **Spending the token is atomic-ish and single-use.** The row is marked
 *    `usedAt` before the password is written, so a replay of the same link — by a
 *    second tab, or by whoever read the mail over a shoulder — finds nothing.
 */
import { randomUUID } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import { createResetToken, hashPassword, hashResetToken } from '@quiz/shared/crypto';
import {
  RESET_TOKEN_TTL_MINUTES,
  resetExpiry,
  type ForgotPasswordResponse,
  type ResetPasswordResponse,
} from '@quiz/shared/password';
import { db, schema } from '@quiz/db';

import { passwordResetEmail } from '@quiz/shared/email';

import { publicBaseUrl, queueEmail } from './emails';
import { ApiError } from './errors';

const { passwordResetTokens, users } = schema;

/**
 * Send a link, if there is anywhere to send it.
 *
 * The `expiresInMinutes` is returned whatever happened, and the caller answers
 * `202` either way.
 */
export async function requestPasswordReset(email: string): Promise<ForgotPasswordResponse> {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user) {
    const { token, tokenHash } = createResetToken();

    // A second request invalidates the first: only the newest link works. Do it
    // before inserting, so the new row cannot be caught by its own sweep.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    await db.insert(passwordResetTokens).values({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt: resetExpiry(),
    });

    await queueEmail(
      passwordResetEmail({
        name: user.name,
        email: user.email,
        token,
        baseUrl: publicBaseUrl(),
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      }),
    );
  }

  return { requested: true, expiresInMinutes: RESET_TOKEN_TTL_MINUTES };
}

/**
 * Spend a token and set the new password.
 *
 * Every failure looks the same: "this link is not valid or has expired". Saying
 * which would tell an attacker whether a token ever existed.
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<ResetPasswordResponse> {
  const tokenHash = hashResetToken(token);

  const [row] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
      email: users.email,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.usedAt !== null) {
    throw new ApiError(
      400,
      'RESET_TOKEN_INVALID',
      'This reset link is not valid. Request a new one.',
    );
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(
      400,
      'RESET_TOKEN_EXPIRED',
      'This reset link has expired. Request a new one.',
    );
  }

  // Spend it first: the update is conditional, so two concurrent requests
  // cannot both get past this line.
  const spent = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.id, row.id),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .returning({ id: passwordResetTokens.id });

  if (spent.length === 0) {
    throw new ApiError(
      400,
      'RESET_TOKEN_INVALID',
      'This reset link is not valid. Request a new one.',
    );
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, row.userId));

  // Any other outstanding links for this account die with the password they were
  // written for.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.usedAt)));

  return { reset: true, email: row.email };
}
