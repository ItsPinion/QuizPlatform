import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

import { APP_VERSION, env, isAllowedOrigin } from './lib/env';
import { errorHandler, notFoundHandler } from './lib/errors';
import { requireSameOrigin } from './middleware/origin';
import type { AppEnv } from './lib/types';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { leaderboardRoutes } from './routes/leaderboard';
import { metaRoutes } from './routes/meta';
import { studentRoutes } from './routes/student';

/**
 * Sub-router mounted at `/api`.
 *
 * Every route is chained here so Hono can infer the full route schema and
 * export it as `AppType` for the end-to-end typed RPC client in the web app.
 */
const apiRoutes = new Hono<AppEnv>()
  .route('/health', healthRoutes)
  .route('/meta', metaRoutes)
  .route('/auth', authRoutes)
  .route('/leaderboard', leaderboardRoutes)
  .route('/admin', adminRoutes)
  .route('/student', studentRoutes);

export const app = new Hono<AppEnv>()
  .use(requestId())
  .use(async (c, next) => {
    await next();
    c.header('X-Request-Id', c.get('requestId'));
  })
  .use(
    secureHeaders({
      crossOriginResourcePolicy: 'cross-origin',
    }),
  )
  // Every response the API produces is per-session or time-sensitive; none of it
  // belongs in a shared cache, a bfcache or a proxy.
  .use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('Vary', 'Cookie, Origin');
  })
  // A body larger than the policy allows is refused before it is parsed: the
  // largest legitimate payload is a question with a handful of options.
  .use(
    bodyLimit({
      maxSize: env.MAX_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            error: {
              code: 'PAYLOAD_TOO_LARGE',
              message: `The request body must be smaller than ${Math.round(env.MAX_BODY_BYTES / 1024)} KB.`,
            },
          },
          413,
        ),
    }),
  )
  // CSRF belt-and-braces: a foreign origin cannot drive a state-changing call.
  .use(requireSameOrigin)
  .use(prettyJSON({ space: 2 }))
  .use(
    cors({
      // A function, not the array: preview hosts match by suffix. Returning
      // undefined withholds the header entirely for anyone else.
      origin: (origin) => (isAllowedOrigin(origin) ? origin : undefined),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 86_400,
    }),
  )
  .use(async (c, next) => {
    // The logger middleware must be awaited, otherwise the context is never
    // finalised and Hono answers with a 500.
    if (env.NODE_ENV === 'production') {
      await next();
      return;
    }

    await logger()(c, next);
  })
  .get('/', (c) =>
    c.json(
      {
        name: 'quiz-api',
        version: APP_VERSION,
        message: 'Quiz Platform API is running.',
        endpoints: [
          '/api/health',
          '/api/health/db',
          '/api/meta',
          '/api/auth/register',
          '/api/auth/login',
          '/api/auth/logout',
          '/api/auth/me',
          '/api/admin/access',
          '/api/admin/stats',
          '/api/admin/users',
          '/api/admin/categories',
          '/api/admin/quizzes',
          '/api/admin/questions',
          '/api/student/access',
          '/api/student/quizzes',
          '/api/student/dashboard',
          '/api/student/attempts',
          '/api/student/attempts/:id',
          '/api/student/attempts/:id/review',
          '/api/student/attempts/:id/submit',
          '/api/admin/analytics',
          '/api/leaderboard',
        ],
      },
      200,
    ),
  )
  .route('/api', apiRoutes)
  .notFound(notFoundHandler)
  .onError(errorHandler);

export type AppType = typeof app;
