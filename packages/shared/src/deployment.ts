import { z } from 'zod';

/**
 * Deployment readiness (Day 14).
 *
 * One pure function decides whether a set of environment variables is fit to
 * serve traffic, so three callers agree on the answer:
 *
 * - `GET /api/admin/system` — the live server checking itself;
 * - `bun run deploy:check` — the same checks from a shell, before a deploy;
 * - the test suite — every rule, without a process to boot.
 *
 * Nothing here reads `process.env` or touches the network. The caller passes a
 * snapshot, which is also what keeps secrets out: only *facts about* a value
 * (present, length) are ever reported, never the value itself.
 */

export const CHECK_STATUSES = ['pass', 'warn', 'fail', 'skip'] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const deploymentCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(CHECK_STATUSES),
  /** What was found, in one clause. Safe to show in a UI or a log. */
  detail: z.string(),
  /** What to do about it, when the status is not `pass`. */
  hint: z.string().nullable(),
});

export type DeploymentCheck = z.infer<typeof deploymentCheckSchema>;

/** Verdict for a whole run. `blocked` means: do not serve traffic like this. */
export const DEPLOYMENT_VERDICTS = ['ready', 'attention', 'blocked'] as const;
export type DeploymentVerdict = (typeof DEPLOYMENT_VERDICTS)[number];

export const deploymentSummarySchema = z.object({
  verdict: z.enum(DEPLOYMENT_VERDICTS),
  pass: z.number(),
  warn: z.number(),
  fail: z.number(),
  skip: z.number(),
  checks: z.array(deploymentCheckSchema),
});

export type DeploymentSummary = z.infer<typeof deploymentSummarySchema>;

/**
 * The values a check may look at.
 *
 * Deliberately a plain object rather than `process.env`: a test can describe a
 * production deployment in three lines, and the API can hand over exactly what
 * it is willing to expose.
 */
export interface EnvironmentSnapshot {
  nodeEnv: string;
  databaseUrl?: string | null;
  databaseToken?: string | null;
  jwtSecret?: string | null;
  webOrigin?: string | null;
  apiInternalUrl?: string | null;
  authRateLimitMax?: number;
  maxBodyBytes?: number;
}

/** Minimum length of `JWT_SECRET`; below this the HS256 key is guessable. */
export const MIN_JWT_SECRET_LENGTH = 32;

/** Accepted request-body ceiling, used by the check's sanity bounds. */
export const BODY_LIMIT_BOUNDS = { min: 1024, max: 5 * 1024 * 1024 } as const;

function isRemoteDatabase(url: string): boolean {
  return /^(libsql|https?|wss?):\/\//i.test(url);
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const check = (
  id: string,
  label: string,
  status: CheckStatus,
  detail: string,
  hint: string | null = null,
): DeploymentCheck => ({ id, label, status, detail, hint });

/**
 * Run every rule.
 *
 * Order is stable and meaningful: the two settings the app cannot start without
 * come first, then the ones that make it safe to expose, then tuning.
 */
export function evaluateEnvironment(snapshot: EnvironmentSnapshot): DeploymentCheck[] {
  const isProduction = snapshot.nodeEnv === 'production';
  const databaseUrl = snapshot.databaseUrl?.trim() ?? '';
  const checks: DeploymentCheck[] = [];

  /* ------------------------------ database ------------------------------ */

  if (!databaseUrl) {
    checks.push(
      check(
        'database-url',
        'Database URL',
        'fail',
        'TURSO_DATABASE_URL is not set.',
        'Copy .env.example to .env and set the libsql:// URL of your Turso database.',
      ),
    );
  } else if (/^file:/i.test(databaseUrl)) {
    checks.push(
      isProduction
        ? check(
            'database-url',
            'Database URL',
            'fail',
            'A local file: database is configured in production.',
            'Production must point at Turso Cloud: libsql://<db>-<org>.turso.io.',
          )
        : check(
            'database-url',
            'Database URL',
            'warn',
            'Using a local file: database — fine for development, not for deployment.',
            'Set TURSO_DATABASE_URL to a libsql:// URL before serving real users.',
          ),
    );
  } else if (!isRemoteDatabase(databaseUrl)) {
    checks.push(
      check(
        'database-url',
        'Database URL',
        'fail',
        'The database URL is not a libsql://, https:// or file: URL.',
        'Read the URL with: turso db show <db> --url',
      ),
    );
  } else {
    checks.push(check('database-url', 'Database URL', 'pass', 'Turso Cloud URL configured.', null));
  }

  const remote = isRemoteDatabase(databaseUrl);

  if (!remote) {
    checks.push(
      check(
        'database-token',
        'Database token',
        'skip',
        'Not needed for a local file: database.',
        null,
      ),
    );
  } else if (!snapshot.databaseToken?.trim()) {
    checks.push(
      check(
        'database-token',
        'Database token',
        'fail',
        'TURSO_AUTH_TOKEN is empty — Turso Cloud will reject every query.',
        'Mint one with: turso db tokens create <db>',
      ),
    );
  } else {
    checks.push(check('database-token', 'Database token', 'pass', 'Auth token is present.', null));
  }

  /* ------------------------------- session ------------------------------ */

  const secret = snapshot.jwtSecret?.trim() ?? '';

  if (!secret) {
    checks.push(
      isProduction
        ? check(
            'jwt-secret',
            'Session secret',
            'fail',
            'JWT_SECRET is not set. The API refuses to start in production without it.',
            'Generate one with: openssl rand -base64 48',
          )
        : check(
            'jwt-secret',
            'Session secret',
            'warn',
            'JWT_SECRET is not set — signing with the insecure development secret.',
            'Generate one with: openssl rand -base64 48',
          ),
    );
  } else if (secret.length < MIN_JWT_SECRET_LENGTH) {
    checks.push(
      check(
        'jwt-secret',
        'Session secret',
        isProduction ? 'fail' : 'warn',
        `JWT_SECRET is ${secret.length} characters; at least ${MIN_JWT_SECRET_LENGTH} are required.`,
        'Generate one with: openssl rand -base64 48',
      ),
    );
  } else {
    checks.push(
      check(
        'jwt-secret',
        'Session secret',
        'pass',
        `A ${secret.length}-character secret is configured.`,
        null,
      ),
    );
  }

  /* ------------------------------- origins ------------------------------ */

  const webOrigin = snapshot.webOrigin?.trim() ?? '';

  if (!webOrigin) {
    checks.push(
      check(
        'web-origin',
        'Web origin',
        'warn',
        'WEB_ORIGIN is not set, so only the localhost defaults are trusted.',
        'Set WEB_ORIGIN to the public URL of the web app.',
      ),
    );
  } else if (!isHttpUrl(webOrigin)) {
    checks.push(
      check(
        'web-origin',
        'Web origin',
        'fail',
        'WEB_ORIGIN is not a valid http(s) URL.',
        'Use the full origin, e.g. https://quiz.example.com — no path.',
      ),
    );
  } else if (isProduction && !webOrigin.startsWith('https://')) {
    checks.push(
      check(
        'web-origin',
        'Web origin',
        'warn',
        'WEB_ORIGIN is plain http in production; the session cookie is only marked Secure there.',
        'Serve the app over HTTPS and set WEB_ORIGIN to the https URL.',
      ),
    );
  } else {
    checks.push(check('web-origin', 'Web origin', 'pass', `${webOrigin} is trusted.`, null));
  }

  const apiInternalUrl = snapshot.apiInternalUrl?.trim() ?? '';

  if (!apiInternalUrl) {
    checks.push(
      check(
        'api-internal-url',
        'API proxy target',
        'warn',
        'API_INTERNAL_URL is not set; the web app will proxy to http://localhost:3001.',
        'Point it at the API’s private address, e.g. http://quiz-api:3001.',
      ),
    );
  } else if (!isHttpUrl(apiInternalUrl)) {
    checks.push(
      check(
        'api-internal-url',
        'API proxy target',
        'fail',
        'API_INTERNAL_URL is not a valid http(s) URL.',
        'Use the internal address the web server can reach, not the public one.',
      ),
    );
  } else {
    checks.push(
      check(
        'api-internal-url',
        'API proxy target',
        'pass',
        `The web app proxies /api/* to ${apiInternalUrl}.`,
        null,
      ),
    );
  }

  /* -------------------------------- mode -------------------------------- */

  if (snapshot.nodeEnv === 'production') {
    checks.push(
      check(
        'node-env',
        'Runtime mode',
        'pass',
        'NODE_ENV=production: pretty JSON off, Secure cookies on.',
        null,
      ),
    );
  } else {
    checks.push(
      check(
        'node-env',
        'Runtime mode',
        snapshot.nodeEnv === 'test' ? 'skip' : 'warn',
        `NODE_ENV=${snapshot.nodeEnv} — development behaviour (pretty JSON, non-Secure cookies).`,
        'Set NODE_ENV=production on the deployed service.',
      ),
    );
  }

  /* ------------------------------- tuning ------------------------------- */

  const rateLimitMax = snapshot.authRateLimitMax;

  if (rateLimitMax === undefined) {
    checks.push(
      check('rate-limit', 'Sign-in rate limit', 'skip', 'Not reported by this surface.', null),
    );
  } else if (rateLimitMax <= 0) {
    checks.push(
      check(
        'rate-limit',
        'Sign-in rate limit',
        'warn',
        'The sign-in rate limit is disabled (0).',
        'Leave AUTH_RATE_LIMIT_MAX unset to use the default of 10 per 5 minutes.',
      ),
    );
  } else {
    checks.push(
      check(
        'rate-limit',
        'Sign-in rate limit',
        'pass',
        `${rateLimitMax} failed sign-ins per address per window are allowed.`,
        null,
      ),
    );
  }

  const bodyLimit = snapshot.maxBodyBytes;

  if (bodyLimit === undefined) {
    checks.push(
      check('body-limit', 'Request body cap', 'skip', 'Not reported by this surface.', null),
    );
  } else if (bodyLimit < BODY_LIMIT_BOUNDS.min || bodyLimit > BODY_LIMIT_BOUNDS.max) {
    checks.push(
      check(
        'body-limit',
        'Request body cap',
        'warn',
        `MAX_BODY_BYTES=${bodyLimit} is outside the sane range (1 KB – 5 MB).`,
        'The largest legitimate payload is a question with a handful of options (~64 KB).',
      ),
    );
  } else {
    checks.push(
      check(
        'body-limit',
        'Request body cap',
        'pass',
        `Bodies above ${Math.round(bodyLimit / 1024)} KB are refused before parsing.`,
        null,
      ),
    );
  }

  return checks;
}

/**
 * Turn a run into a verdict.
 *
 * Any `fail` blocks; a `warn` means "runs, but review this"; `skip` is neutral.
 */
export function summarizeChecks(checks: readonly DeploymentCheck[]): DeploymentSummary {
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };

  for (const entry of checks) counts[entry.status] += 1;

  const verdict: DeploymentVerdict =
    counts.fail > 0 ? 'blocked' : counts.warn > 0 ? 'attention' : 'ready';

  return { verdict, ...counts, checks: [...checks] };
}

/** `7 of 9 checks pass · 2 warnings · 0 failures` — for a caption. */
export function summaryLabel(summary: Pick<DeploymentSummary, 'pass' | 'warn' | 'fail' | 'skip'>) {
  const total = summary.pass + summary.warn + summary.fail + summary.skip;
  const parts = [`${summary.pass} of ${total} checks pass`];

  if (summary.warn > 0) parts.push(`${summary.warn} warning${summary.warn === 1 ? '' : 's'}`);
  if (summary.fail > 0) parts.push(`${summary.fail} failure${summary.fail === 1 ? '' : 's'}`);

  return parts.join(' · ');
}

/* -------------------------------------------------------------------------- */
/*  Wire shape                                                                */
/* -------------------------------------------------------------------------- */

export const systemStatusSchema = z.object({
  generatedAt: z.string(),
  service: z.object({
    name: z.string(),
    version: z.string(),
    runtime: z.string(),
    nodeEnv: z.string(),
    uptimeSeconds: z.number(),
    startedAt: z.string(),
    memoryMb: z.number(),
  }),
  /** Credential-free description of the database the process is talking to. */
  database: z.object({
    target: z.enum(['turso', 'file', 'unconfigured']),
    urlHint: z.string(),
    connected: z.boolean(),
    latencyMs: z.number().nullable(),
    counts: z
      .object({
        users: z.number(),
        categories: z.number(),
        quizzes: z.number(),
        questions: z.number(),
        attempts: z.number(),
      })
      .nullable(),
  }),
  settings: z.object({
    authRateLimitMax: z.number(),
    authRateLimitWindowSeconds: z.number(),
    registerRateLimitMax: z.number(),
    maxBodyBytes: z.number(),
    sessionTtlSeconds: z.number(),
    trustedOrigins: z.array(z.string()),
    apiInternalUrl: z.string().nullable(),
  }),
  summary: deploymentSummarySchema,
});

export type SystemStatus = z.infer<typeof systemStatusSchema>;
