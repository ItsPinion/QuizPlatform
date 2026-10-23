import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

import { APP_VERSION, allowedOrigins, env } from './lib/env';
import { errorHandler, notFoundHandler } from './lib/errors';
import type { AppEnv } from './lib/types';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
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
  .use(prettyJSON({ space: 2 }))
  .use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Request-Id'],
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
          '/api/student/access',
        ],
      },
      200,
    ),
  )
  .route('/api', apiRoutes)
  .notFound(notFoundHandler)
  .onError(errorHandler);

export type AppType = typeof app;
