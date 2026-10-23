import { PERMISSIONS, type AccessDescriptor } from '@quiz/shared/auth';
import { Hono } from 'hono';

import { ApiError } from '../lib/errors';
import type { AppEnv } from '../lib/types';
import { requireStudent } from '../middleware/auth';

/**
 * Student-only namespace — the counterpart to `/api/admin`.
 *
 * Day 7+ mounts quiz-taking and results routes here; the guard is already in
 * place, so nothing inside can be reached by an admin-only or anonymous caller.
 */
export const studentRoutes = new Hono<AppEnv>();

studentRoutes.use('*', requireStudent);

studentRoutes.get('/access', (c) => {
  const user = c.get('user');

  return c.json<AccessDescriptor>(
    { scope: 'STUDENT', user, permissions: [...PERMISSIONS.STUDENT] },
    200,
  );
});

studentRoutes.all('*', (c) => {
  throw new ApiError(404, 'NOT_FOUND', `No student route matches ${c.req.method} ${c.req.path}`);
});
