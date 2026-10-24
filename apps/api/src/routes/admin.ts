import { idSchema } from '@quiz/shared';
import { analyticsQuerySchema, adminAnalyticsSchema } from '@quiz/shared/analytics';
import {
  dashboardStatsSchema,
  updateUserSchema,
  userDetailResponseSchema,
  userListQuerySchema,
  userListResponseSchema,
  userStatusPatchSchema,
} from '@quiz/shared/admin';
import {
  adminAttemptDetailResponseSchema,
  adminAttemptListResponseSchema,
  adminAttemptQuerySchema,
  deleteUserResponseSchema,
  studentProfileResponseSchema,
} from '@quiz/shared/admin-attempts';
import { emailKindSchema, emailStatusSchema, outboxResponseSchema } from '@quiz/shared/email';
import { PERMISSIONS, type AccessDescriptor } from '@quiz/shared/auth';
import { systemStatusSchema } from '@quiz/shared/deployment';
import { Hono } from 'hono';

import { buildAdminAnalytics } from '../lib/admin-analytics';
import { getSystemStatus } from '../lib/system-status';
import { buildDashboardStats } from '../lib/admin-stats';
import { deleteUser, getUserById, listUsers, setUserStatus, updateUser } from '../lib/admin-users';
import { getAttemptDetail, getStudentProfile, listAttempts } from '../lib/admin-attempts';
import { listOutbox } from '../lib/emails';
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

  /**
   * Deployment self-report (Day 14).
   *
   * The same rules the CLI runs, answered by the live process: what mode it is
   * in, what it is connected to, and whether its configuration is fit to serve
   * traffic. Secrets are never echoed — only facts about them.
   */
  .get('/system', async (c) => {
    const status = await getSystemStatus();
    return c.json(systemStatusSchema.parse(status), 200);
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

  /**
   * Activate / deactivate.
   *
   * The switch in the users table calls this rather than the general patch, so
   * a mis-wired form cannot change a role while flipping a status. Same rule
   * underneath: you cannot deactivate yourself.
   */
  .patch('/users/:id/status', jsonBody(userStatusPatchSchema), async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const actor = c.get('user');
    const user = await setUserStatus(id, c.req.valid('json').status, actor.id);

    return c.json(userDetailResponseSchema.parse({ user }), 200);
  })

  /** Delete an account and everything that cascades from it. */
  .delete('/users/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const actor = c.get('user');
    const result = await deleteUser(id, actor.id);

    return c.json(deleteUserResponseSchema.parse(result), 200);
  })

  /** One student's record: stats, category breakdown, full history. */
  .get('/users/:id/profile', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    return c.json(
      studentProfileResponseSchema.parse({ profile: await getStudentProfile(id) }),
      200,
    );
  })

  /* ------------------------------- attempts ------------------------------- */
  /**
   * Every attempt on the platform, filterable by quiz, student, status and free
   * text. This is the "view individual student results" and "view quiz
   * performance" screen — the same rows, read from either end.
   */
  .get('/attempts', async (c) => {
    const query = adminAttemptQuerySchema.parse(queryObject(c.req.url));
    const result = await listAttempts(query);

    return c.json(adminAttemptListResponseSchema.parse(result), 200);
  })

  .get('/attempts/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    return c.json(adminAttemptDetailResponseSchema.parse(await getAttemptDetail(id)), 200);
  })

  /* -------------------------------- email --------------------------------- */
  /**
   * The outbox.
   *
   * Dev builds deliver to the process log, which is invisible in a browser. This
   * endpoint is the window onto it: what was queued, to whom, and whether it
   * went. `?kind=` and `?status=` filter; both are validated enums.
   */
  .get('/emails', async (c) => {
    const raw = new URL(c.req.url).searchParams;
    const kind = raw.get('kind')?.trim() ?? '';
    const status = raw.get('status')?.trim() ?? '';
    const page = Number(raw.get('page') ?? '1');

    return c.json(
      outboxResponseSchema.parse(
        await listOutbox({
          kind: kind === '' ? null : emailKindSchema.parse(kind),
          status: status === '' ? null : emailStatusSchema.parse(status),
          page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
        }),
      ),
      200,
    );
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
