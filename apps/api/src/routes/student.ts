import { PERMISSIONS, type AccessDescriptor } from '@quiz/shared/auth';
import { Hono } from 'hono';

import { requireStudent } from '../middleware/auth';
import type { AppEnv } from '../lib/types';
import { studentQuizRoutes } from './student-quizzes';

/**
 * Student-only namespace — the counterpart to `/api/admin`.
 *
 * The guard is mounted once on the parent, so every route below inherits it.
 * Day 7 filled the namespace with the quiz catalogue, attempt start/resume and
 * answer saving.
 */
export const studentRoutes = new Hono<AppEnv>()
  .use('*', requireStudent)

  .get('/access', (c) => {
    const user = c.get('user');

    return c.json<AccessDescriptor>(
      { scope: 'STUDENT', user, permissions: [...PERMISSIONS.STUDENT] },
      200,
    );
  })

  .route('/', studentQuizRoutes);
