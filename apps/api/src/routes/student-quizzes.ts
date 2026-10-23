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
import { studentDashboardSchema } from '@quiz/shared/dashboard';
import {
  attemptHistoryQuerySchema,
  attemptHistoryResponseSchema,
  attemptReviewSchema,
} from '@quiz/shared/review';
import { submitAttemptResponseSchema } from '@quiz/shared/submission';
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
import { getAttemptReview, listAttemptHistory } from '../lib/reviews';
import { buildStudentDashboard } from '../lib/student-dashboard';
import { submitAttempt } from '../lib/submissions';
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
 * Day 8 adds `POST /attempts/:id/submit`: the same call serves a student's
 * click and an attempt whose clock ran out, is idempotent, and is the only
 * place a score is ever computed.
 *
 * Day 9 adds the read side of a finished attempt: `GET /attempts` (history) and
 * `GET /attempts/:id/review`, the one payload that carries the answer key — and
 * only once the attempt is finished.
 *
 * Day 10 adds `GET /dashboard`: the six spec statistics, the trend, the category
 * breakdown and the activity window in one round trip.
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

  /** Everything the student dashboard renders, in one round trip. */
  .get('/dashboard', async (c) => {
    const user = c.get('user');

    return c.json(studentDashboardSchema.parse(await buildStudentDashboard(user.id)), 200);
  })

  /** Attempt history — every attempt this student has ever started. */
  .get('/attempts', async (c) => {
    const user = c.get('user');
    const query = attemptHistoryQuerySchema.parse(queryObject(c.req.url));

    return c.json(
      attemptHistoryResponseSchema.parse(await listAttemptHistory(query, user.id)),
      200,
    );
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

  /**
   * The answer review: what was asked, what was picked, what was right and why.
   *
   * Only for a finished attempt — while it is still running this answers
   * `409 ATTEMPT_NOT_ACTIVE`, because shipping the key mid-quiz would make the
   * whole graded interface pointless.
   */
  .get('/attempts/:id/review', async (c) => {
    const user = c.get('user');
    const id = idSchema.parse(c.req.param('id'));

    return c.json(attemptReviewSchema.parse(await getAttemptReview(id, user.id)), 200);
  })

  /**
   * Submit — or hand back the result of an attempt already submitted.
   *
   * No body: the server decides whether this was a manual submit or the
   * deadline, from `expiresAt`. A late call is accepted and recorded as
   * finishing at the deadline rather than rejected, because losing a answered
   * paper to a slow network would be the worse failure.
   */
  .post('/attempts/:id/submit', async (c) => {
    const user = c.get('user');
    const id = idSchema.parse(c.req.param('id'));

    return c.json(submitAttemptResponseSchema.parse(await submitAttempt(id, user.id)), 200);
  })

  .all('*', (c) => {
    throw new ApiError(404, 'NOT_FOUND', `No student route matches ${c.req.method} ${c.req.path}`);
  });
