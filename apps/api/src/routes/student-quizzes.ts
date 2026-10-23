import { idSchema } from '@quiz/shared';
import {
  attemptSessionSchema,
  saveAnswerResponseSchema,
  saveAnswerSchema,
  startAttemptResponseSchema,
  studentQuizDetailResponseSchema,
  studentQuizListQuerySchema,
  studentQuizListResponseSchema,
} from '@quiz/shared/attempt';
import { Hono } from 'hono';

import { ApiError, jsonBody } from '../lib/errors';
import { categoryListResponseSchema } from '@quiz/shared/quiz';

import {
  getAttemptSession,
  getStudentQuiz,
  listStudentCategories,
  listStudentQuizzes,
  saveAnswer,
  startAttempt,
} from '../lib/student-quizzes';
import type { AppEnv } from '../lib/types';

/** `?status=`-style cleared filters arrive as empty strings; treat them as absent. */
function queryObject(url: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of new URL(url).searchParams) {
    if (value.trim() !== '') out[key] = value;
  }

  return out;
}

/**
 * Quiz taking, mounted at `/api/student`.
 *
 * The spec lists these as `/api/quizzes/:id/start` and `/api/attempts/:id`.
 * They live under the guarded student namespace instead, so the role check is
 * inherited rather than repeated — and so a student's attempts can only ever be
 * their own.
 *
 * Day 8 adds submission and grading; today the attempt can be started, read,
 * resumed and answered, and the clock is enforced on every write.
 */
export const studentQuizRoutes = new Hono<AppEnv>()
  /** Only categories with at least one published quiz — the catalogue filter. */
  .get('/categories', async (c) => {
    const categories = await listStudentCategories();
    return c.json(categoryListResponseSchema.parse({ categories }), 200);
  })

  .get('/quizzes', async (c) => {
    const user = c.get('user');
    const query = studentQuizListQuerySchema.parse(queryObject(c.req.url));

    return c.json(
      studentQuizListResponseSchema.parse(await listStudentQuizzes(query, user.id)),
      200,
    );
  })

  .get('/quizzes/:id', async (c) => {
    const user = c.get('user');
    const id = idSchema.parse(c.req.param('id'));

    return c.json(await getStudentQuiz(id, user.id), 200);
  })

  .post('/quizzes/:id/start', async (c) => {
    const user = c.get('user');
    const id = idSchema.parse(c.req.param('id'));

    return c.json(startAttemptResponseSchema.parse(await startAttempt(id, user.id)), 201);
  })

  .get('/attempts/:id', async (c) => {
    const user = c.get('user');
    const id = idSchema.parse(c.req.param('id'));

    return c.json(attemptSessionSchema.parse(await getAttemptSession(id, user.id)), 200);
  })

  .put('/attempts/:id/answers/:questionId', jsonBody(saveAnswerSchema), async (c) => {
    const user = c.get('user');
    const attemptId = idSchema.parse(c.req.param('id'));
    const questionId = idSchema.parse(c.req.param('questionId'));

    const result = await saveAnswer(attemptId, questionId, c.req.valid('json').optionId, user.id);

    return c.json(saveAnswerResponseSchema.parse(result), 200);
  })

  .all('*', (c) => {
    throw new ApiError(404, 'NOT_FOUND', `No student route matches ${c.req.method} ${c.req.path}`);
  });
