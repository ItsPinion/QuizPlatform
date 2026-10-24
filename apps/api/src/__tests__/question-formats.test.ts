/**
 * §10's question formats, end to end through the HTTP app.
 *
 * The shared package proves the grading arithmetic; this file proves the parts
 * only a running API can show: that a fill-in-the-blank paper ships without its
 * answer key, that each format accepts exactly the body shape it should, and
 * that a paper mixing all four formats grades and reviews consistently.
 */
import { randomUUID } from 'node:crypto';

import type { AttemptSession, StartAttemptResponse } from '@quiz/shared/attempt';
import type { AdminQuestion } from '@quiz/shared/question';
import type { AttemptReview } from '@quiz/shared/review';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../app';

const createdQuizIds: string[] = [];

afterAll(async () => {
  for (const id of createdQuizIds) {
    await db.delete(schema.quizzes).where(eq(schema.quizzes.id, id));
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

function authed(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) },
  };
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

let adminCookie = '';
let studentCookie = '';
let quizId = '';

interface Created {
  quizId: string;
  multi: AdminQuestion;
  truthy: AdminQuestion;
  blank: AdminQuestion;
}

/** A published quiz with one question of each format, plus a plain single answer. */
async function buildQuiz(): Promise<Created> {
  const created = await app.request(
    '/api/admin/quizzes',
    authed(adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        title: `Formats ${randomUUID().slice(0, 8)}`,
        description: 'Every question format the platform supports.',
        categoryName: 'Formats',
        difficulty: 'MEDIUM',
        durationMinutes: 20,
        passingScore: 60,
        maxAttempts: 3,
      }),
    }),
  );

  expect(created.status).toBe(201);
  const quiz = (await json<{ quiz: { id: string } }>(created)).quiz;
  createdQuizIds.push(quiz.id);

  const make = async (payload: Record<string, unknown>): Promise<AdminQuestion> => {
    const res = await app.request(
      `/api/admin/quizzes/${quiz.id}/questions`,
      authed(adminCookie, { method: 'POST', body: JSON.stringify(payload) }),
    );

    expect(res.status).toBe(201);
    return (await json<{ question: AdminQuestion }>(res)).question;
  };

  const multi = await make({
    type: 'MULTI',
    questionText: 'Which of these are falsy in JavaScript?',
    options: [{ text: '0' }, { text: '"0"' }, { text: 'null' }, { text: '[]' }],
    correctIndexes: [0, 2],
    explanation: 'Zero and null are falsy; the string and the array are not.',
    codeSnippet: 'const values = [0, "0", null, []];',
  });

  const truthy = await make({
    type: 'TRUE_FALSE',
    questionText: 'HTTP is a stateless protocol.',
    correctIndex: 0,
    explanation: 'Each request carries everything the server needs.',
  });

  const blank = await make({
    type: 'FILL_BLANK',
    questionText: 'Which keyword starts a function definition in Python?',
    options: [{ text: 'def' }, { text: 'define' }],
    explanation: 'def is the keyword.',
  });

  await make({
    questionText: 'Which method parses a JSON string?',
    options: [{ text: 'JSON.parse()' }, { text: 'JSON.stringify()' }],
    correctIndex: 0,
    explanation: 'parse() goes from text to object.',
  });

  const published = await app.request(
    `/api/admin/quizzes/${quiz.id}/publish`,
    authed(adminCookie, { method: 'POST' }),
  );
  expect(published.status).toBe(200);

  return { quizId: quiz.id, multi, truthy, blank };
}

beforeAll(async () => {
  adminCookie = await cookieFor('admin@quiz.dev', 'Admin12345');
  studentCookie = await cookieFor('priya@quiz.dev', 'Password123');
});

describe('authoring the formats', () => {
  it('writes the true/false pair without being given it', async () => {
    const { truthy } = await buildQuiz();

    expect(truthy.type).toBe('TRUE_FALSE');
    expect(truthy.options.map((option) => option.text)).toEqual(['True', 'False']);
    expect(truthy.options.filter((option) => option.isCorrect)).toHaveLength(1);
    expect(truthy.options.find((option) => option.isCorrect)?.text).toBe('True');
  });

  it('stores every correct option of a multiple-answer question', async () => {
    const { multi } = await buildQuiz();

    expect(multi.type).toBe('MULTI');
    expect(multi.options.filter((option) => option.isCorrect).map((option) => option.text)).toEqual(
      ['0', 'null'],
    );
    expect(multi.codeSnippet).toContain('const values');
  });

  it('stores every accepted answer on a fill in the blank', async () => {
    const { blank } = await buildQuiz();

    expect(blank.type).toBe('FILL_BLANK');
    expect(blank.options).toHaveLength(2);
    expect(blank.options.every((option) => option.isCorrect)).toBe(true);
  });

  it('refuses a multiple-answer question with one correct option', async () => {
    quizId = createdQuizIds.at(-1) ?? (await createBareQuiz());

    const res = await app.request(
      `/api/admin/quizzes/${quizId}/questions`,
      authed(adminCookie, {
        method: 'POST',
        body: JSON.stringify({
          type: 'MULTI',
          questionText: 'Pick two of these.',
          options: [{ text: 'A' }, { text: 'B' }],
          correctIndexes: [0],
        }),
      }),
    );

    expect(res.status).toBe(422);
  });

  it('refuses a fill in the blank with no accepted answer', async () => {
    const res = await app.request(
      `/api/admin/quizzes/${quizId}/questions`,
      authed(adminCookie, {
        method: 'POST',
        body: JSON.stringify({
          type: 'FILL_BLANK',
          questionText: 'Name something.',
          options: [],
        }),
      }),
    );

    expect(res.status).toBe(422);
  });
});

describe('importing the formats', () => {
  it('writes all four formats from one file, and each grades as authored', async () => {
    const bareId = await createBareQuiz();

    const text = [
      'question,option1,option2,option3,option4,correct,explanation,marks,difficulty,type,image,code',
      'Which keyword defines a function in Python?,def,define,,,,,1,,FILL_BLANK,,',
      'Which values are falsy?,0,NaN,null,[],1|3|4,,1,,MULTI,,',
      'HTML is a programming language,,,,,false,,1,,TRUE_FALSE,,',
      'Which tag holds the page body?,<body>,<head>,,,1,,1,,MCQ,https://example.com/a.png,',
    ].join('\n');

    const res = await app.request(
      `/api/admin/quizzes/${bareId}/questions/import`,
      authed(adminCookie, { method: 'POST', body: JSON.stringify({ text }) }),
    );

    expect(res.status).toBe(200);
    const body = await json<{ created: string[]; accepted: number }>(res);
    expect(body.accepted).toBe(4);
    expect(body.created).toHaveLength(4);

    const list = await app.request(`/api/admin/quizzes/${bareId}/questions`, authed(adminCookie));
    const { questions } = await json<{ questions: AdminQuestion[] }>(list);

    expect(questions.map((question) => question.type)).toEqual([
      'FILL_BLANK',
      'MULTI',
      'TRUE_FALSE',
      'MCQ',
    ]);

    const blank = questions[0]!;
    expect(blank.options.map((option) => option.text)).toEqual(['def', 'define']);
    expect(blank.options.every((option) => option.isCorrect)).toBe(true);

    const multi = questions[1]!;
    expect(multi.options.filter((option) => option.isCorrect)).toHaveLength(3);

    const truthy = questions[2]!;
    expect(truthy.options.map((option) => option.text)).toEqual(['True', 'False']);
    expect(truthy.options.find((option) => option.isCorrect)?.text).toBe('False');

    const mcq = questions[3]!;
    expect(mcq.imageUrl).toBe('https://example.com/a.png');
    expect(mcq.options.find((option) => option.isCorrect)?.text).toBe('<body>');
  });

  it('answers a dry run without writing anything', async () => {
    const bareId = await createBareQuiz();

    const res = await app.request(
      `/api/admin/quizzes/${bareId}/questions/import`,
      authed(adminCookie, {
        method: 'POST',
        body: JSON.stringify({
          text: 'question,option1,option2,option3,option4,correct\nPreview only?,a,b,,,2',
          dryRun: true,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await json<{ created: string[]; accepted: number }>(res);
    expect(body.accepted).toBe(1);
    expect(body.created).toEqual([]);

    const list = await app.request(`/api/admin/quizzes/${bareId}/questions`, authed(adminCookie));
    expect((await json<{ questions: AdminQuestion[] }>(list)).questions).toHaveLength(0);
  });

  it('refuses a file whose only rows are wrong, and names the row', async () => {
    const bareId = await createBareQuiz();

    const res = await app.request(
      `/api/admin/quizzes/${bareId}/questions/import`,
      authed(adminCookie, {
        method: 'POST',
        body: JSON.stringify({
          // Columns are positional: question, option1–4, correct, explanation,
          // marks, difficulty, type.
          text: [
            'question,option1,option2,option3,option4,correct,explanation,marks,difficulty,type',
            ['Needs two keys?', 'a', 'b', '', '', '1', '', '1', '', 'MULTI'].join(','),
          ].join('\n'),
        }),
      }),
    );

    expect(res.status).toBe(422);
    const body = await json<{ error: { code: string; message: string } }>(res);
    expect(body.error.code).toBe('IMPORT_NO_ROWS');
    expect(body.error.message).toContain('two correct options');
  });
});

async function createBareQuiz(): Promise<string> {
  const res = await app.request(
    '/api/admin/quizzes',
    authed(adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        title: `Bare ${randomUUID().slice(0, 8)}`,
        categoryName: 'Formats',
        difficulty: 'EASY',
        durationMinutes: 10,
        passingScore: 50,
        maxAttempts: 1,
      }),
    }),
  );

  const quiz = (await json<{ quiz: { id: string } }>(res)).quiz;
  createdQuizIds.push(quiz.id);
  return quiz.id;
}

describe('sitting a mixed paper', () => {
  let quizIdForAttempt = '';
  let paper: AttemptSession;
  let attemptId = '';
  let questions: Created;

  beforeAll(async () => {
    questions = await buildQuiz();
    quizIdForAttempt = questions.quizId;

    const started = await app.request(
      `/api/student/quizzes/${quizIdForAttempt}/start`,
      authed(studentCookie, { method: 'POST' }),
    );

    expect(started.status).toBe(201);
    attemptId = (await json<StartAttemptResponse>(started)).attemptId;

    const session = await app.request(`/api/student/attempts/${attemptId}`, authed(studentCookie));

    paper = await json<AttemptSession>(session);
  });

  afterAll(async () => {
    await db.delete(schema.attempts).where(eq(schema.attempts.id, attemptId));
  });

  it('ships the format, the media and no answer key', async () => {
    const multi = paper.questions.find((question) => question.id === questions.multi.id);

    expect(multi?.type).toBe('MULTI');
    expect(multi?.codeSnippet).toContain('const values');
    expect(JSON.stringify(paper)).not.toMatch(/isCorrect/i);
  });

  it('sends no options at all for a fill in the blank', () => {
    const blank = paper.questions.find((question) => question.id === questions.blank.id);

    expect(blank?.type).toBe('FILL_BLANK');
    expect(blank?.options).toEqual([]);
    // The accepted answers must not be recoverable from the paper.
    expect(JSON.stringify(paper)).not.toContain('define');
  });

  it('refuses a body of the wrong shape for the question', async () => {
    const blank = paper.questions.find((question) => question.id === questions.blank.id)!;
    const multi = paper.questions.find((question) => question.id === questions.multi.id)!;
    const single = paper.questions.find(
      (question) => question.type === 'MCQ' && question.options.length > 0,
    )!;

    const cases = [
      { questionId: blank.id, body: { optionId: blank.options[0]?.id ?? randomUUID() } },
      { questionId: multi.id, body: { optionId: multi.options[0]!.id } },
      { questionId: single.id, body: { optionIds: [single.options[0]!.id] } },
      { questionId: blank.id, body: { answerText: 'def', optionId: single.options[0]!.id } },
    ];

    for (const entry of cases) {
      const res = await app.request(
        `/api/student/attempts/${attemptId}/answers/${entry.questionId}`,
        authed(studentCookie, { method: 'PUT', body: JSON.stringify(entry.body) }),
      );

      expect(res.status, JSON.stringify(entry.body)).toBeGreaterThanOrEqual(422);
    }
  });

  it('saves a set, a boolean and a typed answer, then grades the mix', async () => {
    const multi = paper.questions.find((question) => question.id === questions.multi.id)!;
    const truthy = paper.questions.find((question) => question.id === questions.truthy.id)!;
    const blank = paper.questions.find((question) => question.id === questions.blank.id)!;

    const multiKey = questions.multi.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id);
    const trueOption = questions.truthy.options.find((option) => option.isCorrect)!;

    const saves = [
      { id: multi.id, body: { optionIds: multiKey } },
      { id: truthy.id, body: { optionId: trueOption.id } },
      { id: blank.id, body: { answerText: '  DEF. ' } },
    ];

    for (const entry of saves) {
      const res = await app.request(
        `/api/student/attempts/${attemptId}/answers/${entry.id}`,
        authed(studentCookie, { method: 'PUT', body: JSON.stringify(entry.body) }),
      );

      expect(res.status).toBe(200);
    }

    const cleared = await app.request(
      `/api/student/attempts/${attemptId}/answers/${multi.id}`,
      authed(studentCookie, { method: 'PUT', body: JSON.stringify({ optionIds: [] }) }),
    );
    expect(cleared.status).toBe(200);

    // Put the set back — clearing it proved the shape, not the intent.
    await app.request(
      `/api/student/attempts/${attemptId}/answers/${multi.id}`,
      authed(studentCookie, { method: 'PUT', body: JSON.stringify({ optionIds: multiKey }) }),
    );

    const submitted = await app.request(
      `/api/student/attempts/${attemptId}/submit`,
      authed(studentCookie, { method: 'POST' }),
    );

    expect(submitted.status).toBe(200);

    const body = await json<{
      result: {
        correctAnswers: number;
        unanswered: number;
        formats: { type: string; total: number; correct: number }[];
      };
    }>(submitted);

    // Three answered correctly (multi, true/false, blank); the plain multiple
    // choice was left alone, so it is unanswered rather than wrong.
    expect(body.result.correctAnswers).toBe(3);
    expect(body.result.unanswered).toBe(1);

    const byType = Object.fromEntries(
      body.result.formats.map((format) => [format.type, format.correct]),
    );

    expect(byType).toEqual({ MCQ: 0, MULTI: 1, TRUE_FALSE: 1, FILL_BLANK: 1 });
  });

  it('reviews every format with the key released', async () => {
    const res = await app.request(
      `/api/student/attempts/${attemptId}/review`,
      authed(studentCookie),
    );

    expect(res.status).toBe(200);

    const review = await json<AttemptReview>(res);
    const blank = review.questions.find((question) => question.id === questions.blank.id)!;
    const multi = review.questions.find((question) => question.id === questions.multi.id)!;

    expect(blank.type).toBe('FILL_BLANK');
    expect(blank.answerText).toBe('DEF.');
    expect(blank.verdict).toBe('CORRECT');
    expect(blank.options.map((option) => option.text)).toEqual(['def', 'define']);

    expect(multi.type).toBe('MULTI');
    expect(multi.verdict).toBe('CORRECT');
    expect(multi.selectedOptionIds).toHaveLength(2);
    expect(multi.selectedOptionId).toBeNull();

    expect(review.result.formats).toHaveLength(4);
  });
});
