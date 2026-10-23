import { PERMISSIONS, type AccessDescriptor } from '@quiz/shared/auth';
import { Hono } from 'hono';

import { ApiError } from '../lib/errors';
import type { AppEnv } from '../lib/types';
import { requireAdmin } from '../middleware/auth';

/**
 * Admin-only namespace.
 *
 * The guard is mounted once, at router level, so every route added in Day 4+
 * (users, quizzes, questions, analytics) inherits the same protection.
 */
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', requireAdmin);

adminRoutes.get('/access', (c) => {
  const user = c.get('user');

  return c.json<AccessDescriptor>(
    { scope: 'ADMIN', user, permissions: [...PERMISSIONS.ADMIN] },
    200,
  );
});

/** Explicit fallback so a wrong method or unknown path answers as an error envelope. */
adminRoutes.all('*', (c) => {
  throw new ApiError(404, 'NOT_FOUND', `No admin route matches ${c.req.method} ${c.req.path}`);
});
