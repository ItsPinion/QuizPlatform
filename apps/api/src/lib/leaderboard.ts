import { and, count, countDistinct, eq, gte, max, sql } from 'drizzle-orm';

import type {
  LeaderboardCandidate,
  LeaderboardQuery,
  LeaderboardResponse,
} from '@quiz/shared/leaderboard';
import { buildLeaderboard, periodStart } from '@quiz/shared/leaderboard';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';

const { attempts, categories, quizzes, users } = schema;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The only attempts that carry a score: a live paper has none, an expired one was never graded. */
const GRADED = sql`${attempts.status} in ('PASSED','FAILED')`;

/**
 * The ranked board, built from one aggregate query.
 *
 * `status in ('PASSED','FAILED')` is the whole definition of "on the board": a
 * paper still running has no score, and an unsubmitted one has nothing to rank
 * on. That also means no expiry sweep is needed here — a stale row is simply not
 * graded yet, exactly like a live one.
 *
 * Grouping happens in SQL, ranking happens in `@quiz/shared/leaderboard`: tie
 * rules and the "points behind" column are easier to argue about (and to test)
 * as a pure function than as a window function.
 */
export async function getLeaderboard(
  query: LeaderboardQuery,
  currentUserId: string,
  now: Date = new Date(),
): Promise<LeaderboardResponse> {
  let categoryName: string | null = null;

  if (query.categoryId) {
    const [category] = await db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, query.categoryId))
      .limit(1);

    if (!category) {
      throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'No category with that id exists.');
    }

    categoryName = category.name;
  }

  const start = periodStart(query.period, now);

  const scope = and(
    GRADED,
    eq(users.role, 'STUDENT'),
    query.categoryId ? eq(quizzes.categoryId, query.categoryId) : undefined,
    start ? gte(attempts.completedAt, start) : undefined,
  );

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      averagePercentage: sql<number>`avg(${attempts.percentage})`.mapWith(Number),
      bestPercentage: sql<number>`max(${attempts.percentage})`.mapWith(Number),
      attempts: count(attempts.id),
      quizzesCompleted: countDistinct(attempts.quizId),
      passed:
        sql<number>`coalesce(sum(case when ${attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      failed:
        sql<number>`coalesce(sum(case when ${attempts.status} = 'FAILED' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      lastAttemptAt: max(attempts.completedAt),
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .where(scope)
    .groupBy(users.id);

  const candidates: LeaderboardCandidate[] = rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    averagePercentage: round2(Number(row.averagePercentage)),
    bestPercentage: round2(Number(row.bestPercentage)),
    attempts: Number(row.attempts),
    quizzesCompleted: Number(row.quizzesCompleted),
    passed: Number(row.passed),
    failed: Number(row.failed),
    lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
  }));

  const board = buildLeaderboard(candidates, query.metric, currentUserId);

  const [quizTotals] = await db
    .select({ value: countDistinct(attempts.quizId) })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .where(scope);

  return {
    generatedAt: now.toISOString(),
    metric: query.metric,
    period: query.period,
    scope: {
      type: query.categoryId ? 'category' : 'overall',
      categoryId: query.categoryId ?? null,
      categoryName,
    },
    entries: board.slice(0, query.limit),
    // The caller's own rank, even when it falls outside the visible slice.
    currentUser: board.find((entry) => entry.isCurrentUser) ?? null,
    totals: {
      participants: board.length,
      attempts: candidates.reduce((sum, entry) => sum + entry.attempts, 0),
      quizzes: Number(quizTotals?.value ?? 0),
    },
  };
}
