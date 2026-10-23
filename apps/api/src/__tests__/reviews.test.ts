import { randomUUID } from 'node:crypto';

import type { AttemptHistoryResponse, AttemptReview } from '@quiz/shared/review';
import { db, schema } from '@quiz/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

/** Attempts created by this suite are removed again (answers cascade). */
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

const priya = () => cookieFor('priya@quiz.dev', 'Password123');
const rahul = () => cookieFor('rahul@quiz.dev', 'Password123');
const adminCookie = () => cookieFor('admin@quiz.dev', 'Admin12345');

function authed(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) },
  };
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function quizBySlug(slug: string) {
  const [row] = await db
    .select({ id: schema.quizzes.id, title: schema.quizzes.title })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.slug, slug))
    .limit(1);

  if (!row) throw new Error(`missing seeded quiz ${slug}`);
  return row;
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

async function paperFor(quizId: string) {
  const questionRows = await db
    .select({ id: schema.questions.id, marks: schema.questions.marks })
    .from(schema.questions)
    .where(eq(schema.questions.quizId, quizId))
    .orderBy(asc(schema.questions.position));

  const optionRows = await db
    .select({
      id: schema.options.id,
      questionId: schema.options.questionId,
      isCorrect: schema.options.isCorrect,
    })
    .from(schema.options)
    .where(
      inArray(
        schema.options.questionId,
        questionRows.map((question) => question.id),
      ),
    );

  return questionRows.map((question) => {
    const options = optionRows.filter((option) => option.questionId === question.id);
    return {
      id: question.id,
      marks: question.marks,
      correct: options.find((option) => option.isCorrect)?.id ?? null,
      wrong: options.find((option) => !option.isCorrect)?.id ?? null,
    };
  });
}

/**
 * Insert a finished attempt with hand-picked answers.
 *
 * Seeded attempts already carry stored scores; these rows let a test get an
 * exact mix of correct / wrong / blank without spending a student's attempts.
 */
async function finishedAttempt(options: {
  email?: string;
  slug: string;
  answers: ('correct' | 'wrong' | null)[];
}): Promise<{ attemptId: string; quizId: string }> {
  const quiz = await quizBySlug(options.slug);
  const userId = await userIdFor(options.email ?? 'priya@quiz.dev');
  const paper = await paperFor(quiz.id);
  const attemptId = randomUUID();

  createdAttemptIds.push(attemptId);

  const now = Date.now();
  const startedAt = new Date(now - 6 * 60_000);

  await db.insert(schema.attempts).values({
    id: attemptId,
    quizId: quiz.id,
    userId,
    totalMarks: paper.reduce((sum, question) => sum + question.marks, 0),
    status: 'IN_PROGRESS',
    startedAt,
    expiresAt: new Date(now + 10 * 60_000),
  });

  const answerRows = options.answers.flatMap((kind, index) => {
    const question = paper[index];
    if (!question || kind === null) return [];

    const optionId = kind === 'correct' ? question.correct : question.wrong;
    if (!optionId) return [];

    return [
      {
        id: randomUUID(),
        attemptId,
        questionId: question.id,
        selectedOptionId: optionId,
        isCorrect: kind === 'correct',
      },
    ];
  });

  if (answerRows.length > 0) await db.insert(schema.answers).values(answerRows);

  // Grade it exactly the way submission would, then pretend it happened earlier.
  const submitted = await app.request(
    `/api/student/attempts/${attemptId}/submit`,
    authed(await priya(), { method: 'POST' }),
  );

  if (submitted.status !== 200) {
    throw new Error(`submit failed: ${submitted.status} ${await submitted.text()}`);
  }

  return { attemptId, quizId: quiz.id };
}

async function review(cookie: string, attemptId: string) {
  const res = await app.request(`/api/student/attempts/${attemptId}/review`, authed(cookie));
  return { res, body: await json<AttemptReview>(res) };
}

describe('GET /api/student/attempts/:id/review', () => {
  it('returns every question with both answers, the verdict and the explanation', async () => {
    const cookie = await priya();
    const quiz = await quizBySlug('html-fundamentals');
    const paper = await paperFor(quiz.id);

    // First right, second wrong, the rest left blank.
    const answers = paper.map((_, index) =>
      index === 0 ? 'correct' : index === 1 ? 'wrong' : null,
    ) as ('correct' | 'wrong' | null)[];

    const { attemptId } = await finishedAttempt({ slug: 'html-fundamentals', answers });

    const { res, body } = await review(cookie, attemptId);

    expect(res.status).toBe(200);
    expect(body.questions).toHaveLength(paper.length);
    expect(body.counts).toEqual({
      all: paper.length,
      correct: 1,
      incorrect: 1,
      unanswered: paper.length - 2,
    });

    const [first, second, third] = body.questions;

    expect(first?.verdict).toBe('CORRECT');
    expect(first?.selectedOptionId).toBe(first?.correctOptionId);
    expect(first?.earnedMarks).toBe(first?.marks);

    expect(second?.verdict).toBe('INCORRECT');
    expect(second?.selectedOptionId).not.toBe(second?.correctOptionId);
    expect(second?.earnedMarks).toBe(0);

    expect(third?.verdict).toBe('UNANSWERED');
    expect(third?.selectedOptionId).toBeNull();
    expect(third?.correctOptionId).not.toBeNull();

    // Exactly one correct option per question, and it is flagged.
    for (const question of body.questions) {
      expect(question.options.filter((option) => option.isCorrect)).toHaveLength(1);
      expect(question.options.filter((option) => option.selected).length).toBeLessThanOrEqual(1);
    }

    // The explanation is part of the review, and the seeded questions have one.
    expect(body.questions.some((question) => question.explanation)).toBe(true);

    expect(body.result.correctAnswers).toBe(1);
    expect(body.result.incorrectAnswers).toBe(1);
    expect(body.result.unanswered).toBe(paper.length - 2);
    expect(body.quiz.title).toBe('HTML Fundamentals');
    expect(body.attempt.completedAt).toBeTruthy();
  });

  it('marks the picked option and mirrors the stored score', async () => {
    const cookie = await priya();
    const { attemptId } = await finishedAttempt({
      slug: 'css-essentials',
      answers: ['correct', 'correct', 'wrong'],
    });

    const { body } = await review(cookie, attemptId);

    const earned = body.questions.reduce((sum, question) => sum + question.earnedMarks, 0);
    expect(earned).toBe(body.result.score);

    const picked = body.questions.flatMap((question) =>
      question.options.filter((option) => option.selected).map((option) => option.id),
    );
    expect(picked).toHaveLength(3);
    expect(body.questions[0]?.options.find((option) => option.selected)?.text).toBeTruthy();
  });

  it('refuses a review while the attempt is still running', async () => {
    const cookie = await priya();
    const quiz = await quizBySlug('react-basics');

    const start = await app.request(
      `/api/student/quizzes/${quiz.id}/start`,
      authed(cookie, { method: 'POST' }),
    );

    expect(start.status).toBe(201);

    const { attemptId } = await json<{ attemptId: string }>(start);
    createdAttemptIds.push(attemptId);

    const { res, body } = await review(cookie, attemptId);

    expect(res.status).toBe(409);
    expect((body as unknown as { error: { code: string } }).error.code).toBe('ATTEMPT_NOT_ACTIVE');

    const raw = await (
      await app.request(`/api/student/attempts/${attemptId}/review`, authed(cookie))
    ).text();
    expect(raw).not.toContain('isCorrect');
  });

  it('hides the review of another student and 404s an unknown attempt', async () => {
    const { attemptId } = await finishedAttempt({
      slug: 'python-programming',
      answers: ['correct'],
    });

    const stranger = await review(await rahul(), attemptId);
    expect(stranger.res.status).toBe(404);
    expect((stranger.body as unknown as { error: { code: string } }).error.code).toBe(
      'ATTEMPT_NOT_FOUND',
    );

    const missing = await review(await priya(), randomUUID());
    expect(missing.res.status).toBe(404);

    const admin = await review(await adminCookie(), attemptId);
    expect(admin.res.status).toBe(403);

    const malformed = await review(await priya(), 'not-a-uuid');
    expect(malformed.res.status).toBe(422);
  });

  it('reviews a seeded attempt', async () => {
    const cookie = await rahul();
    const userId = await userIdFor('rahul@quiz.dev');

    const [seeded] = await db
      .select({ id: schema.attempts.id })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.userId, userId), eq(schema.attempts.status, 'PASSED')))
      .limit(1);

    if (!seeded) throw new Error('the seed should contain a passed attempt');

    const { res, body } = await review(cookie, seeded.id);

    expect(res.status).toBe(200);
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.counts.all).toBe(body.questions.length);
    expect(body.counts.correct + body.counts.incorrect + body.counts.unanswered).toBe(
      body.counts.all,
    );
  });
});

describe('GET /api/student/attempts', () => {
  it('lists only this student’s attempts, newest first', async () => {
    const cookie = await priya();
    const userId = await userIdFor('priya@quiz.dev');

    const res = await app.request('/api/student/attempts', authed(cookie));
    expect(res.status).toBe(200);

    const body = await json<AttemptHistoryResponse>(res);

    expect(body.attempts.length).toBeGreaterThan(0);
    expect(body.pagination.total).toBeGreaterThanOrEqual(body.attempts.length);
    expect(body.filters).toEqual({ quizId: null, status: null, sort: 'newest' });

    const ids = new Set(
      (
        await db
          .select({ id: schema.attempts.id })
          .from(schema.attempts)
          .where(eq(schema.attempts.userId, userId))
      ).map((row) => row.id),
    );

    for (const attempt of body.attempts) {
      expect(ids.has(attempt.id)).toBe(true);
      expect(attempt.inProgress).toBe(attempt.status === 'IN_PROGRESS');
      expect(attempt.passed).toBe(attempt.status === 'PASSED');
    }

    const dates = body.attempts.map((attempt) => Date.parse(attempt.startedAt));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it('reports totals that agree with the rows', async () => {
    const cookie = await priya();
    const userId = await userIdFor('priya@quiz.dev');

    const body = await json<AttemptHistoryResponse>(
      await app.request('/api/student/attempts?pageSize=50', authed(cookie)),
    );

    const rows = await db
      .select({ id: schema.attempts.id, status: schema.attempts.status })
      .from(schema.attempts)
      .where(eq(schema.attempts.userId, userId));

    expect(body.totals.attempts).toBe(rows.length);
    expect(body.totals.passed).toBe(rows.filter((row) => row.status === 'PASSED').length);
    expect(body.totals.failed).toBe(rows.filter((row) => row.status === 'FAILED').length);
    expect(body.totals.inProgress).toBe(rows.filter((row) => row.status === 'IN_PROGRESS').length);
  });

  it('filters by status and by quiz, and sorts by score', async () => {
    const cookie = await priya();
    const { quizId } = await finishedAttempt({
      slug: 'sql-databases',
      answers: ['correct', 'correct'],
    });

    const passed = await json<AttemptHistoryResponse>(
      await app.request('/api/student/attempts?status=PASSED&pageSize=50', authed(cookie)),
    );
    expect(passed.attempts.every((attempt) => attempt.status === 'PASSED')).toBe(true);
    expect(passed.attempts.length).toBeGreaterThan(0);

    const byQuiz = await json<AttemptHistoryResponse>(
      await app.request(
        `/api/student/attempts?quizId=${quizId}&pageSize=50&sort=oldest`,
        authed(cookie),
      ),
    );
    expect(byQuiz.attempts.length).toBeGreaterThan(0);
    expect(byQuiz.attempts.every((attempt) => attempt.quizId === quizId)).toBe(true);
    expect(byQuiz.filters.quizId).toBe(quizId);

    const byScore = await json<AttemptHistoryResponse>(
      await app.request('/api/student/attempts?sort=score&pageSize=50', authed(cookie)),
    );
    const scores = byScore.attempts.map((attempt) => attempt.percentage);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('pages the history', async () => {
    const cookie = await priya();

    const first = await json<AttemptHistoryResponse>(
      await app.request('/api/student/attempts?pageSize=2&page=1', authed(cookie)),
    );

    expect(first.attempts).toHaveLength(2);
    expect(first.pagination.pageSize).toBe(2);
    expect(first.pagination.hasPrev).toBe(false);
    expect(first.pagination.hasNext).toBe(first.pagination.total > 2);
    expect(first.pagination.totalPages).toBe(Math.ceil(first.pagination.total / 2));

    if (first.pagination.hasNext) {
      const second = await json<AttemptHistoryResponse>(
        await app.request('/api/student/attempts?pageSize=2&page=2', authed(cookie)),
      );

      expect(second.pagination.hasPrev).toBe(true);
      expect(second.attempts.map((attempt) => attempt.id)).not.toContain(first.attempts[0]?.id);
    }
  });

  it('settles a timed-out attempt before listing it', async () => {
    const cookie = await priya();
    const quiz = await quizBySlug('nodejs-rest-apis');
    const start = await app.request(
      `/api/student/quizzes/${quiz.id}/start`,
      authed(cookie, { method: 'POST' }),
    );

    expect(start.status).toBe(201);

    const { attemptId } = await json<{ attemptId: string }>(start);
    createdAttemptIds.push(attemptId);

    const live = await json<AttemptHistoryResponse>(
      await app.request('/api/student/attempts?status=IN_PROGRESS&pageSize=50', authed(cookie)),
    );
    expect(live.attempts.some((attempt) => attempt.id === attemptId)).toBe(true);

    await db
      .update(schema.attempts)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.attempts.id, attemptId));

    const settled = await json<AttemptHistoryResponse>(
      await app.request('/api/student/attempts?pageSize=50', authed(cookie)),
    );

    const row = settled.attempts.find((attempt) => attempt.id === attemptId);
    expect(row).toBeTruthy();
    expect(row?.status).not.toBe('IN_PROGRESS');
    expect(row?.inProgress).toBe(false);
    expect(row?.completedAt).toBeTruthy();
    expect(row?.autoSubmitted).toBe(true);

    // And now it can be reviewed.
    const reviewRes = await review(cookie, attemptId);
    expect(reviewRes.res.status).toBe(200);
  });

  it('validates the query and refuses the wrong role', async () => {
    const cookie = await priya();

    for (const query of [
      '?page=0',
      '?pageSize=51',
      '?sort=random',
      '?status=EXPIRED',
      '?quizId=nope',
    ]) {
      const res = await app.request(`/api/student/attempts${query}`, authed(cookie));
      expect(res.status, query).toBe(422);
    }

    const admin = await app.request('/api/student/attempts', authed(await adminCookie()));
    expect(admin.status).toBe(403);

    const anonymous = await app.request('/api/student/attempts');
    expect(anonymous.status).toBe(401);
  });
});
