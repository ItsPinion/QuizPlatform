import { randomUUID } from 'node:crypto';

import type { AttemptSession } from '@quiz/shared/attempt';
import type { SubmitAttemptResponse } from '@quiz/shared/submission';
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
    .select({
      id: schema.quizzes.id,
      durationMinutes: schema.quizzes.durationMinutes,
      passingScore: schema.quizzes.passingScore,
      title: schema.quizzes.title,
    })
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

/** The paper as the database knows it: questions, marks and the answer key. */
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
 * Insert an attempt straight into the database.
 *
 * Grading is a function of the attempt row and the saved answers, so these
 * tests do not need to spend a seeded student's attempt budget through the start
 * route — the one integration test that does start uses a quiz with headroom.
 */
async function createAttempt(options: {
  email?: string;
  slug: string;
  startedAt: Date;
  expiresAt: Date;
}): Promise<{ attemptId: string; quizId: string; durationMinutes: number; passingScore: number }> {
  const quiz = await quizBySlug(options.slug);
  const userId = await userIdFor(options.email ?? 'priya@quiz.dev');
  const paper = await paperFor(quiz.id);
  const attemptId = randomUUID();

  createdAttemptIds.push(attemptId);

  await db.insert(schema.attempts).values({
    id: attemptId,
    quizId: quiz.id,
    userId,
    totalMarks: paper.reduce((sum, question) => sum + question.marks, 0),
    status: 'IN_PROGRESS',
    startedAt: options.startedAt,
    expiresAt: options.expiresAt,
  });

  return {
    attemptId,
    quizId: quiz.id,
    durationMinutes: quiz.durationMinutes,
    passingScore: quiz.passingScore,
  };
}

function liveAttempt(slug: string, email?: string) {
  const now = Date.now();
  return createAttempt({
    email,
    slug,
    startedAt: new Date(now - 5 * 60_000),
    expiresAt: new Date(now + 15 * 60_000),
  });
}

/** A real attempt shape: start, the quiz's own duration, then a deadline in the past. */
async function expiredAttempt(slug: string, email?: string) {
  const quiz = await quizBySlug(slug);
  const now = Date.now();
  const startedAt = now - quiz.durationMinutes * 60_000 - 60_000;

  return createAttempt({
    email,
    slug,
    startedAt: new Date(startedAt),
    expiresAt: new Date(startedAt + quiz.durationMinutes * 60_000),
  });
}

async function save(
  cookie: string,
  attemptId: string,
  questionId: string,
  optionId: string | null,
): Promise<Response> {
  return app.request(
    `/api/student/attempts/${attemptId}/answers/${questionId}`,
    authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId }) }),
  );
}

async function submit(cookie: string, attemptId: string) {
  const res = await app.request(
    `/api/student/attempts/${attemptId}/submit`,
    authed(cookie, { method: 'POST' }),
  );

  return { res, body: await json<SubmitAttemptResponse>(res) };
}

async function session(cookie: string, attemptId: string): Promise<AttemptSession> {
  const res = await app.request(`/api/student/attempts/${attemptId}`, authed(cookie));
  expect(res.status).toBe(200);
  return json<AttemptSession>(res);
}

async function attemptRow(attemptId: string) {
  const [row] = await db
    .select()
    .from(schema.attempts)
    .where(eq(schema.attempts.id, attemptId))
    .limit(1);

  if (!row) throw new Error('attempt vanished');
  return row;
}

describe('POST /api/student/attempts/:id/submit', () => {
  it('grades a paper started through the API, end to end', async () => {
    const cookie = await priya();
    const quiz = await quizBySlug('html-fundamentals');

    const start = await app.request(
      `/api/student/quizzes/${quiz.id}/start`,
      authed(cookie, { method: 'POST' }),
    );

    expect(start.status).toBe(201);

    const { attemptId } = await json<{ attemptId: string }>(start);
    createdAttemptIds.push(attemptId);

    const paper = await paperFor(quiz.id);
    const totalMarks = paper.reduce((sum, question) => sum + question.marks, 0);

    // Every answer correct: the paper should score full marks.
    for (const question of paper) {
      if (!question.correct) throw new Error('expected a correct option');
      const res = await save(cookie, attemptId, question.id, question.correct);
      expect(res.status).toBe(200);
    }

    const { res, body } = await submit(cookie, attemptId);

    expect(res.status).toBe(200);
    expect(body.alreadySubmitted).toBe(false);
    expect(body.result.correctAnswers).toBe(paper.length);
    expect(body.result.incorrectAnswers).toBe(0);
    expect(body.result.unanswered).toBe(0);
    expect(body.result.score).toBe(totalMarks);
    expect(body.result.totalMarks).toBe(totalMarks);
    expect(body.result.percentage).toBe(100);
    expect(body.result.passed).toBe(true);
    expect(body.result.status).toBe('PASSED');
    expect(body.result.autoSubmitted).toBe(false);
    expect(body.result.timeTakenSeconds).toBeGreaterThanOrEqual(0);
    expect(body.result.timeTakenSeconds).toBeLessThanOrEqual(quiz.durationMinutes * 60);

    const row = await attemptRow(attemptId);
    expect(row.status).toBe('PASSED');
    expect(row.completedAt).not.toBeNull();
    expect(row.score).toBe(totalMarks);
    expect(row.percentage).toBe(100);

    // Per-question verdicts are stamped for the review screen.
    const graded = await db
      .select({ isCorrect: schema.answers.isCorrect })
      .from(schema.answers)
      .where(eq(schema.answers.attemptId, attemptId));

    expect(graded).toHaveLength(paper.length);
    expect(graded.every((answer) => answer.isCorrect === true)).toBe(true);
  });

  it('counts wrong and blank answers and fails below the pass mark', async () => {
    const cookie = await priya();
    const { attemptId, passingScore } = await liveAttempt('react-basics');
    const paper = await paperFor((await quizBySlug('react-basics')).id);

    const first = paper[0];
    const second = paper[1];
    if (!first?.wrong || !second) throw new Error('expected a two-question paper');

    // One wrong answer, one saved-then-cleared answer, the rest untouched.
    expect((await save(cookie, attemptId, first.id, first.wrong)).status).toBe(200);
    expect((await save(cookie, attemptId, second.id, second.correct)).status).toBe(200);
    expect((await save(cookie, attemptId, second.id, null)).status).toBe(200);

    const { res, body } = await submit(cookie, attemptId);

    expect(res.status).toBe(200);
    expect(body.result.correctAnswers).toBe(0);
    expect(body.result.incorrectAnswers).toBe(1);
    expect(body.result.unanswered).toBe(paper.length - 1);
    expect(body.result.score).toBe(0);
    expect(body.result.percentage).toBe(0);
    expect(body.result.passed).toBe(false);
    expect(body.result.status).toBe('FAILED');
    expect(body.result.passingScore).toBe(passingScore);

    const stamped = await db
      .select({ isCorrect: schema.answers.isCorrect })
      .from(schema.answers)
      .where(eq(schema.answers.attemptId, attemptId));

    expect(stamped.find((answer) => answer.isCorrect === false)).toBeTruthy();
    expect(stamped.find((answer) => answer.isCorrect === null)).toBeTruthy();
  });

  it('is idempotent: a retry returns the stored result', async () => {
    const cookie = await priya();
    const { attemptId } = await liveAttempt('nodejs-rest-apis');
    const paper = await paperFor((await quizBySlug('nodejs-rest-apis')).id);
    const correct = paper[0]?.correct;

    if (!correct) throw new Error('expected a correct option');
    expect((await save(cookie, attemptId, paper[0]!.id, correct)).status).toBe(200);

    const first = await submit(cookie, attemptId);
    const completedAt = first.body.result.completedAt;

    const second = await submit(cookie, attemptId);

    expect(second.res.status).toBe(200);
    expect(second.body.alreadySubmitted).toBe(true);
    expect(second.body.result.percentage).toBe(first.body.result.percentage);
    expect(second.body.result.completedAt).toBe(completedAt);
    expect(second.body.result.timeTakenSeconds).toBe(first.body.result.timeTakenSeconds);

    expect((await attemptRow(attemptId)).completedAt?.toISOString()).toBe(completedAt);
  });

  it('grades an attempt whose deadline already passed, as an auto-submit', async () => {
    const cookie = await priya();
    const { attemptId, durationMinutes } = await expiredAttempt('css-essentials');
    const quiz = await quizBySlug('css-essentials');
    const paper = await paperFor(quiz.id);
    const correct = paper.at(-1)?.correct;

    if (!correct) throw new Error('expected a correct option');

    // The write is refused — the clock is already authoritative…
    const late = await save(cookie, attemptId, paper.at(-1)!.id, correct);
    expect(late.status).toBe(409);
    expect((await json<{ error: { code: string } }>(late)).error.code).toBe('ATTEMPT_EXPIRED');

    // …but the submission is accepted, and recorded as finishing at the deadline.
    const { res, body } = await submit(cookie, attemptId);

    expect(res.status).toBe(200);
    expect(body.result.autoSubmitted).toBe(true);
    expect(body.result.timeTakenSeconds).toBe(durationMinutes * 60);

    const row = await attemptRow(attemptId);
    expect(row.completedAt?.toISOString()).toBe(row.expiresAt.toISOString());
    expect(row.status).not.toBe('IN_PROGRESS');

    // Locked afterwards: it is finished, not merely past its deadline.
    const after = await save(cookie, attemptId, paper.at(-1)!.id, correct);
    expect(after.status).toBe(409);
    expect((await json<{ error: { code: string } }>(after)).error.code).toBe('ATTEMPT_NOT_ACTIVE');
  });

  it('settles an expired attempt on the next catalogue read', async () => {
    const cookie = await priya();
    const quiz = await quizBySlug('python-programming');
    const before = await json<{ quizzes: { id: string; attemptsUsed: number }[] }>(
      await app.request(`/api/student/quizzes?search=${encodeURIComponent(quiz.title)}`, {
        headers: { cookie },
      }),
    );

    const usedBefore =
      before.quizzes.find((candidate) => candidate.id === quiz.id)?.attemptsUsed ?? 0;

    const { attemptId } = await expiredAttempt('python-programming');

    // Nothing has touched the attempt yet: the row is still open.
    expect((await attemptRow(attemptId)).status).toBe('IN_PROGRESS');

    const listed = await json<{
      quizzes: {
        id: string;
        attemptsUsed: number;
        bestPercentage: number | null;
        inProgressAttemptId: string | null;
      }[];
    }>(
      await app.request(`/api/student/quizzes?search=${encodeURIComponent(quiz.title)}`, {
        headers: { cookie },
      }),
    );

    const after = listed.quizzes.find((candidate) => candidate.id === quiz.id);
    if (!after) throw new Error('quiz missing from the catalogue');

    expect(after.attemptsUsed).toBe(usedBefore + 1);
    expect(after.inProgressAttemptId).toBeNull();
    expect((await attemptRow(attemptId)).status).not.toBe('IN_PROGRESS');

    const settled = await session(cookie, attemptId);
    expect(settled.attempt.status).not.toBe('IN_PROGRESS');
    expect(settled.attempt.expired).toBe(false);
    expect(settled.attempt.result).not.toBeNull();
    expect(settled.attempt.result?.autoSubmitted).toBe(true);
  });

  it('reports the result in the session without ever shipping the answer key', async () => {
    const cookie = await priya();
    const { attemptId } = await liveAttempt('cyber-security-basics');
    const quiz = await quizBySlug('cyber-security-basics');
    const paper = await paperFor(quiz.id);
    const correct = paper[0]?.correct;

    if (!correct) throw new Error('expected a correct option');
    expect((await save(cookie, attemptId, paper[0]!.id, correct)).status).toBe(200);

    const live = await session(cookie, attemptId);
    expect(live.attempt.result).toBeNull();
    expect(JSON.stringify(live)).not.toContain('isCorrect');
    expect(JSON.stringify(live)).not.toContain('"explanation"');

    await submit(cookie, attemptId);
    const graded = await session(cookie, attemptId);

    expect(graded.attempt.result).not.toBeNull();
    expect(graded.attempt.result?.correctAnswers).toBe(1);
    expect(JSON.stringify(graded)).not.toContain('isCorrect');
    expect(JSON.stringify(graded)).not.toContain('"explanation"');
  });

  it('hides another student’s attempt and refuses an admin', async () => {
    const { attemptId } = await liveAttempt('react-basics', 'priya@quiz.dev');

    const stranger = await app.request(
      `/api/student/attempts/${attemptId}/submit`,
      authed(await rahul(), { method: 'POST' }),
    );

    expect(stranger.status).toBe(404);
    expect((await json<{ error: { code: string } }>(stranger)).error.code).toBe(
      'ATTEMPT_NOT_FOUND',
    );

    const missing = await app.request(
      `/api/student/attempts/${randomUUID()}/submit`,
      authed(await priya(), { method: 'POST' }),
    );

    expect(missing.status).toBe(404);

    const admin = await app.request(
      `/api/student/attempts/${attemptId}/submit`,
      authed(await adminCookie(), { method: 'POST' }),
    );

    expect(admin.status).toBe(403);
  });

  it('rejects a malformed attempt id', async () => {
    const res = await app.request(
      '/api/student/attempts/not-a-uuid/submit',
      authed(await priya(), { method: 'POST' }),
    );

    expect(res.status).toBe(422);
  });
});
