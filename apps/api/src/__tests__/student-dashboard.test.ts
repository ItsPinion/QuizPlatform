import { randomUUID } from 'node:crypto';

import type { StudentDashboard } from '@quiz/shared/dashboard';
import { db, schema } from '@quiz/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

const createdAttemptIds: string[] = [];

afterAll(async () => {
  if (createdAttemptIds.length > 0) {
    await db.delete(schema.attempts).where(inArray(schema.attempts.id, createdAttemptIds));
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

const rahul = () => cookieFor('rahul@quiz.dev', 'Password123');
const priya = () => cookieFor('priya@quiz.dev', 'Password123');
const adminCookie = () => cookieFor('admin@quiz.dev', 'Admin12345');

async function userIdFor(email: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!row) throw new Error(`missing seeded user ${email}`);
  return row.id;
}

async function dashboard(cookie: string) {
  const res = await app.request('/api/student/dashboard', {
    headers: { cookie },
  });

  return { res, body: (await res.json()) as StudentDashboard };
}

/** Insert a fresh graded attempt so the arithmetic can be checked exactly. */
async function insertGradedAttempt(options: {
  email?: string;
  status: 'PASSED' | 'FAILED' | 'IN_PROGRESS';
  percentage: number;
  correct: number;
  incorrect: number;
  unanswered?: number;
  timeTaken?: number;
  completedAt?: Date;
}) {
  const userId = await userIdFor(options.email ?? 'priya@quiz.dev');

  const [quiz] = await db
    .select({ id: schema.quizzes.id })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.slug, 'css-essentials'))
    .limit(1);

  if (!quiz) throw new Error('missing seeded quiz');

  const id = randomUUID();
  const startedAt = new Date((options.completedAt ?? new Date()).getTime() - 600_000);

  createdAttemptIds.push(id);

  await db.insert(schema.attempts).values({
    id,
    quizId: quiz.id,
    userId,
    score: Math.round(options.percentage / 10),
    totalMarks: 10,
    percentage: options.percentage,
    correctAnswers: options.correct,
    incorrectAnswers: options.incorrect,
    unanswered: options.unanswered ?? 0,
    timeTakenSeconds: options.timeTaken ?? 600,
    status: options.status,
    startedAt,
    expiresAt: new Date(startedAt.getTime() + 1_200_000),
    completedAt: options.status === 'IN_PROGRESS' ? null : (options.completedAt ?? new Date()),
  });

  return id;
}

describe('GET /api/student/dashboard', () => {
  it('reports the six spec statistics from the database', async () => {
    const cookie = await priya();
    const userId = await userIdFor('priya@quiz.dev');

    const { res, body } = await dashboard(cookie);
    expect(res.status).toBe(200);

    const rows = await db
      .select({
        quizId: schema.attempts.quizId,
        status: schema.attempts.status,
        percentage: schema.attempts.percentage,
        correct: schema.attempts.correctAnswers,
        incorrect: schema.attempts.incorrectAnswers,
        time: schema.attempts.timeTakenSeconds,
      })
      .from(schema.attempts)
      .where(eq(schema.attempts.userId, userId));

    const graded = rows.filter((row) => row.status === 'PASSED' || row.status === 'FAILED');

    expect(body.totals.attempts).toBe(rows.length);
    expect(body.totals.quizzesAttempted).toBe(new Set(rows.map((row) => row.quizId)).size);
    expect(body.totals.passed).toBe(rows.filter((row) => row.status === 'PASSED').length);
    expect(body.totals.failed).toBe(rows.filter((row) => row.status === 'FAILED').length);
    expect(body.totals.inProgress).toBe(rows.filter((row) => row.status === 'IN_PROGRESS').length);

    const percentages = graded.map((row) => row.percentage);
    const average =
      percentages.reduce((sum, value) => sum + value, 0) / Math.max(1, percentages.length);

    expect(body.totals.averagePercentage).toBeCloseTo(Math.round(average * 100) / 100, 2);
    expect(body.totals.bestPercentage).toBe(Math.max(...percentages));
    expect(body.totals.worstPercentage).toBe(Math.min(...percentages));

    expect(body.totals.questionsAnswered).toBe(
      rows.reduce((sum, row) => sum + row.correct + row.incorrect, 0),
    );
    expect(body.totals.questionsCorrect).toBe(rows.reduce((sum, row) => sum + row.correct, 0));
    expect(body.totals.timeSpentSeconds).toBe(graded.reduce((sum, row) => sum + row.time, 0));

    // Published catalogue size, for the "x of y quizzes" line.
    const [published] = await db
      .select({ value: schema.quizzes.id })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.status, 'PUBLISHED'));

    expect(published).toBeTruthy();
    expect(body.totals.quizzesAvailable).toBeGreaterThan(0);
    expect(body.totals.quizzesAttempted).toBeLessThanOrEqual(body.totals.quizzesAvailable);
  });

  it('keeps scores and rates inside their ranges', async () => {
    const { body } = await dashboard(await rahul());

    expect(body.totals.averagePercentage).not.toBeNull();
    expect(body.totals.averagePercentage).toBeGreaterThanOrEqual(0);
    expect(body.totals.averagePercentage).toBeLessThanOrEqual(100);
    expect(body.totals.passRate).toBeGreaterThanOrEqual(0);
    expect(body.totals.passRate).toBeLessThanOrEqual(100);
    expect(body.totals.accuracy).toBeGreaterThanOrEqual(0);
    expect(body.totals.accuracy).toBeLessThanOrEqual(100);

    expect(body.streak.current).toBeGreaterThanOrEqual(0);
    expect(body.streak.best).toBeGreaterThanOrEqual(body.streak.current);
  });

  it('builds a chronological trend of the last twelve graded attempts', async () => {
    const { body } = await dashboard(await priya());

    expect(body.trend.length).toBeGreaterThan(0);
    expect(body.trend.length).toBeLessThanOrEqual(12);

    const dates = body.trend.map((point) => Date.parse(point.completedAt));
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);

    for (const point of body.trend) {
      expect(point.quizTitle.length).toBeGreaterThan(0);
      expect(point.percentage).toBeGreaterThanOrEqual(0);
      expect(point.percentage).toBeLessThanOrEqual(100);
      expect(typeof point.passed).toBe('boolean');
    }
  });

  it('aggregates per category and sorts by name', async () => {
    const { body } = await dashboard(await priya());

    expect(body.categories.length).toBeGreaterThan(0);

    const names = body.categories.map((category) => category.categoryName);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);

    for (const category of body.categories) {
      expect(category.attempts).toBeGreaterThan(0);
      expect(category.passed + category.failed).toBe(category.attempts);
      expect(category.averagePercentage).toBeGreaterThanOrEqual(0);
      expect(category.averagePercentage).toBeLessThanOrEqual(100);
      expect(category.bestPercentage).toBeGreaterThanOrEqual(category.averagePercentage);
    }

    const totalAttempts = body.categories.reduce((sum, category) => sum + category.attempts, 0);
    expect(totalAttempts).toBe(body.totals.passed + body.totals.failed);
  });

  it('zero-fills a fourteen-day activity window ending today', async () => {
    const { body } = await dashboard(await priya());

    expect(body.activity).toHaveLength(14);

    const dates = body.activity.map((day) => day.date);
    expect([...dates].sort()).toEqual(dates);

    const today = new Date().toISOString().slice(0, 10);
    expect(dates.at(-1)).toBe(today);

    for (const day of body.activity) {
      expect(day.attempts).toBeGreaterThanOrEqual(0);
      expect(day.label.length).toBeGreaterThan(0);
    }
  });

  it('includes the newest attempts in `recent`, newest first', async () => {
    const cookie = await priya();
    const { body } = await dashboard(cookie);

    expect(body.recent.length).toBeGreaterThan(0);
    expect(body.recent.length).toBeLessThanOrEqual(5);

    const dates = body.recent.map((attempt) => Date.parse(attempt.startedAt));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it('counts a fresh graded attempt immediately', async () => {
    const cookie = await priya();
    const before = await dashboard(cookie);
    const completedAt = new Date(Date.now() - 60_000);

    const attemptId = await insertGradedAttempt({
      status: 'PASSED',
      percentage: 90,
      correct: 9,
      incorrect: 1,
      timeTaken: 300,
      completedAt,
    });

    const after = await dashboard(cookie);

    expect(after.body.totals.attempts).toBe(before.body.totals.attempts + 1);
    expect(after.body.totals.passed).toBe(before.body.totals.passed + 1);
    expect(after.body.totals.questionsAnswered).toBe(before.body.totals.questionsAnswered + 10);
    expect(after.body.totals.timeSpentSeconds).toBe(before.body.totals.timeSpentSeconds + 300);
    expect(after.body.recent.some((attempt) => attempt.id === attemptId)).toBe(true);
    expect(after.body.trend.some((point) => point.attemptId === attemptId)).toBe(true);
  });

  it('does not let an in-progress attempt drag the averages down', async () => {
    const cookie = await priya();
    const before = await dashboard(cookie);

    await insertGradedAttempt({
      status: 'IN_PROGRESS',
      percentage: 0,
      correct: 0,
      incorrect: 0,
      timeTaken: 0,
    });

    const after = await dashboard(cookie);

    expect(after.body.totals.attempts).toBe(before.body.totals.attempts + 1);
    expect(after.body.totals.inProgress).toBe(before.body.totals.inProgress + 1);
    expect(after.body.totals.averagePercentage).toBe(before.body.totals.averagePercentage);
    expect(after.body.totals.passRate).toBe(before.body.totals.passRate);
    expect(after.body.totals.worstPercentage).toBe(before.body.totals.worstPercentage);
    expect(after.body.trend.some((point) => point.percentage === 0 && !point.passed)).toBe(false);
  });

  it('settles a timed-out attempt before reporting', async () => {
    const cookie = await priya();

    const [quiz] = await db
      .select({ id: schema.quizzes.id })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.slug, 'sql-databases'))
      .limit(1);

    if (!quiz) throw new Error('missing seeded quiz');

    const started = await app.request(`/api/student/quizzes/${quiz.id}/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
    });

    expect(started.status).toBe(201);

    const { attemptId } = (await started.json()) as { attemptId: string };
    createdAttemptIds.push(attemptId);

    const live = await dashboard(cookie);
    expect(live.body.totals.inProgress).toBeGreaterThanOrEqual(1);

    await db
      .update(schema.attempts)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.attempts.id, attemptId));

    const settled = await dashboard(cookie);

    expect(settled.body.totals.inProgress).toBe(live.body.totals.inProgress - 1);
    expect(settled.body.totals.failed + settled.body.totals.passed).toBeGreaterThan(
      live.body.totals.failed + live.body.totals.passed,
    );

    const row = settled.body.recent.find((attempt) => attempt.id === attemptId);
    expect(row?.autoSubmitted).toBe(true);
  });

  it('is scoped to the caller', async () => {
    const rahulId = await userIdFor('rahul@quiz.dev');
    const priyaId = await userIdFor('priya@quiz.dev');

    const rahulRows = await db
      .select({ id: schema.attempts.id })
      .from(schema.attempts)
      .where(eq(schema.attempts.userId, rahulId))
      .orderBy(asc(schema.attempts.startedAt));

    const priyaRows = await db
      .select({ id: schema.attempts.id })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.userId, priyaId)))
      .orderBy(asc(schema.attempts.startedAt));

    const { body } = await dashboard(await rahul());
    const recentIds = body.recent.map((attempt) => attempt.id);
    const priyaIds = new Set(priyaRows.map((row) => row.id));

    expect(rahulRows.length).toBeGreaterThan(0);
    expect(recentIds.some((id) => priyaIds.has(id))).toBe(false);
  });

  it('refuses an admin and an anonymous caller', async () => {
    const admin = await app.request('/api/student/dashboard', {
      headers: { cookie: await adminCookie() },
    });
    expect(admin.status).toBe(403);

    const anonymous = await app.request('/api/student/dashboard');
    expect(anonymous.status).toBe(401);
  });
});

describe('dashboard for a student with no attempts', () => {
  it('returns zeros and nulls instead of NaN', async () => {
    const email = `empty-${randomUUID()}@quiz.dev`;

    const registered = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Empty Student', email, password: 'Secret12345' }),
    });

    expect(registered.status).toBe(201);

    const cookie = registered.headers
      .getSetCookie()
      .find((value) => value.startsWith('quiz_session='))
      ?.split(';')[0];

    if (!cookie) throw new Error('registration did not issue a cookie');

    const res = await app.request('/api/student/dashboard', { headers: { cookie } });
    expect(res.status).toBe(200);

    const body = (await res.json()) as StudentDashboard;

    expect(body.totals).toMatchObject({
      attempts: 0,
      quizzesAttempted: 0,
      passed: 0,
      failed: 0,
      inProgress: 0,
      averagePercentage: null,
      bestPercentage: null,
      worstPercentage: null,
      passRate: null,
      questionsAnswered: 0,
      accuracy: null,
      timeSpentSeconds: 0,
      averageTimeSeconds: null,
    });
    expect(body.trend).toEqual([]);
    expect(body.categories).toEqual([]);
    expect(body.recent).toEqual([]);
    expect(body.streak).toEqual({ current: 0, best: 0 });
    expect(body.activity).toHaveLength(14);
    expect(body.activity.every((day) => day.attempts === 0)).toBe(true);
    expect(body.totals.quizzesAvailable).toBeGreaterThan(0);
  });
});
