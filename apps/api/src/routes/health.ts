import { db, getDatabaseConfig, schema } from '@quiz/db';
import type { DatabaseStatus, Health } from '@quiz/shared';
import { Hono } from 'hono';

import { APP_VERSION } from '../lib/env';
import { errorBody } from '../lib/errors';

const startedAt = Date.now();

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
  /** Readiness probe: verifies the libSQL/Turso connection and reads live row counts. */
  .get('/db', async (c) => {
    const config = getDatabaseConfig();
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
      const message = error instanceof Error ? error.message : 'Unknown database error';

      return c.json(
        {
          ...errorBody(
            'DATABASE_UNAVAILABLE',
            'The API is running but cannot reach the database.',
            {
              hint:
                config.target === 'turso'
                  ? 'Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, then run `pnpm db:migrate`.'
                  : 'Run `pnpm db:migrate` to create the local database.',
              reason: message,
            },
          ),
          ...(process.env.NODE_ENV === 'production' ? {} : { target: config.target }),
        },
        503,
      );
    }
  });
