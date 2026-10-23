import { and, count, eq, gte, lt, max, sql } from 'drizzle-orm';

import type { AdminAnalytics, AnalyticsWindow } from '@quiz/shared/analytics';
import { analyticsBuckets } from '@quiz/shared/analytics';
import { passRateOf } from '@quiz/shared/dashboard';
import { db, schema } from '@quiz/db';

import { expireStaleAttempts } from './submissions';

const { attempts, categories, questions, quizzes, users } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Midnight UTC, `days - 1` days before `now` — the first bucket of the window. */
function windowStart(now: Date, days: number): Date {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(end - (days - 1) * DAY_MS);
}

/**
 * Settle timed-out attempts before counting them.
 *
 * The student screens sweep lazily for the caller only. An admin looking at the
 * whole platform would otherwise see "in progress" attempts whose deadline
 * passed hours ago, and those rows would drag every average and pass rate they
 * are excluded from. There is no cross-user sweep elsewhere, so each student
 * with a stale row is settled through the same Day 8 code path.
 */
async function settleStaleAttempts(now: Date): Promise<void> {
  const staleOwners = await db
    .select({ userId: attempts.userId })
    .from(attempts)
    .where(and(eq(attempts.status, 'IN_PROGRESS'), lt(attempts.expiresAt, now)))
    .groupBy(attempts.userId)
    .limit(50);

  await Promise.all(staleOwners.map((row) => expireStaleAttempts(row.userId, now)));
}

/**
 * Everything the Day 11 analytics screen draws, from a fixed set of aggregates.
 *
 * Definitions, because they are what the charts actually mean:
 *
 * - **graded** is `PASSED + FAILED`. `EXPIRED` keeps its own slice: an attempt
 *   nobody submitted is not a failure, and mixing it in would overstate the
 *   failure rate (in practice grading always writes PASSED or FAILED, so the
 *   slice is normally empty).
 * - **passRate** is passed / (passed + failed), `null` before the first result.
 * - **averagePercentage** ignores `IN_PROGRESS` rows, whose stored percentage is
 *   a zero that was never earned.
 * - **attempts over time** is grouped on `startedAt` — "when did people sit
 *   quizzes" — while the pass/fail counts inside each bucket come from the same
 *   day's finished attempts.
 * - **registrations** are students only, grouped on `users.createdAt`.
 * - **popularity** is ordered by attempts, not by learners, because a quiz
 *   people retry is genuinely popular.
 */
export async function buildAdminAnalytics(
  days: AnalyticsWindow = 30,
  now: Date = new Date(),
): Promise<AdminAnalytics> {
  await settleStaleAttempts(now);

  const start = windowStart(now, days);
  const previousStart = new Date(start.getTime() - days * DAY_MS);

  const [
    studentRows,
    quizRows,
    questionRows,
    attemptRows,
    windowRow,
    previousWindowRow,
    attemptDayRows,
    registrationDayRows,
    quizPerformanceRows,
    categoryAttemptRows,
    categoryQuizRows,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        active:
          sql<number>`coalesce(sum(case when ${users.status} = 'ACTIVE' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        newInWindow:
          sql<number>`coalesce(sum(case when ${users.createdAt} >= ${start.getTime()} then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        newInPreviousWindow:
          sql<number>`coalesce(sum(case when ${users.createdAt} >= ${previousStart.getTime()} and ${users.createdAt} < ${start.getTime()} then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(users)
      .where(eq(users.role, 'STUDENT')),

    db
      .select({
        total: count(),
        published:
          sql<number>`coalesce(sum(case when ${quizzes.status} = 'PUBLISHED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        drafts:
          sql<number>`coalesce(sum(case when ${quizzes.status} = 'DRAFT' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        unpublished:
          sql<number>`coalesce(sum(case when ${quizzes.status} = 'UNPUBLISHED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(quizzes),

    db.select({ value: count() }).from(questions),

    db
      .select({
        total: count(),
        passed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        failed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'FAILED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        expired:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'EXPIRED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        inProgress:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'IN_PROGRESS' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        learners: sql<number>`count(distinct ${attempts.userId})`.mapWith(Number),
        attemptedQuizzes: sql<number>`count(distinct ${attempts.quizId})`.mapWith(Number),
        averagePercentage: sql<
          number | null
        >`avg(case when ${attempts.status} in ('PASSED','FAILED') then ${attempts.percentage} end)`.mapWith(
          Number,
        ),
        averageTime: sql<
          number | null
        >`avg(case when ${attempts.status} in ('PASSED','FAILED') then ${attempts.timeTakenSeconds} end)`.mapWith(
          Number,
        ),
        questionsCorrect: sql<number>`coalesce(sum(${attempts.correctAnswers}), 0)`.mapWith(Number),
        questionsAnswered:
          sql<number>`coalesce(sum(${attempts.correctAnswers} + ${attempts.incorrectAnswers}), 0)`.mapWith(
            Number,
          ),
      })
      .from(attempts),

    db.select({ value: count() }).from(attempts).where(gte(attempts.startedAt, start)),

    db
      .select({ value: count() })
      .from(attempts)
      .where(and(gte(attempts.startedAt, previousStart), lt(attempts.startedAt, start))),

    db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', ${attempts.startedAt} / 1000, 'unixepoch')`,
        attempts: count(attempts.id),
        passed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        failed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'FAILED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        averagePercentage: sql<
          number | null
        >`avg(case when ${attempts.status} in ('PASSED','FAILED') then ${attempts.percentage} end)`.mapWith(
          Number,
        ),
      })
      .from(attempts)
      .where(gte(attempts.startedAt, start))
      .groupBy(sql`strftime('%Y-%m-%d', ${attempts.startedAt} / 1000, 'unixepoch')`),

    db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', ${users.createdAt} / 1000, 'unixepoch')`,
        registrations: count(users.id),
      })
      .from(users)
      .where(and(eq(users.role, 'STUDENT'), gte(users.createdAt, start)))
      .groupBy(sql`strftime('%Y-%m-%d', ${users.createdAt} / 1000, 'unixepoch')`),

    db
      .select({
        quizId: quizzes.id,
        title: quizzes.title,
        slug: quizzes.slug,
        categoryName: categories.name,
        status: quizzes.status,
        attempts: count(attempts.id),
        learners: sql<number>`count(distinct ${attempts.userId})`.mapWith(Number),
        averagePercentage: sql<
          number | null
        >`avg(case when ${attempts.status} in ('PASSED','FAILED') then ${attempts.percentage} end)`.mapWith(
          Number,
        ),
        bestPercentage: sql<
          number | null
        >`max(case when ${attempts.status} in ('PASSED','FAILED') then ${attempts.percentage} end)`.mapWith(
          Number,
        ),
        passed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        failed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'FAILED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        lastAttemptAt: max(attempts.startedAt),
      })
      .from(attempts)
      .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .groupBy(quizzes.id),

    db
      .select({
        categoryId: categories.id,
        name: categories.name,
        attempts: count(attempts.id),
        learners: sql<number>`count(distinct ${attempts.userId})`.mapWith(Number),
        averagePercentage: sql<
          number | null
        >`avg(case when ${attempts.status} in ('PASSED','FAILED') then ${attempts.percentage} end)`.mapWith(
          Number,
        ),
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
      .groupBy(categories.id),

    db
      .select({ categoryId: categories.id, name: categories.name, quizzes: count(quizzes.id) })
      .from(categories)
      .leftJoin(quizzes, eq(quizzes.categoryId, categories.id))
      .groupBy(categories.id),
  ]);

  const studentRow = studentRows[0];
  const quizRow = quizRows[0];
  const attemptRow = attemptRows[0];

  const students = Number(studentRow?.total ?? 0);
  const active = Number(studentRow?.active ?? 0);
  const learners = Number(attemptRow?.learners ?? 0);
  const totalAttempts = Number(attemptRow?.total ?? 0);
  const passed = Number(attemptRow?.passed ?? 0);
  const failed = Number(attemptRow?.failed ?? 0);
  const expired = Number(attemptRow?.expired ?? 0);
  const inProgress = Number(attemptRow?.inProgress ?? 0);
  const graded = passed + failed;
  const answered = Number(attemptRow?.questionsAnswered ?? 0);
  const correct = Number(attemptRow?.questionsCorrect ?? 0);
  const totalQuizzes = Number(quizRow?.total ?? 0);
  const totalQuestions = Number(questionRows[0]?.value ?? 0);
  const attemptedQuizzes = Number(attemptRow?.attemptedQuizzes ?? 0);

  const timeline = analyticsBuckets(
    attemptDayRows.map((row) => ({
      date: row.date,
      attempts: Number(row.attempts),
      passed: Number(row.passed),
      failed: Number(row.failed),
      averagePercentage:
        row.averagePercentage == null ? null : round2(Number(row.averagePercentage)),
    })),
    days,
    now,
  ).map((bucket) => ({
    ...bucket,
    registrations: Number(
      registrationDayRows.find((row) => row.date === bucket.date)?.registrations ?? 0,
    ),
  }));

  const quizPerformance: AdminAnalytics['quizPerformance'] = quizPerformanceRows.map((row) => ({
    quizId: row.quizId,
    title: row.title,
    slug: row.slug,
    categoryName: row.categoryName,
    status: row.status,
    attempts: Number(row.attempts),
    learners: Number(row.learners),
    averagePercentage: row.averagePercentage == null ? null : round2(Number(row.averagePercentage)),
    bestPercentage: row.bestPercentage == null ? null : round2(Number(row.bestPercentage)),
    passRate: passRateOf(Number(row.passed), Number(row.failed)),
    lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
  }));

  const categoryAttempts = new Map(categoryAttemptRows.map((row) => [row.categoryId, row]));

  const categoryAnalytics: AdminAnalytics['categories'] = categoryQuizRows
    .map((quizRow) => {
      const attemptRowForCategory = categoryAttempts.get(quizRow.categoryId);

      return {
        categoryId: quizRow.categoryId,
        name: quizRow.name,
        quizzes: Number(quizRow.quizzes),
        attempts: Number(attemptRowForCategory?.attempts ?? 0),
        learners: Number(attemptRowForCategory?.learners ?? 0),
        averagePercentage:
          attemptRowForCategory?.averagePercentage == null
            ? null
            : round2(Number(attemptRowForCategory.averagePercentage)),
        passRate: attemptRowForCategory
          ? passRateOf(Number(attemptRowForCategory.passed), Number(attemptRowForCategory.failed))
          : null,
      };
    })
    .sort((a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name));

  quizPerformance.sort((a, b) => b.attempts - a.attempts || a.title.localeCompare(b.title));

  return {
    generatedAt: now.toISOString(),
    windowDays: days,
    students: {
      total: students,
      active,
      inactive: students - active,
      newInWindow: Number(studentRow?.newInWindow ?? 0),
      newInPreviousWindow: Number(studentRow?.newInPreviousWindow ?? 0),
      activeLearners: learners,
      attemptsPerLearner: learners === 0 ? null : round1(totalAttempts / learners),
    },
    quizzes: {
      total: totalQuizzes,
      published: Number(quizRow?.published ?? 0),
      drafts: Number(quizRow?.drafts ?? 0),
      unpublished: Number(quizRow?.unpublished ?? 0),
      questions: totalQuestions,
      attempted: attemptedQuizzes,
      neverAttempted: Math.max(0, totalQuizzes - attemptedQuizzes),
      averageQuestions: totalQuizzes === 0 ? null : round1(totalQuestions / totalQuizzes),
    },
    attempts: {
      total: totalAttempts,
      graded,
      passed,
      failed,
      expired,
      inProgress,
      averagePercentage:
        attemptRow?.averagePercentage == null ? null : round2(Number(attemptRow.averagePercentage)),
      passRate: passRateOf(passed, failed),
      averageTimeSeconds:
        attemptRow?.averageTime == null ? null : Math.round(Number(attemptRow.averageTime)),
      questionsAnswered: answered,
      accuracy: answered === 0 ? null : round2((correct / answered) * 100),
      inWindow: Number(windowRow?.[0]?.value ?? 0),
      inPreviousWindow: Number(previousWindowRow?.[0]?.value ?? 0),
    },
    timeline,
    quizPerformance,
    categories: categoryAnalytics,
  };
}
