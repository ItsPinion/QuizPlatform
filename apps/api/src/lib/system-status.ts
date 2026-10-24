import { SESSION_TTL_SECONDS } from '@quiz/shared/auth';
import {
  evaluateEnvironment,
  summarizeChecks,
  type EnvironmentSnapshot,
  type SystemStatus,
} from '@quiz/shared/deployment';
import { db, getDatabaseConfig, schema } from '@quiz/db';

import {
  env,
  allowedOrigins,
  APP_VERSION,
  demoAccounts,
  developmentFeatures,
  runtimeMode,
} from './env';
import { RATE_RULES } from './rate-limit';

/** When this process began serving — the same anchor the health probe reports. */
const processStartedAt = Date.now();

/**
 * The environment as the checker sees it.
 *
 * Secrets are passed in so the rules can measure them, and the result never
 * carries them out again: `evaluateEnvironment` reports presence and length only.
 */
export function environmentSnapshot(): EnvironmentSnapshot {
  return {
    nodeEnv: env.NODE_ENV,
    runtimeMode,
    databaseUrl: env.TURSO_DATABASE_URL ?? env.DATABASE_URL ?? null,
    databaseToken: env.TURSO_AUTH_TOKEN ?? null,
    jwtSecret: env.JWT_SECRET ?? null,
    webOrigin: env.WEB_ORIGIN,
    // The API does not read this itself; it is reported by the web app when it
    // asks. Leaving it out here keeps the two surfaces honest.
    apiInternalUrl: process.env.API_INTERNAL_URL ?? null,
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
    maxBodyBytes: env.MAX_BODY_BYTES,
  };
}

/**
 * A redacted, self-reported system status for the operator console.
 *
 * Everything here is safe to show to an administrator: a URL *hint* rather than
 * a URL, counts, timings and booleans. If the database is unreachable the endpoint
 * still answers — an ops screen that only works when nothing is broken is useless
 * exactly when it is needed.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const startedAt = new Date(processStartedAt).toISOString();
  const summary = summarizeChecks(evaluateEnvironment(environmentSnapshot()));

  const service: SystemStatus['service'] = {
    name: 'quiz-api',
    version: APP_VERSION,
    runtime: `node ${process.version}`,
    nodeEnv: env.NODE_ENV,
    runtimeMode,
    demoFeatures: developmentFeatures,
    uptimeSeconds: Math.round((Date.now() - processStartedAt) / 1000),
    startedAt,
    memoryMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
  };

  const database: SystemStatus['database'] = {
    target: 'unconfigured',
    urlHint: 'not configured',
    connected: false,
    latencyMs: null,
    counts: null,
  };

  try {
    const config = getDatabaseConfig();
    database.target = config.target;
    database.urlHint = config.urlHint;

    const started = performance.now();
    const [users, categories, quizzes, questions, attempts] = await Promise.all([
      db.$count(schema.users),
      db.$count(schema.categories),
      db.$count(schema.quizzes),
      db.$count(schema.questions),
      db.$count(schema.attempts),
    ]);

    database.connected = true;
    database.latencyMs = Math.round((performance.now() - started) * 100) / 100;
    database.counts = { users, categories, quizzes, questions, attempts };
  } catch {
    // Unreachable or unconfigured: report the failure rather than throwing. The
    // readiness probe (`/api/health/db`) is where a 503 belongs.
    database.connected = false;
  }

  return {
    generatedAt: new Date().toISOString(),
    service,
    database,
    settings: {
      authRateLimitMax: RATE_RULES.login.max,
      authRateLimitWindowSeconds: Math.round(RATE_RULES.login.windowMs / 1000),
      registerRateLimitMax: RATE_RULES.register.max,
      maxBodyBytes: env.MAX_BODY_BYTES,
      sessionTtlSeconds: SESSION_TTL_SECONDS,
      trustedOrigins: [...allowedOrigins],
      apiInternalUrl: process.env.API_INTERNAL_URL ?? null,
      demoAccounts,
    },
    summary,
  };
}
