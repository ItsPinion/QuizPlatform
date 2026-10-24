import path from 'node:path';

import { z } from 'zod';

import { loadEnvFiles } from '@quiz/db/load-env';
import { REPO_ROOT } from '@quiz/db/env';

loadEnvFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  TURSO_DATABASE_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  // Brute-force guards (Day 13). Defaults are the shipping policy; `0` disables a
  // limiter, which is only ever useful in a local experiment.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(300),
  REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(10),
  // Mail. The outbox is always written; these decide whether a message also
  // *leaves* the process, and through what. No SMTP client is bundled: an HTTP
  // provider (Resend, a relay, an internal webhook) is one `fetch` and works the
  // same in every runtime this project targets.
  MAIL_TRANSPORT: z.enum(['log', 'webhook', 'resend']).default('log'),
  /** Generic relay: receives `{ to, from, subject, text }` as JSON. */
  MAIL_WEBHOOK_URL: z.string().url().optional(),
  /** Resend API key; also switches the transport to `resend` when set. */
  RESEND_API_KEY: z.string().optional(),
  /** The From: line. Required by a real provider, ignored by the log. */
  MAIL_FROM: z.string().default('QuizPlatform <no-reply@quiz.local>'),
  /** Largest accepted request body, in bytes. */
  MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(64 * 1024),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('✖ Invalid environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

export const APP_VERSION = '0.1.0';
export const REPO_ROOT_DIR = REPO_ROOT;

/** Origins allowed to call the API directly from a browser. */
export const allowedOrigins = [
  env.WEB_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter((origin, index, list) => list.indexOf(origin) === index);

/**
 * Preview hosts the app is expected to run under.
 *
 * The repository is developed inside a sandbox that serves each port on
 * `https://<port>-<id>.e2b.app`, so the browser's `Origin` is that host even
 * though the app's own configuration only knows `localhost`. Allowing the
 * platform's own subdomains keeps the origin checks (CORS and the CSRF guard)
 * usable there without opening them to arbitrary sites.
 */
const PREVIEW_HOST_PATTERNS = [/\.e2b\.app$/i, /\.e2b\.dev$/i, /\.arena\.ai$/i];

/**
 * Is this `Origin` allowed to call the API from a browser?
 *
 * Exact matches come from configuration; preview hosts match by suffix. Anything
 * else — including the opaque `null` origin a sandboxed iframe sends — is not.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === 'null') return false;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);

    if (protocol !== 'https:' && protocol !== 'http:') return false;

    return PREVIEW_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}
