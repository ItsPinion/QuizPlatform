import { idSchema } from '@quiz/shared';
import { analyticsQuerySchema, adminAnalyticsSchema } from '@quiz/shared/analytics';
import {
  dashboardStatsSchema,
  updateUserSchema,
  userDetailResponseSchema,
  userListQuerySchema,
  userListResponseSchema,
} from '@quiz/shared/admin';
import { PERMISSIONS, type AccessDescriptor } from '@quiz/shared/auth';
import { Hono } from 'hono';

import { buildAdminAnalytics } from '../lib/admin-analytics';
import { buildDashboardStats } from '../lib/admin-stats';
import { getUserById, listUsers, updateUser } from '../lib/admin-users';
import { adminCategoryRoutes } from './admin-categories';
import { adminQuestionRoutes } from './admin-questions';
import { adminQuizRoutes } from './admin-quizzes';
import { ApiError, jsonBody } from '../lib/errors';
import type { AppEnv } from '../lib/types';
import { requireAdmin } from '../middleware/auth';

/** `?role=` (empty) is how a cleared filter arrives — treat it as absent. */
function queryObject(url: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of new URL(url).searchParams) {
    if (value.trim() !== '') out[key] = value;
  }

  return out;
}

/**
 * Admin-only namespace.
 *
 * The guard is mounted once, at router level, so every route here inherits the
 * same protection — there is no per-handler `if (role !== 'ADMIN')` to forget.
 *
 * Day 3 added the namespace itself (the access probe); Day 4 filled it in with
 * the dashboard statistics and user management, Day 5 with quiz management, and
 * Day 6 with category CRUD and question authoring.
 *
 * The whole chain is one expression on purpose: Hono accumulates the route
 * schema in the builder's type, and that is what the web app's `hc<AppType>`
 * client infers its methods and payloads from.
 */
export const adminRoutes = new Hono<AppEnv>()
  .use('*', requireAdmin)

  .get('/access', (c) => {
    const user = c.get('user');

    return c.json<AccessDescriptor>(
      { scope: 'ADMIN', user, permissions: [...PERMISSIONS.ADMIN] },
      200,
    );
  })

  /* ------------------------------- dashboard ------------------------------ */
  .get('/stats', async (c) => {
    const stats = await buildDashboardStats();
    return c.json(dashboardStatsSchema.parse(stats), 200);
  })

  /* ------------------------------- analytics ------------------------------ */
  /**
   * Day 11: the platform-wide charts. `?days=` picks the window (7 / 14 / 30 /
   * 90, default 30) and is validated here — the screen's filter parser is
   * forgiving, this endpoint is not.
   */
  .get('/analytics', async (c) => {
    const raw = new URL(c.req.url).searchParams.get('days') ?? '';

    // An empty `?days=` is a cleared filter, not a value — same rule the rest
    // of the console's query parsing uses.
    const query = analyticsQuerySchema.parse({
      days: raw.trim() === '' ? undefined : raw,
    });

    const analytics = await buildAdminAnalytics(query.days);
    return c.json(adminAnalyticsSchema.parse(analytics), 200);
  })

  /* ---------------------------- user management --------------------------- */
  .get('/users', async (c) => {
    const query = userListQuerySchema.parse(queryObject(c.req.url));
    const result = await listUsers(query);

    return c.json(userListResponseSchema.parse(result), 200);
  })

  .get('/users/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const user = await getUserById(id);

    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'No user with that id exists.');
    }

    return c.json(userDetailResponseSchema.parse({ user }), 200);
  })

  .patch('/users/:id', jsonBody(updateUserSchema), async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const input = c.req.valid('json');
    const actor = c.get('user');

    const user = await updateUser(id, input, actor.id);

    return c.json(userDetailResponseSchema.parse({ user }), 200);
  })

  /* ------------------------- categories & questions ----------------------- */
  /**
   * Categories get their own screen on Day 6: list, create, rename, delete.
   * The quiz form still uses the same list endpoint to power its typeahead.
   */
  .route('/categories', adminCategoryRoutes)

  /** Questions by id (`GET`, `PUT`, `DELETE`) — quiz-scoped routes live below. */
  .route('/questions', adminQuestionRoutes)

  .route('/quizzes', adminQuizRoutes)

  /** Explicit fallback so a wrong method or unknown path answers as an envelope. */
  .all('*', (c) => {
    throw new ApiError(404, 'NOT_FOUND', `No admin route matches ${c.req.method} ${c.req.path}`);
  });
