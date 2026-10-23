import { randomUUID } from 'node:crypto';

import type { LeaderboardResponse } from '@quiz/shared/leaderboard';
import { db, schema } from '@quiz/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

const createdAttemptIds: string[] = [];
const createdQuizIds: string[] = [];
const createdCategoryIds: string[] = [];

afterAll(async () => {
  if (createdAttemptIds.length > 0) {
    await db.delete(schema.attempts).where(inArray(schema.attempts.id, createdAttemptIds));
  }
  if (createdQuizIds.length > 0) {
    await db.delete(schema.quizzes).where(inArray(schema.quizzes.id, createdQuizIds));
  }
  if (createdCategoryIds.length > 0) {
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
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

const rahulCookie = () => cookieFor('rahul@quiz.dev', 'Password123');
const adminCookie = () => cookieFor('admin@quiz.dev', 'Admin12345');

async function board(query = '', cookie?: string) {
  const res = await app.request(`/api/leaderboard${query}`, {
    headers: { cookie: cookie ?? (await rahulCookie()) },
  });

  return { res, body: (await res.json()) as LeaderboardResponse };
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

async function quizFor(slug: string): Promise<{ id: string; categoryId: string }> {
  const [row] = await db
    .select({ id: schema.quizzes.id, categoryId: schema.quizzes.categoryId })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.slug, slug))
    .limit(1);

  if (!row) throw new Error(`missing seeded quiz ${slug}`);
  return row;
}

async function insertAttempt(options: {
  email: string;
  slug: string;
  status: 'PASSED' | 'FAILED' | 'IN_PROGRESS';
  percentage: number;
  completedAt?: Date;
}) {
  const userId = await userIdFor(options.email);
  const quiz = await quizFor(options.slug);
  const completedAt = options.completedAt ?? new Date();
  const startedAt = new Date(completedAt.getTime() - 10 * 60 * 1000);
  const id = randomUUID();

  await db.insert(schema.attempts).values({
    id,
    quizId: quiz.id,
    userId,
    status: options.status,
    percentage: options.percentage,
    score: 1,
    totalMarks: 5,
    correctAnswers: options.status === 'PASSED' ? 5 : 1,
    incorrectAnswers: options.status === 'PASSED' ? 0 : 4,
    unanswered: 0,
    timeTakenSeconds: 420,
    startedAt,
    expiresAt: new Date(startedAt.getTime() + 30 * 60_000),
    completedAt: options.status === 'IN_PROGRESS' ? null : completedAt,
  });

  createdAttemptIds.push(id);
  return { id, quizId: quiz.id, categoryId: quiz.categoryId };
}

/** Recompute a candidate's expected numbers straight from the attempt rows. */
async function expectedFor(email: string) {
  const userId = await userIdFor(email);
  const rows = await db
    .select({
      status: schema.attempts.status,
      percentage: schema.attempts.percentage,
      quizId: schema.attempts.quizId,
    })
    .from(schema.attempts)
    .where(eq(schema.attempts.userId, userId));

  const graded = rows.filter((row) => row.status === 'PASSED' || row.status === 'FAILED');

  return {
    attempts: graded.length,
    quizzesCompleted: new Set(graded.map((row) => row.quizId)).size,
    averagePercentage:
      graded.length === 0
        ? 0
        : Math.round((graded.reduce((sum, row) => sum + row.percentage, 0) / graded.length) * 100) /
          100,
    bestPercentage: graded.length === 0 ? 0 : Math.max(...graded.map((row) => row.percentage)),
    passed: graded.filter((row) => row.status === 'PASSED').length,
    failed: graded.filter((row) => row.status === 'FAILED').length,
  };
}

describe('GET /api/leaderboard', () => {
  it('returns a ranked board that agrees with the attempt rows', async () => {
    const { res, body } = await board();

    expect(res.status).toBe(200);
    expect(body.metric).toBe('average');
    expect(body.period).toBe('all');
    expect(body.scope).toEqual({ type: 'overall', categoryId: null, categoryName: null });

    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.totals.participants).toBe(body.entries.length);
    expect(body.totals.attempts).toBeGreaterThan(0);

    for (let index = 0; index < body.entries.length; index += 1) {
      const entry = body.entries[index];
      if (!entry) continue;

      expect(entry.averagePercentage).toBeGreaterThanOrEqual(0);
      expect(entry.averagePercentage).toBeLessThanOrEqual(100);
      expect(entry.bestPercentage).toBeGreaterThanOrEqual(entry.averagePercentage);
      expect(entry.passed + entry.failed).toBe(entry.attempts);
      expect(entry.quizzesCompleted).toBeLessThanOrEqual(entry.attempts);
      expect(entry.passRate).toBe(
        entry.attempts === 0 ? null : Math.round((entry.passed / entry.attempts) * 10_000) / 100,
      );

      if (index > 0) {
        const previous = body.entries[index - 1];
        expect((previous?.averagePercentage ?? 0) >= entry.averagePercentage).toBe(true);
        expect(entry.rank).toBeGreaterThanOrEqual(previous?.rank ?? 0);
      }
    }

    // No email addresses on a public ranking.
    expect(JSON.stringify(body)).not.toContain('@quiz.dev');
  });

  it('matches each student’s own aggregates', async () => {
    const { body } = await board();

    for (const email of ['rahul@quiz.dev', 'priya@quiz.dev', 'amit@quiz.dev']) {
      const expected = await expectedFor(email);
      const id = await userIdFor(email);
      const found = body.entries.find((candidate) => candidate.userId === id);

      expect(found).toBeDefined();
      expect(found).toMatchObject({
        attempts: expected.attempts,
        quizzesCompleted: expected.quizzesCompleted,
        averagePercentage: expected.averagePercentage,
        bestPercentage: expected.bestPercentage,
        passed: expected.passed,
        failed: expected.failed,
      });
    }
  });

  it('marks the caller and gives them their rank even outside the slice', async () => {
    const cookie = await rahulCookie();
    const full = await board('?limit=50', cookie);
    const mine = full.body.entries.find((entry) => entry.isCurrentUser);

    expect(mine).toBeDefined();
    expect(full.body.currentUser?.userId).toBe(mine?.userId);

    const sliced = await board('?limit=1', cookie);
    expect(sliced.body.entries).toHaveLength(1);
    // The caller is not necessarily in the visible slice, but still has a row.
    expect(sliced.body.currentUser?.rank).toBe(mine?.rank);
    expect(sliced.body.totals.participants).toBe(full.body.totals.participants);
  });

  it('ranks on best score and completed quizzes', async () => {
    const best = await board('?metric=best');
    expect(best.body.metric).toBe('best');
    for (let index = 1; index < best.body.entries.length; index += 1) {
      const previous = best.body.entries[index - 1];
      const current = best.body.entries[index];
      expect((previous?.bestPercentage ?? 0) >= (current?.bestPercentage ?? 0)).toBe(true);
    }

    const completed = await board('?metric=completed');
    expect(completed.body.metric).toBe('completed');
    for (let index = 1; index < completed.body.entries.length; index += 1) {
      const previous = completed.body.entries[index - 1];
      const current = completed.body.entries[index];
      expect((previous?.quizzesCompleted ?? 0) >= (current?.quizzesCompleted ?? 0)).toBe(true);
    }
    expect(completed.body.entries[0]?.quizzesCompleted).toBeGreaterThanOrEqual(1);
  });

  it('gives tied students the same rank and skips the next number', async () => {
    // A category of our own, so this board contains exactly the rows we insert.
    const categoryId = randomUUID();
    await db.insert(schema.categories).values({
      id: categoryId,
      name: `Tie Fixture ${categoryId.slice(0, 6)}`,
      slug: `tie-fixture-${categoryId.slice(0, 6)}`,
    });
    createdCategoryIds.push(categoryId);

    const quizId = randomUUID();
    await db.insert(schema.quizzes).values({
      id: quizId,
      title: 'Tie Fixture Quiz',
      slug: `tie-fixture-quiz-${quizId.slice(0, 6)}`,
      categoryId,
      durationMinutes: 10,
      passingScore: 60,
      status: 'PUBLISHED',
    });
    createdQuizIds.push(quizId);

    for (const [email, percentage] of [
      ['priya@quiz.dev', 88],
      ['amit@quiz.dev', 88],
      ['rahul@quiz.dev', 70],
    ] as const) {
      const userId = await userIdFor(email);
      const id = randomUUID();

      await db.insert(schema.attempts).values({
        id,
        quizId,
        userId,
        status: percentage >= 60 ? 'PASSED' : 'FAILED',
        percentage,
        score: 4,
        totalMarks: 5,
        correctAnswers: 4,
        incorrectAnswers: 1,
        unanswered: 0,
        timeTakenSeconds: 300,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60_000),
        completedAt: new Date(),
      });
      createdAttemptIds.push(id);
    }

    const { res, body } = await board(`?categoryId=${categoryId}`);

    expect(res.status).toBe(200);
    expect(body.totals.participants).toBe(3);
    expect(body.entries.map((entry) => [entry.name, entry.averagePercentage, entry.rank])).toEqual([
      [expect.any(String), 88, 1],
      [expect.any(String), 88, 1],
      [expect.any(String), 70, 3],
    ]);
    expect(body.entries[0]?.gapToNext).toBe(0);
    expect(body.entries[1]?.gapToNext).toBe(0);
    expect(body.entries[2]?.gapToNext).toBe(18);
  });

  it('filters by category and names the scope', async () => {
    const quiz = await quizFor('css-essentials');
    const { res, body } = await board(`?categoryId=${quiz.categoryId}`);

    expect(res.status).toBe(200);
    expect(body.scope.type).toBe('category');
    expect(body.scope.categoryId).toBe(quiz.categoryId);
    expect(body.scope.categoryName).toBeTruthy();

    // Every attempt in scope belongs to that category, so the numbers differ
    // from the overall board for at least one student.
    const overall = await board();
    const categoryAttempts = body.entries.reduce((sum, entry) => sum + entry.attempts, 0);
    expect(categoryAttempts).toBeLessThan(overall.body.totals.attempts);
  });

  it('404s for a category that does not exist', async () => {
    const { res, body } = await board(`?categoryId=${randomUUID()}`);
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ error: { code: 'CATEGORY_NOT_FOUND' } });
  });

  it('applies a rolling period and keeps the board consistent', async () => {
    const week = await board('?period=week');
    expect(week.body.period).toBe('week');

    for (const entry of week.body.entries) {
      expect(entry.lastAttemptAt).not.toBeNull();
      const completed = Date.parse(entry.lastAttemptAt ?? '');
      expect(Date.now() - completed).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 60_000);
    }

    const month = await board('?period=month');
    expect(month.body.period).toBe('month');
    expect(month.body.totals.attempts).toBeGreaterThanOrEqual(week.body.totals.attempts);

    const all = await board();
    expect(all.body.totals.attempts).toBeGreaterThanOrEqual(month.body.totals.attempts);
  });

  it('omits attempts that are still running', async () => {
    const before = await board();
    await insertAttempt({
      email: 'amit@quiz.dev',
      slug: 'python-programming',
      status: 'IN_PROGRESS',
      percentage: 0,
    });
    const after = await board();

    expect(after.body.totals.attempts).toBe(before.body.totals.attempts);
    expect(after.body.totals.participants).toBe(before.body.totals.participants);

    const amitId = await userIdFor('amit@quiz.dev');
    const beforeAmit = before.body.entries.find((entry) => entry.userId === amitId);
    const afterAmit = after.body.entries.find((entry) => entry.userId === amitId);
    expect(afterAmit?.attempts).toBe(beforeAmit?.attempts);
    expect(afterAmit?.averagePercentage).toBe(beforeAmit?.averagePercentage);
  });

  it('counts a new graded attempt immediately and re-ranks', async () => {
    const before = await board();
    const amitId = await userIdFor('amit@quiz.dev');
    const beforeAmit = before.body.entries.find((entry) => entry.userId === amitId);

    await insertAttempt({
      email: 'amit@quiz.dev',
      slug: 'html-fundamentals',
      status: 'PASSED',
      percentage: 100,
    });

    const after = await board();
    const afterAmit = after.body.entries.find((entry) => entry.userId === amitId);

    expect(after.body.totals.attempts).toBe(before.body.totals.attempts + 1);
    expect(afterAmit?.attempts).toBe((beforeAmit?.attempts ?? 0) + 1);
    expect(afterAmit?.passRate).toBeGreaterThanOrEqual(beforeAmit?.passRate ?? 0);
  });

  it('validates the query', async () => {
    const badCases = [
      '?metric=streak',
      '?period=year',
      '?limit=0',
      '?limit=500',
      '?categoryId=nope',
    ];

    for (const query of badCases) {
      const res = await app.request(`/api/leaderboard${query}`, {
        headers: { cookie: await rahulCookie() },
      });
      expect(res.status).toBe(422);
    }
  });

  it('is visible to both roles but not to anonymous callers', async () => {
    const anonymous = await app.request('/api/leaderboard');
    expect(anonymous.status).toBe(401);

    const asAdmin = await app.request('/api/leaderboard', {
      headers: { cookie: await adminCookie() },
    });
    expect(asAdmin.status).toBe(200);

    const body = (await asAdmin.json()) as LeaderboardResponse;
    // An admin has no attempts, so the board is still the students' board.
    expect(body.currentUser).toBeNull();
    expect(body.entries.every((entry) => !entry.isCurrentUser)).toBe(true);
  });
});
