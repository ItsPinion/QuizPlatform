import { count, desc, eq, sql } from 'drizzle-orm';

import type { DashboardStats, RecentAttempt } from '@quiz/shared/admin';
import { db, schema } from '@quiz/db';

const { attempts, categories, options, questions, quizzes, users } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Round to one decimal so the UI never shows `66.66666666666666`. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Every number on the admin dashboard, read in a fixed set of aggregate
 * queries rather than one-request-per-card.
 *
 * Definitions matter more than the SQL: `passRate` is over graded attempts
 * (PASSED + FAILED + EXPIRED), `averagePercentage` uses the stored value the
 * grading step produced, and `learners` counts distinct users with an attempt.
 */
export async function buildDashboardStats(now = new Date()): Promise<DashboardStats> {
  const sevenDaysAgo = now.getTime() - 7 * DAY_MS;

  const [userRow] = await db
    .select({
      total: count(),
      active:
        sql<number>`coalesce(sum(case when ${users.status} = 'ACTIVE' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      admins:
        sql<number>`coalesce(sum(case when ${users.role} = 'ADMIN' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      joinedLast7Days:
        sql<number>`coalesce(sum(case when ${users.createdAt} >= ${sevenDaysAgo} then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(users);

  const [quizRow] = await db
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
    .from(quizzes);

  const [attemptRow] = await db
    .select({
      total: count(),
      inProgress:
        sql<number>`coalesce(sum(case when ${attempts.status} = 'IN_PROGRESS' then 1 else 0 end), 0)`.mapWith(
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
      expired:
        sql<number>`coalesce(sum(case when ${attempts.status} = 'EXPIRED' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      learners: sql<number>`count(distinct ${attempts.userId})`.mapWith(Number),
      averagePercentage: sql<
        number | null
      >`avg(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then ${attempts.percentage} end)`.mapWith(
        Number,
      ),
    })
    .from(attempts);

  const [categoryRow] = await db.select({ value: count() }).from(categories);
  const [questionRow] = await db.select({ value: count() }).from(questions);
  const [optionRow] = await db.select({ value: count() }).from(options);

  const recentUserRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(5);

  const recentAttemptRows = await db
    .select({
      id: attempts.id,
      userName: users.name,
      quizTitle: quizzes.title,
      status: attempts.status,
      percentage: attempts.percentage,
      startedAt: attempts.startedAt,
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .orderBy(desc(attempts.startedAt))
    .limit(5);

  const usersTotal = Number(userRow?.total ?? 0);
  const active = Number(userRow?.active ?? 0);
  const admins = Number(userRow?.admins ?? 0);
  const passed = Number(attemptRow?.passed ?? 0);
  const failed = Number(attemptRow?.failed ?? 0);
  const expired = Number(attemptRow?.expired ?? 0);
  const graded = passed + failed + expired;

  return {
    generatedAt: now.toISOString(),
    users: {
      total: usersTotal,
      active,
      inactive: usersTotal - active,
      admins,
      students: usersTotal - admins,
      joinedLast7Days: Number(userRow?.joinedLast7Days ?? 0),
    },
    content: {
      categories: Number(categoryRow?.value ?? 0),
      quizzes: Number(quizRow?.total ?? 0),
      published: Number(quizRow?.published ?? 0),
      drafts: Number(quizRow?.drafts ?? 0),
      unpublished: Number(quizRow?.unpublished ?? 0),
      questions: Number(questionRow?.value ?? 0),
      options: Number(optionRow?.value ?? 0),
    },
    attempts: {
      total: Number(attemptRow?.total ?? 0),
      inProgress: Number(attemptRow?.inProgress ?? 0),
      passed,
      failed,
      expired,
      learners: Number(attemptRow?.learners ?? 0),
      averagePercentage: round1(Number(attemptRow?.averagePercentage ?? 0)),
      passRate: graded === 0 ? 0 : round1((passed / graded) * 100),
    },
    recentUsers: recentUserRows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    })),
    recentAttempts: recentAttemptRows.map((row): RecentAttempt => ({
      id: row.id,
      userName: row.userName,
      quizTitle: row.quizTitle,
      status: row.status,
      percentage: row.percentage,
      startedAt: row.startedAt.toISOString(),
    })),
  };
}
