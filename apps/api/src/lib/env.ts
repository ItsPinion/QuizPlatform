import path from 'node:path';

import { z } from 'zod';

import { loadEnvFiles } from '@quiz/db/load-env';
import { REPO_ROOT } from '@quiz/db/env';
import {
  demoAccountsEnabled,
  developmentFeaturesEnabled,
  readRuntimeMode,
  RUNTIME_MODE_NAMES,
} from '@quiz/shared/environment';

loadEnvFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * What this deployment is *allowed to show*.
   *
   * Deliberately separate from `NODE_ENV`: `NODE_ENV=production` decides Secure
   * cookies and how Next.js builds, while `ENV_NODE` decides whether demo
   * logins, build-plan badges and preview hosts exist at all. Left unset it is
   * production — the switch fails closed. See `docs/runtime-modes.md`.
   */
  ENV_NODE: z.string().optional(),
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
  /** `0` hides the seeded demo logins even in development. Never enables them in production. */
  DEMO_ACCOUNTS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('✖ Invalid environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

/**
 * The mode, read from the raw environment.
 *
 * `process.env`, not the parsed object: the schema gives `NODE_ENV` a default of
 * `development` for its own convenience, and feeding that default back in would
 * quietly turn every unconfigured deployment into a development one. Reading the
 * raw values is what makes "absent means production" true.
 */
const runtimeReading = readRuntimeMode({
  ENV_NODE: process.env.ENV_NODE,
  NODE_ENV: process.env.NODE_ENV,
});

export const runtimeMode = runtimeReading.mode;

if (runtimeReading.unrecognized) {
  console.warn(
    `⚠ ENV_NODE="${runtimeReading.unrecognized}" is not understood (expected ${RUNTIME_MODE_NAMES}). ` +
      'Running as production, so demo features stay off.',
  );
}

/** Are the development affordances — demo logins, build badges, preview hosts — on? */
export const developmentFeatures = developmentFeaturesEnabled(runtimeMode);

/** The seeded demo logins are advertised only in a development or demo environment. */
export const demoAccounts = demoAccountsEnabled(runtimeMode, env.DEMO_ACCOUNTS);

export const APP_VERSION = '0.1.0';
export const REPO_ROOT_DIR = REPO_ROOT;

/**
 * Origins allowed to call the API directly from a browser.
 *
 * The localhost aliases are a development convenience; in production the only
 * trusted origin is the one this deployment was configured with.
 */
export const allowedOrigins = (
  developmentFeatures
    ? [env.WEB_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:3000']
    : [env.WEB_ORIGIN]
).filter((origin, index, list) => list.indexOf(origin) === index);

/**
 * Preview hosts the app is expected to run under.
 *
 * The repository is developed inside a sandbox that serves each port on
 * `https://<port>-<id>.e2b.app`, so the browser's `Origin` is that host even
 * though the app's own configuration only knows `localhost`. Allowing the
 * platform's own subdomains keeps the origin checks (CORS and the CSRF guard)
 * usable there without opening them to arbitrary sites — and only while
 * development features are on, so a production deployment never trusts them.
 */
const PREVIEW_HOST_PATTERNS = [/(^|\.)e2b\.app$/i, /(^|\.)e2b\.dev$/i, /(^|\.)arena\.ai$/i];

/** Does this hostname belong to the sandbox that serves previews? */
export function isPreviewHost(hostname: string): boolean {
  return PREVIEW_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * The origin policy, as a pure function.
 *
 * Kept separate from the module-level mode so both environments can be tested
 * in the same process: a preview host is a development convenience, and a
 * production deployment must refuse it even though the same code serves both.
 */
export function originAllowed(
  origin: string | undefined,
  policy: { allowedOrigins: readonly string[]; allowPreviewHosts: boolean },
): boolean {
  if (!origin || origin === 'null') return false;
  if (policy.allowedOrigins.includes(origin)) return true;
  if (!policy.allowPreviewHosts) return false;

  try {
    const { hostname, protocol } = new URL(origin);

    if (protocol !== 'https:' && protocol !== 'http:') return false;

    return isPreviewHost(hostname);
  } catch {
    return false;
  }
}

/**
 * Is this `Origin` allowed to call the API from a browser?
 *
 * Exact matches come from configuration; preview hosts match by suffix, and only
 * while development features are on. Anything else — including the opaque `null`
 * origin a sandboxed iframe sends — is not.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  return originAllowed(origin, { allowedOrigins, allowPreviewHosts: developmentFeatures });
}
