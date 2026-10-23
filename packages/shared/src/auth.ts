/**
 * Auth contracts shared by the Hono API and the Next.js client.
 *
 * Request schemas are the single source of truth for validation: the API
 * parses with them, the web forms render the same rules, and the RPC client
 * infers the payload types from `AppType`.
 */
import { z } from 'zod';

import { emailSchema, passwordSchema, roleSchema, userStatusSchema } from './index';

/* -------------------------------------------------------------------------- */
/*  Session constants                                                         */
/* -------------------------------------------------------------------------- */

/** httpOnly cookie that carries the signed JWT. */
export const SESSION_COOKIE = 'quiz_session';

/** Seven days, in seconds — used for both the JWT `exp` and the cookie `maxAge`. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/* -------------------------------------------------------------------------- */
/*  Requests                                                                  */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be at most 120 characters'),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Login accepts any non-empty password: the strength rules belong to
 * registration, and echoing them here would leak the policy on failure.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/* -------------------------------------------------------------------------- */
/*  Responses                                                                 */
/* -------------------------------------------------------------------------- */

/** A user as the API is allowed to expose it — never the password hash. */
export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  status: userStatusSchema,
  createdAt: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionSchema = z.object({
  user: authUserSchema,
  /** ISO timestamp of the JWT expiry, so the UI can show/refresh proactively. */
  expiresAt: z.string(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const logoutResponseSchema = z.object({ success: z.literal(true) });
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
