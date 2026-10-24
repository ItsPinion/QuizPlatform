import { db, getDatabaseConfig, schema } from '@quiz/db';
import type { DatabaseStatus, Health } from '@quiz/shared';
import { Hono } from 'hono';

import { classifyDatabaseError, describeError, isRejectedRequest } from '../lib/db-errors';
import { APP_VERSION, developmentFeatures } from '../lib/env';
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
      const reason = describeError(error);
      const failure = classifyDatabaseError(error);

      // Make the cause visible in the server log too, not just the HTTP body.
      console.error(`[db] readiness check failed against ${config.urlHint}: ${reason}`);

      if (failure === 'schema-missing') {
        return c.json(
          {
            ...errorBody(
              'DATABASE_SCHEMA_MISSING',
              'Turso Cloud is reachable, but the database has no schema yet.',
              {
                hint: 'Apply the Drizzle migrations with `bun run db:migrate`, then optionally `bun run db:seed`.',
                reason,
              },
            ),
            ...(developmentFeatures ? { target: config.target } : {}),
          },
          503,
        );
      }

      const rejected = isRejectedRequest(error);
      const hint = rejected
        ? 'Turso rejected the request for this database. Confirm TURSO_DATABASE_URL matches `turso db show <db> --url`, then issue a fresh token with `turso db tokens create <db>`.'
        : 'Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, then run `bun run db:migrate`.';

      return c.json(
        {
          ...errorBody(
            'DATABASE_UNAVAILABLE',
            rejected
              ? 'The API is running but Turso rejected its credentials.'
              : 'The API is running but cannot reach the database.',
            { hint, reason },
          ),
          ...(developmentFeatures ? { target: config.target } : {}),
        },
        503,
      );
    }
  });
