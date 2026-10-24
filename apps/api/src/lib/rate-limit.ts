import type { Context } from 'hono';

import { env } from './env';
import { ApiError } from './errors';

/**
 * A small, dependency-free fixed-window rate limiter.
 *
 * Why in-process rather than a shared store: this app runs as a single Node
 * process, so a `Map` is the whole state. The trade-off is spelled out in
 * `docs/security.md` — behind more than one instance each replica counts on its
 * own, which weakens (but does not remove) the limit. Moving to Redis later means
 * replacing the three functions below and nothing else.
 *
 * Two rules shape the API:
 *
 * 1. **Reading and writing are separate.** A login attempt is checked *before*
 *    the password is verified and only *recorded* when it fails, so a person who
 *    signs in successfully is never throttled by their own earlier typos, and a
 *    correct password cannot be locked out by spraying.
 * 2. **The clock is a parameter.** Every function takes `now`, so the tests can
 *    step across a window boundary without sleeping.
 */

export interface RateRule {
  /** Requests allowed inside one window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateStatus {
  /** True once the window has had `max` recorded hits. */
  limited: boolean;
  /** Hits left before the next one is refused. */
  remaining: number;
  /** Whole seconds until the window resets — sent as `Retry-After`. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Upper bound on tracked keys. Without it, an attacker rotating addresses would
 * grow the map for as long as the process lives; the oldest expired buckets are
 * dropped first, so a flood can only ever cost memory proportional to the limit.
 */
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, Bucket>();

/** Default rules. The auth ones are configurable; the rest are fixed policy. */
export const RATE_RULES = {
  /** Password attempts from one address. */
  login: { max: env.AUTH_RATE_LIMIT_MAX, windowMs: env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000 },
  /** Failed attempts against one account, from anywhere. Slower and longer. */
  loginAccount: {
    max: Math.max(3, Math.ceil(env.AUTH_RATE_LIMIT_MAX / 2)),
    windowMs: 15 * 60_000,
  },
  /** New accounts from one address. */
  register: { max: env.REGISTER_RATE_LIMIT_MAX, windowMs: 60 * 60_000 },
  /**
   * Password-reset requests, per address *and* address target.
   *
   * Tight on purpose: this endpoint sends mail, so an unlimited version is a way
   * to use the platform to spam a stranger's inbox.
   */
  forgot: { max: 5, windowMs: 15 * 60_000 },
} satisfies Record<string, RateRule>;

/**
 * Test hook for the policy itself: replace individual rules at runtime.
 *
 * The shipping limits are constants; a suite that needs a small window (to prove
 * the wiring rather than the arithmetic) shrinks one rule here and restores it
 * afterwards. Nothing in the application calls this.
 */
let overrides: Partial<Record<keyof typeof RATE_RULES, RateRule>> = {};

export function configureRateLimits(next: Partial<Record<keyof typeof RATE_RULES, RateRule>>) {
  overrides = next;
}

/** The rule in force for a named guard (override, else policy). */
export function ruleFor(kind: keyof typeof RATE_RULES): RateRule {
  return overrides[kind] ?? RATE_RULES[kind];
}

const OPEN: RateStatus = { limited: false, remaining: 0, retryAfterSeconds: 0 };

function retryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

function liveBucket(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key);

  if (!bucket) return undefined;

  if (bucket.resetAt <= now) {
    buckets.delete(key);
    return undefined;
  }

  return bucket;
}

/** Drop expired buckets, oldest expiry first, when the map grows too large. */
function prune(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Still too large (a flood inside one window): shed the oldest entries.
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next();

    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

/** Look, without counting. Used to refuse before doing expensive work. */
export function checkRateLimit(key: string, rule: RateRule, now = Date.now()): RateStatus {
  if (rule.max <= 0) return OPEN;

  const bucket = liveBucket(key, now);
  const count = bucket?.count ?? 0;
  const resetAt = bucket?.resetAt ?? now + rule.windowMs;

  return {
    limited: count >= rule.max,
    remaining: Math.max(0, rule.max - count),
    retryAfterSeconds: retryAfterSeconds(resetAt, now),
  };
}

/** Record one attempt (a failed sign-in, a sign-up, …). */
export function hitRateLimit(key: string, rule: RateRule, now = Date.now()): RateStatus {
  if (rule.max <= 0) return OPEN;

  const existing = liveBucket(key, now);
  const bucket: Bucket = existing ?? { count: 0, resetAt: now + rule.windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);
  prune(now);

  return {
    limited: bucket.count >= rule.max,
    remaining: Math.max(0, rule.max - bucket.count),
    retryAfterSeconds: retryAfterSeconds(bucket.resetAt, now),
  };
}

/** Forget a key — a successful sign-in clears that account's failure count. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Test hook: drop every bucket and restore the shipped policy. */
export function resetRateLimits(): void {
  buckets.clear();
  overrides = {};
}

/**
 * The caller's address, for keying.
 *
 * `X-Forwarded-For` is only trustworthy when a proxy you control sets it; here
 * the app is documented to run behind one (or directly exposed, in which case the
 * header is ignored by every serious deployment recipe). The left-most entry is
 * the client. Tests pin it explicitly to exercise the limiter deterministically.
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return c.req.header('x-real-ip')?.trim() || 'unknown';
}

/**
 * Refuse with `429` (and `Retry-After`) when the bucket is full.
 *
 * The message deliberately says nothing about which account exists.
 */
export function enforceRateLimit(c: Context, key: string, rule: RateRule, now = Date.now()): void {
  const status = checkRateLimit(key, rule, now);

  if (!status.limited) return;

  c.header('Retry-After', String(status.retryAfterSeconds));

  throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Wait a moment and try again.', {
    retryAfterSeconds: status.retryAfterSeconds,
  });
}
