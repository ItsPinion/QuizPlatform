import { and, asc, count, desc, eq, gte, inArray, max, sql } from 'drizzle-orm';

import type { StudentDashboard } from '@quiz/shared/dashboard';
import {
  activityBuckets,
  averageOf,
  passRateOf,
  streakOf,
  utcDayKey,
} from '@quiz/shared/dashboard';
import { db, schema } from '@quiz/db';

import { listAttemptHistory } from './reviews';
import { expireStaleAttempts } from './submissions';

const { attempts, categories, quizzes } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_LIMIT = 12;
const ACTIVITY_DAYS = 14;
const RECENT_LIMIT = 5;

/**
 * Everything the student dashboard shows, in one round trip.
 *
 * Five queries, each answering one section — the totals, the trend line, the
 * per-category breakdown, the activity window and the recent rows. They are
 * deliberately separate rather than one clever join: the aggregates have
 * different `group by` shapes, and joining them would fan the rows out and
 * force `distinct` everywhere.
 *
 * Definitions, spelled out again because they are what the numbers mean:
 *
 * - `attempts` counts every attempt, including one still running;
 * - `passed` / `failed` count graded attempts only;
 * - `averagePercentage`, `bestPercentage`, `worstPercentage`, `passRate`,
 *   `accuracy` and every category/activity average ignore `IN_PROGRESS` rows,
 *   whose stored percentage is `0` and would otherwise be read as a fail;
 * - `questionsAnswered` is correct + incorrect — a blank question was not
 *   answered, and counting it would inflate "questions answered";
 * - `quizzesAttempted` is a `count(distinct quiz_id)`, which is what the spec's
 *   "total quizzes attempted" means.
 */
export async function buildStudentDashboard(
  userId: string,
  now: Date = new Date(),
): Promise<StudentDashboard> {
  // A deadline that passed a minute ago must not still look like it is running.
  await expireStaleAttempts(userId, now);

  const windowStart = utcDayKey(now.getTime() - (ACTIVITY_DAYS + 1) * DAY_MS);

  const [totalsRows, quotaRows, trendRows, categoryRows, activityRows, recent] = await Promise.all([
    db
      .select({
        attempts: count(attempts.id),
        quizzesAttempted: sql<number>`count(distinct ${attempts.quizId})`.mapWith(Number),
        passed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        failed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'FAILED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        inProgress:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'IN_PROGRESS' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        questionsAnswered:
          sql<number>`coalesce(sum(${attempts.correctAnswers} + ${attempts.incorrectAnswers}), 0)`.mapWith(
            Number,
          ),
        questionsCorrect: sql<number>`coalesce(sum(${attempts.correctAnswers}), 0)`.mapWith(Number),
        timeSpent:
          sql<number>`coalesce(sum(case when ${attempts.status} in ('PASSED','FAILED') then ${attempts.timeTakenSeconds} else 0 end), 0)`.mapWith(
            Number,
          ),
        gradedTime:
          sql<number>`coalesce(sum(case when ${attempts.status} in ('PASSED','FAILED') then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(attempts)
      .where(eq(attempts.userId, userId)),

    db.select({ value: count() }).from(quizzes).where(eq(quizzes.status, 'PUBLISHED')),

    // The chart wants oldest → newest, so read the newest window and reverse it.
    db
      .select({
        attemptId: attempts.id,
        quizTitle: quizzes.title,
        percentage: attempts.percentage,
        status: attempts.status,
        completedAt: attempts.completedAt,
        expiresAt: attempts.expiresAt,
      })
      .from(attempts)
      .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
      .where(and(eq(attempts.userId, userId), inArray(attempts.status, ['PASSED', 'FAILED'])))
      .orderBy(desc(attempts.completedAt), desc(attempts.startedAt))
      .limit(TREND_LIMIT),

    db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        attempts: count(attempts.id),
        averagePercentage: sql<number>`avg(${attempts.percentage})`.mapWith(Number),
        bestPercentage: max(attempts.percentage),
        passed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        failed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'FAILED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(attempts)
      .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(and(eq(attempts.userId, userId), inArray(attempts.status, ['PASSED', 'FAILED'])))
      .groupBy(categories.id)
      .orderBy(asc(categories.name)),

    // `strftime` on the millisecond column gives the UTC day; the zero-filling
    // happens in the shared helper so quiet days keep their slot in the chart.
    db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', ${attempts.completedAt} / 1000, 'unixepoch')`,
        attempts: count(attempts.id),
        averagePercentage: sql<number>`avg(${attempts.percentage})`.mapWith(Number),
      })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, userId),
          inArray(attempts.status, ['PASSED', 'FAILED']),
          gte(attempts.completedAt, new Date(now.getTime() - (ACTIVITY_DAYS + 1) * DAY_MS)),
        ),
      )
      .groupBy(sql`strftime('%Y-%m-%d', ${attempts.completedAt} / 1000, 'unixepoch')`),

    listAttemptHistory({ sort: 'newest', page: 1, pageSize: RECENT_LIMIT }, userId),
  ]);

  const totals = totalsRows[0];
  const gradedCount = Number(totals?.gradedTime ?? 0);

  const gradedPercentages = await loadGradedPercentages(userId);

  // The streak wants newest first; the trend above is deliberately oldest first.
  const recentStatuses = await db
    .select({ status: attempts.status })
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.startedAt))
    .limit(50);

  const streak = streakOf(recentStatuses.map((row) => row.status));

  const averagePercentage = averageOf(gradedPercentages);
  const passRate = passRateOf(Number(totals?.passed ?? 0), Number(totals?.failed ?? 0));

  const answered = Number(totals?.questionsAnswered ?? 0);
  const correct = Number(totals?.questionsCorrect ?? 0);

  const trend = [...trendRows].reverse().map((row) => ({
    attemptId: row.attemptId,
    quizTitle: row.quizTitle,
    percentage: row.percentage,
    passed: row.status === 'PASSED',
    completedAt: (row.completedAt ?? row.expiresAt).toISOString(),
  }));

  return {
    totals: {
      attempts: Number(totals?.attempts ?? 0),
      quizzesAttempted: Number(totals?.quizzesAttempted ?? 0),
      quizzesAvailable: Number(quotaRows[0]?.value ?? 0),
      passed: Number(totals?.passed ?? 0),
      failed: Number(totals?.failed ?? 0),
      inProgress: Number(totals?.inProgress ?? 0),
      averagePercentage,
      bestPercentage: gradedPercentages.length === 0 ? null : Math.max(...gradedPercentages),
      worstPercentage: gradedPercentages.length === 0 ? null : Math.min(...gradedPercentages),
      passRate,
      questionsAnswered: answered,
      questionsCorrect: correct,
      accuracy: answered > 0 ? Math.round((correct / answered) * 10_000) / 100 : null,
      timeSpentSeconds: Number(totals?.timeSpent ?? 0),
      averageTimeSeconds:
        gradedCount > 0 ? Math.round(Number(totals?.timeSpent ?? 0) / gradedCount) : null,
    },
    streak,
    trend,
    categories: categoryRows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      attempts: Number(row.attempts),
      averagePercentage: Math.round(Number(row.averagePercentage) * 100) / 100,
      bestPercentage: Number(row.bestPercentage ?? 0),
      passed: Number(row.passed),
      failed: Number(row.failed),
    })),
    activity: activityBuckets(
      activityRows.map((row) => ({
        date: row.date,
        attempts: Number(row.attempts),
        averagePercentage:
          row.averagePercentage == null
            ? null
            : Math.round(Number(row.averagePercentage) * 100) / 100,
      })),
      ACTIVITY_DAYS,
      now,
    ),
    recent: recent.attempts,
    generatedAt: now.toISOString(),
  };
}

/**
 * Every graded percentage for the student.
 *
 * `avg` and `max` could be computed in SQL, but the dashboard also needs the
 * individual points for the trend and for the "best/worst" pair, so this reads
 * the scored rows once and lets the shared helpers do the arithmetic. Bounded by
 * the number of attempts a student can physically take in this product.
 */
async function loadGradedPercentages(userId: string): Promise<number[]> {
  const rows = await db
    .select({ percentage: attempts.percentage })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), inArray(attempts.status, ['PASSED', 'FAILED'])));

  return rows.map((row) => Number(row.percentage));
}
