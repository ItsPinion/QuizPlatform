/**
 * Password recovery.
 *
 * Two endpoints, one idea: the person who owns the mailbox can set a new
 * password. Nothing here reveals whether an address is registered — a caller
 * gets the same `202` either way, and the token only ever exists in the mail.
 *
 * The token is 32 random bytes, base64url. Only its SHA-256 is stored: a dump
 * of `password_reset_tokens` is not a set of working reset links. It is
 * single-use and expires in an hour.
 */
import { z } from 'zod';

import { emailSchema, passwordSchema } from './index';

export const RESET_TOKEN_TTL_MINUTES = 60;
export const RESET_TOKEN_BYTES = 32;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * `token` is the URL-safe string from the link; `password` is validated by the
 * same rule as registration, so a reset cannot set something registration would
 * have refused.
 */
export const resetPasswordSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, 'This reset link is not valid')
    .max(200, 'This reset link is not valid'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * What the browser is told when a reset was asked for.
 *
 * Deliberately identical for a known and an unknown address. `expiresInMinutes`
 * is the same constant either way, so even the shape of the response carries no
 * signal about who has an account.
 */
export const forgotPasswordResponseSchema = z.object({
  requested: z.literal(true),
  expiresInMinutes: z.number(),
});
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

export const resetPasswordResponseSchema = z.object({
  reset: z.literal(true),
  email: z.string(),
});
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;

/**
 * Changing a password from inside the account, rather than from a link.
 *
 * The current password is required even though the caller already holds a
 * session: a borrowed laptop is a session, and re-authenticating is what stops
 * anyone walking past one from locking the owner out of their own account.
 *
 * `newPassword` is the registration rule, then refined twice more:
 *   - it cannot be the password being replaced (a change that changes nothing);
 *   - it cannot be *derived* from the old one by case alone, which is the most
 *     common way a "new" password is weaker than it looks.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one',
  })
  .refine((value) => value.newPassword.toLowerCase() !== value.currentPassword.toLowerCase(), {
    path: ['newPassword'],
    message: 'Changing only the capitalisation is not a new password',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const changePasswordResponseSchema = z.object({
  changed: z.literal(true),
  /** How many unused reset links were invalidated by the change. */
  revokedLinks: z.number(),
});
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;

/**
 * Minting and hashing live in `@quiz/shared/crypto` (Node-only), so this module
 * stays safe to import from a browser bundle.
 */

/** Expiry for a token minted now. */
export function resetExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000);
}

/** Is this stored token still usable at `now`? */
export function isResetTokenUsable(
  row: { expiresAt: string | number | Date; usedAt?: string | number | Date | null },
  now: number = Date.now(),
): boolean {
  if (row.usedAt != null) return false;
  const expiry =
    row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > now;
}
