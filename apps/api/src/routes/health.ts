import { getDatabaseClient, getDatabaseConfig } from '@quiz/db';
import type { DatabaseStatus, Health } from '@quiz/shared';
import { Hono } from 'hono';

import { APP_VERSION } from '../lib/env';
import { errorBody } from '../lib/errors';

const startedAt = Date.now();

interface CountRow {
  users: number | bigint;
  categories: number | bigint;
  quizzes: number | bigint;
  questions: number | bigint;
  attempts: number | bigint;
}

const toNumber = (value: unknown): number => Number(value ?? 0);

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
      const client = getDatabaseClient();
      const result = await client.execute(`
        select
          (select count(*) from users)      as users,
          (select count(*) from categories) as categories,
          (select count(*) from quizzes)    as quizzes,
          (select count(*) from questions)  as questions,
          (select count(*) from attempts)   as attempts
      `);

      const row = result.rows[0] as unknown as CountRow | undefined;
      const body: DatabaseStatus = {
        connected: true,
        target: config.target,
        urlHint: config.urlHint,
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
        counts: {
          users: toNumber(row?.users),
          categories: toNumber(row?.categories),
          quizzes: toNumber(row?.quizzes),
          questions: toNumber(row?.questions),
          attempts: toNumber(row?.attempts),
        },
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
                  ? 'Check DATABASE_URL and TURSO_AUTH_TOKEN in your environment.'
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
