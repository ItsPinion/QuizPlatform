import { db, getDatabaseConfig, schema } from '@quiz/db';
import type { DatabaseStatus, Health } from '@quiz/shared';
import { Hono } from 'hono';

import { APP_VERSION } from '../lib/env';
import { errorBody } from '../lib/errors';

const startedAt = Date.now();

/** Flatten Drizzle's wrapped driver error into one actionable line. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  while (current instanceof Error) {
    const candidate = current.message.split('\n')[0]?.trim();
    if (candidate && !parts.includes(candidate)) parts.push(candidate);

    const cause = (current as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object' && 'code' in cause && candidate === 'fetch failed') {
      parts.push(String((cause as { code?: unknown }).code));
    }

    current = cause;
  }

  return parts.join(' → ') || 'Unknown database error';
}

export const healthRoutes = new Hono()
  /** Liveness probe — no database access. */
  .get('/', (c) => {
    const body: Health = {
      status: 'ok',
      service: 'quiz-api',
      version: APP_VERSION,
      runtime: `node ${process.version}`,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };

    return c.json(body, 200);
  })
  /** Readiness probe: verifies the Turso Cloud connection and reads live row counts. */
  .get('/db', async (c) => {
    let config: ReturnType<typeof getDatabaseConfig>;

    try {
      config = getDatabaseConfig();
    } catch (error) {
      return c.json(
        errorBody('DATABASE_NOT_CONFIGURED', 'Turso Cloud credentials are not configured.', {
          hint: 'Copy .env.example to .env and set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.',
          reason: describeError(error),
        }),
        503,
      );
    }

    const started = performance.now();

    try {
      const [users, categories, quizzes, questions, attempts] = await Promise.all([
        db.$count(schema.users),
        db.$count(schema.categories),
        db.$count(schema.quizzes),
        db.$count(schema.questions),
        db.$count(schema.attempts),
      ]);

      const body: DatabaseStatus = {
        connected: true,
        target: config.target,
        urlHint: config.urlHint,
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
        counts: { users, categories, quizzes, questions, attempts },
      };

      return c.json(body, 200);
    } catch (error) {
      return c.json(
        {
          ...errorBody(
            'DATABASE_UNAVAILABLE',
            'The API is running but cannot reach the database.',
            {
              hint: 'Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, then run `bun run db:migrate`.',
              reason: describeError(error),
            },
          ),
          ...(process.env.NODE_ENV === 'production' ? {} : { target: config.target }),
        },
        503,
      );
    }
  });
