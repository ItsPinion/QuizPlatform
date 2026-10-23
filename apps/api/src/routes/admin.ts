import { idSchema } from '@quiz/shared';
import {
  dashboardStatsSchema,
  updateUserSchema,
  userDetailResponseSchema,
  userListQuerySchema,
  userListResponseSchema,
} from '@quiz/shared/admin';
import { PERMISSIONS, type AccessDescriptor } from '@quiz/shared/auth';
import { categoryListResponseSchema, createCategorySchema } from '@quiz/shared/quiz';
import { Hono } from 'hono';

import { buildDashboardStats } from '../lib/admin-stats';
import { getUserById, listUsers, updateUser } from '../lib/admin-users';
import { createCategory, listCategories } from '../lib/admin-quizzes';
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
 * Day 3 added the namespace itself (the access probe); Day 4 fills it in with
 * the dashboard statistics and user management the admin console renders.
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

  /* ------------------------------- quizzes -------------------------------- */
  /** Full category list with quiz counts, for the console's category picker. */
  .get('/categories', async (c) => {
    const categories = await listCategories();
    return c.json(categoryListResponseSchema.parse({ categories }), 200);
  })

  /**
   * Create-or-pick: naming an existing category (any casing) returns it with
   * `created: false`, so the console can offer "type a name" without ever
   * producing "React" and "react" side by side.
   */
  .post('/categories', jsonBody(createCategorySchema), async (c) => {
    const { category, created } = await createCategory(c.req.valid('json').name);

    return c.json({ category, created }, created ? 201 : 200);
  })

  .route('/quizzes', adminQuizRoutes)

  /** Explicit fallback so a wrong method or unknown path answers as an envelope. */
  .all('*', (c) => {
    throw new ApiError(404, 'NOT_FOUND', `No admin route matches ${c.req.method} ${c.req.path}`);
  });
