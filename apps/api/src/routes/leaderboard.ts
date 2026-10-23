import { leaderboardQuerySchema, leaderboardResponseSchema } from '@quiz/shared/leaderboard';
import { Hono } from 'hono';

import { getLeaderboard } from '../lib/leaderboard';
import type { AppEnv } from '../lib/types';
import { requireAuth } from '../middleware/auth';

/**
 * The leaderboard (Day 12).
 *
 * Mounted at `/api/leaderboard` rather than under a role namespace: the spec
 * lists it as its own endpoint, both roles may look at it, and an anonymous
 * caller gets `401` from `requireAuth`. The board never exposes an email — a
 * display name and a rank are all a leaderboard needs.
 */
export const leaderboardRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const user = c.get('user');
    const params = new URL(c.req.url).searchParams;

    const query = leaderboardQuerySchema.parse({
      metric: params.get('metric') ?? undefined,
      period: params.get('period') ?? undefined,
      categoryId: params.get('categoryId') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });

    const board = await getLeaderboard(query, user.id);
    return c.json(leaderboardResponseSchema.parse(board), 200);
  });
