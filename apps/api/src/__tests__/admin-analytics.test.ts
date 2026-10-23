import { randomUUID } from 'node:crypto';

import type { AdminAnalytics } from '@quiz/shared/analytics';
import { db, schema } from '@quiz/db';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

const createdAttemptIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdAttemptIds.length > 0) {
    await db.delete(schema.attempts).where(inArray(schema.attempts.id, createdAttemptIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  }
});

async function cookieFor(email: string, password: string): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  expect(res.status).toBe(200);

  const cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value?.startsWith('quiz_session='));

  if (!cookie) throw new Error('login did not issue a session cookie');
  return cookie;
}

const adminCookie = () => cookieFor('admin@quiz.dev', 'Admin12345');
const studentCookie = () => cookieFor('rahul@quiz.dev', 'Password123');

async function analytics(path = '/api/admin/analytics') {
  const res = await app.request(path, { headers: { cookie: await adminCookie() } });
  return { res, body: (await res.json()) as AdminAnalytics };
}

async function userIdFor(email: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!row) throw new Error(`missing seeded user ${email}`);
  return row.id;
}

async function quizIdFor(slug: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.quizzes.id })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.slug, slug))
    .limit(1);

  if (!row) throw new Error(`missing seeded quiz ${slug}`);
  return row.id;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Insert an attempt with exactly the numbers the aggregates should echo back. */
async function insertAttempt(options: {
  email?: string;
  slug?: string;
  status: 'PASSED' | 'FAILED' | 'IN_PROGRESS' | 'EXPIRED';
  percentage?: number;
  correct?: number;
  incorrect?: number;
  timeTaken?: number;
  startedAt?: Date;
  expiresAt?: Date;
}) {
  const userId = await userIdFor(options.email ?? 'priya@quiz.dev');
  const quizId = await quizIdFor(options.slug ?? 'css-essentials');
  const now = Date.now();
  const startedAt = options.startedAt ?? new Date(now);
  const id = randomUUID();

  await db.insert(schema.attempts).values({
    id,
    quizId,
    userId,
    status: options.status,
    percentage: options.percentage ?? 0,
    score: 1,
    totalMarks: 5,
    correctAnswers: options.correct ?? 0,
    incorrectAnswers: options.incorrect ?? 0,
    unanswered: 0,
    timeTakenSeconds: options.timeTaken ?? 60,
    startedAt,
    expiresAt: options.expiresAt ?? new Date(startedAt.getTime() + 30 * 60_000),
    completedAt: options.status === 'IN_PROGRESS' ? null : new Date(startedAt.getTime() + 60_000),
  });

  createdAttemptIds.push(id);
  return id;
}

async function insertStudent(createdAt = new Date()) {
  const id = randomUUID();
  const email = `analytics-${id.slice(0, 8)}@quiz.dev`;

  await db.insert(schema.users).values({
    id,
    name: 'Analytics Fixture',
    email,
    passwordHash: 'scrypt$fixture',
    role: 'STUDENT',
    status: 'ACTIVE',
    createdAt,
    updatedAt: createdAt,
  });

  createdUserIds.push(id);
  return { id, email };
}

describe('GET /api/admin/analytics', () => {
  it('reports student, quiz and attempt statistics that agree with the database', async () => {
    const { res, body } = await analytics();

    expect(res.status).toBe(200);
    expect(body.windowDays).toBe(30);

    const [studentRow] = await db
      .select({ value: count() })
      .from(schema.users)
      .where(eq(schema.users.role, 'STUDENT'));

    const [quizRow] = await db
      .select({
        total: count(),
        published:
          sql<number>`coalesce(sum(case when ${schema.quizzes.status} = 'PUBLISHED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(schema.quizzes);

    const [attemptRow] = await db
      .select({
        total: count(),
        passed:
          sql<number>`coalesce(sum(case when ${schema.attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        failed:
          sql<number>`coalesce(sum(case when ${schema.attempts.status} = 'FAILED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        learners: sql<number>`count(distinct ${schema.attempts.userId})`.mapWith(Number),
      })
      .from(schema.attempts);

    expect(body.students.total).toBe(Number(studentRow?.value));
    expect(body.students.active).toBeLessThanOrEqual(body.students.total);
    expect(body.students.inactive).toBe(body.students.total - body.students.active);
    expect(body.students.activeLearners).toBe(Number(attemptRow?.learners));
    expect(body.quizzes.total).toBe(Number(quizRow?.total));
    expect(body.quizzes.published).toBe(Number(quizRow?.published));
    expect(body.quizzes.drafts + body.quizzes.published + body.quizzes.unpublished).toBe(
      body.quizzes.total,
    );
    expect(body.attempts.total).toBe(Number(attemptRow?.total));
    expect(body.attempts.passed).toBe(Number(attemptRow?.passed));
    expect(body.attempts.failed).toBe(Number(attemptRow?.failed));
  });

  it('adds the status buckets up and keeps every rate in range', async () => {
    const { body } = await analytics();

    expect(body.attempts.passed + body.attempts.failed + body.attempts.expired).toBe(
      body.attempts.graded + body.attempts.expired,
    );
    expect(
      body.attempts.passed +
        body.attempts.failed +
        body.attempts.expired +
        body.attempts.inProgress,
    ).toBe(body.attempts.total);

    for (const value of [body.attempts.passRate, body.attempts.averagePercentage]) {
      if (value != null) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }

    if (body.attempts.accuracy != null) {
      expect(body.attempts.accuracy).toBeGreaterThanOrEqual(0);
      expect(body.attempts.accuracy).toBeLessThanOrEqual(100);
    }

    expect(body.attempts.passRate).toBe(
      body.attempts.passed + body.attempts.failed === 0
        ? null
        : Math.round(
            (body.attempts.passed / (body.attempts.passed + body.attempts.failed)) * 10_000,
          ) / 100,
    );

    expect(body.students.attemptsPerLearner).toBe(
      body.students.activeLearners === 0
        ? null
        : Math.round((body.attempts.total / body.students.activeLearners) * 10) / 10,
    );
    expect(body.quizzes.attempted + body.quizzes.neverAttempted).toBe(body.quizzes.total);
  });

  it('zero-fills the timeline and ends it today', async () => {
    const { body } = await analytics();

    expect(body.timeline).toHaveLength(30);

    const dates = body.timeline.map((point) => point.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);

    const today = new Date().toISOString().slice(0, 10);
    expect(dates[dates.length - 1]).toBe(today);

    for (const point of body.timeline) {
      expect(point.attempts).toBeGreaterThanOrEqual(0);
      expect(point.registrations).toBeGreaterThanOrEqual(0);
      expect(point.label).toMatch(/^\d{1,2} [A-Z][a-z]{2,3}$/);
      if (point.averagePercentage != null) {
        expect(point.averagePercentage).toBeGreaterThanOrEqual(0);
        expect(point.averagePercentage).toBeLessThanOrEqual(100);
      }
    }

    expect(body.timeline.reduce((sum, point) => sum + point.attempts, 0)).toBe(
      body.attempts.inWindow,
    );
  });

  it('honours the window and validates it', async () => {
    for (const days of [7, 14, 30, 90]) {
      const { res, body } = await analytics(`/api/admin/analytics?days=${days}`);
      expect(res.status).toBe(200);
      expect(body.windowDays).toBe(days);
      expect(body.timeline).toHaveLength(days);
    }

    const invalid = await app.request('/api/admin/analytics?days=365', {
      headers: { cookie: await adminCookie() },
    });
    expect(invalid.status).toBe(422);

    const empty = await app.request('/api/admin/analytics?days=', {
      headers: { cookie: await adminCookie() },
    });
    expect(empty.status).toBe(200);
  });

  it('ranks quizzes by attempts with a pass rate and a last-attempt date', async () => {
    const { body } = await analytics();

    expect(body.quizPerformance.length).toBeGreaterThan(0);

    const attempts = body.quizPerformance.reduce((sum, row) => sum + row.attempts, 0);
    expect(attempts).toBe(body.attempts.total);

    for (let index = 1; index < body.quizPerformance.length; index += 1) {
      const previous = body.quizPerformance[index - 1];
      const current = body.quizPerformance[index];
      expect((previous?.attempts ?? 0) >= (current?.attempts ?? 0)).toBe(true);
    }

    for (const row of body.quizPerformance) {
      expect(row.attempts).toBeGreaterThan(0);
      expect(row.learners).toBeLessThanOrEqual(row.attempts);
      expect(row.slug.length).toBeGreaterThan(0);
      expect(row.categoryName.length).toBeGreaterThan(0);
      if (row.averagePercentage != null) {
        expect(row.averagePercentage).toBeGreaterThanOrEqual(0);
        expect(row.averagePercentage).toBeLessThanOrEqual(100);
      }
      if (row.passRate != null) {
        expect(row.passRate).toBeGreaterThanOrEqual(0);
        expect(row.passRate).toBeLessThanOrEqual(100);
      }
      expect(row.lastAttemptAt).not.toBeNull();
      expect(Number.isNaN(Date.parse(row.lastAttemptAt ?? ''))).toBe(false);
    }
  });

  it('summarises every category, including the quiet ones', async () => {
    const { body } = await analytics();

    const [categoryRow] = await db.select({ value: count() }).from(schema.categories);
    expect(body.categories).toHaveLength(Number(categoryRow?.value));

    expect(body.categories.reduce((sum, row) => sum + row.attempts, 0)).toBe(body.attempts.total);

    const names = body.categories.map((row) => row.name);
    expect(names.every((name) => name.length > 0)).toBe(true);

    for (let index = 1; index < body.categories.length; index += 1) {
      const previous = body.categories[index - 1];
      const current = body.categories[index];
      expect((previous?.attempts ?? 0) >= (current?.attempts ?? 0)).toBe(true);
    }

    for (const row of body.categories) {
      expect(row.quizzes).toBeGreaterThanOrEqual(0);
      if (row.attempts === 0) {
        expect(row.averagePercentage).toBeNull();
        expect(row.passRate).toBeNull();
      } else if (row.passRate != null) {
        expect(row.passRate).toBeGreaterThanOrEqual(0);
        expect(row.passRate).toBeLessThanOrEqual(100);
      }
    }

    // Each category's quiz count matches the quizzes table.
    const quizCounts = await db
      .select({ categoryId: schema.quizzes.categoryId, value: count() })
      .from(schema.quizzes)
      .groupBy(schema.quizzes.categoryId);

    const byCategory = new Map(quizCounts.map((row) => [row.categoryId, Number(row.value)]));
    for (const row of body.categories) {
      expect(row.quizzes).toBe(byCategory.get(row.categoryId) ?? 0);
    }
  });

  it('counts a new attempt on the next request', async () => {
    const before = await analytics();
    const id = await insertAttempt({
      status: 'PASSED',
      percentage: 100,
      correct: 5,
      timeTaken: 300,
    });
    const after = await analytics();

    expect(after.body.attempts.total).toBe(before.body.attempts.total + 1);
    expect(after.body.attempts.passed).toBe(before.body.attempts.passed + 1);
    expect(after.body.attempts.inWindow).toBe(before.body.attempts.inWindow + 1);

    const today = after.body.timeline[after.body.timeline.length - 1];
    const todayBefore = before.body.timeline[before.body.timeline.length - 1];
    expect(today?.attempts).toBe((todayBefore?.attempts ?? 0) + 1);

    const row = after.body.quizPerformance.find((entry) => entry.slug === 'css-essentials');
    const rowBefore = before.body.quizPerformance.find((entry) => entry.slug === 'css-essentials');
    expect(row?.attempts).toBe((rowBefore?.attempts ?? 0) + 1);

    await db.delete(schema.attempts).where(eq(schema.attempts.id, id));
  });

  it('does not let an in-progress attempt move the averages', async () => {
    const before = await analytics();
    const id = await insertAttempt({ status: 'IN_PROGRESS' });
    const after = await analytics();

    expect(after.body.attempts.total).toBe(before.body.attempts.total + 1);
    expect(after.body.attempts.inProgress).toBe(before.body.attempts.inProgress + 1);
    expect(after.body.attempts.averagePercentage).toBe(before.body.attempts.averagePercentage);
    expect(after.body.attempts.passRate).toBe(before.body.attempts.passRate);
    expect(after.body.attempts.graded).toBe(before.body.attempts.graded);

    await db.delete(schema.attempts).where(eq(schema.attempts.id, id));
  });

  it('settles a timed-out attempt before counting it', async () => {
    const before = await analytics();

    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const id = await insertAttempt({
      status: 'IN_PROGRESS',
      startedAt,
      expiresAt: new Date(startedAt.getTime() + 15 * 60_000),
    });

    const { body } = await analytics();

    const [row] = await db
      .select({ status: schema.attempts.status })
      .from(schema.attempts)
      .where(eq(schema.attempts.id, id));

    expect(row?.status).not.toBe('IN_PROGRESS');
    expect(['PASSED', 'FAILED']).toContain(row?.status);

    // The row was swept, so it counts as graded rather than lingering as live.
    expect(body.attempts.total).toBe(before.body.attempts.total + 1);
    expect(body.attempts.graded).toBe(before.body.attempts.graded + 1);
    expect(body.attempts.inProgress).toBe(before.body.attempts.inProgress);
  });

  it('counts registrations per day and against the previous window', async () => {
    const before = await analytics();
    const todayKey = new Date().toISOString().slice(0, 10);

    const { id } = await insertStudent();
    const after = await analytics();

    expect(after.body.students.total).toBe(before.body.students.total + 1);
    expect(after.body.students.newInWindow).toBe(before.body.students.newInWindow + 1);

    const today = after.body.timeline.find((point) => point.date === todayKey);
    const todayBefore = before.body.timeline.find((point) => point.date === todayKey);
    expect(today?.registrations).toBe((todayBefore?.registrations ?? 0) + 1);

    await db.delete(schema.users).where(eq(schema.users.id, id));
  });

  it('keeps the previous window separate from the current one', async () => {
    const { body } = await analytics('/api/admin/analytics?days=7');
    const [previousRow] = await db
      .select({ value: count() })
      .from(schema.attempts)
      .where(
        and(
          sql`${schema.attempts.startedAt} >= ${Date.now() - 13 * DAY_MS}`,
          sql`${schema.attempts.startedAt} < ${Date.now() - 6 * DAY_MS}`,
        ),
      );

    expect(body.attempts.inPreviousWindow).toBe(Number(previousRow?.value));
    expect(body.attempts.inWindow).toBeGreaterThanOrEqual(0);
  });

  it('is admin-only', async () => {
    const anonymous = await app.request('/api/admin/analytics');
    expect(anonymous.status).toBe(401);

    const student = await app.request('/api/admin/analytics', {
      headers: { cookie: await studentCookie() },
    });
    expect(student.status).toBe(403);
  });
});
