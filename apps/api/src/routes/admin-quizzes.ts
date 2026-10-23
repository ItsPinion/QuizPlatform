import { idSchema } from '@quiz/shared';
import {
  createQuizSchema,
  deleteQuizResponseSchema,
  quizDetailResponseSchema,
  quizListQuerySchema,
  quizListResponseSchema,
  updateQuizSchema,
} from '@quiz/shared/quiz';
import { Hono } from 'hono';

import {
  createQuiz,
  deleteQuiz,
  getQuizById,
  listQuizzes,
  publishQuiz,
  unpublishQuiz,
  updateQuiz,
} from '../lib/admin-quizzes';
import { ApiError, jsonBody } from '../lib/errors';
import type { AppEnv } from '../lib/types';
import { adminQuizQuestionRoutes } from './admin-questions';

/** `?status=` (cleared filter) must behave like "no filter". */
function queryObject(url: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of new URL(url).searchParams) {
    if (value.trim() !== '') out[key] = value;
  }

  return out;
}

/**
 * Quiz management, mounted at `/api/admin/quizzes`.
 *
 * The ADMIN guard lives on the parent router (Day 3), so nothing here repeats
 * it — including the routes added today.
 */
export const adminQuizRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const query = quizListQuerySchema.parse(queryObject(c.req.url));
    const result = await listQuizzes(query);

    return c.json(quizListResponseSchema.parse(result), 200);
  })

  /**
   * Questions live under their quiz. Declared before `/:id` for readability;
   * the paths do not overlap (`/:id` has no child segment).
   */
  .route('/:quizId/questions', adminQuizQuestionRoutes)

  .post('/', jsonBody(createQuizSchema), async (c) => {
    const quiz = await createQuiz(c.req.valid('json'));
    return c.json(quizDetailResponseSchema.parse({ quiz }), 201);
  })

  .get('/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const quiz = await getQuizById(id);

    if (!quiz) {
      throw new ApiError(404, 'QUIZ_NOT_FOUND', 'No quiz with that id exists.');
    }

    return c.json(quizDetailResponseSchema.parse({ quiz }), 200);
  })

  .patch('/:id', jsonBody(updateQuizSchema), async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const quiz = await updateQuiz(id, c.req.valid('json'));

    return c.json(quizDetailResponseSchema.parse({ quiz }), 200);
  })

  .delete('/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    await deleteQuiz(id);

    return c.json(deleteQuizResponseSchema.parse({ success: true, id }), 200);
  })

  /* ------------------------------ lifecycle ------------------------------- */
  .post('/:id/publish', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const quiz = await publishQuiz(id);

    return c.json(quizDetailResponseSchema.parse({ quiz }), 200);
  })

  .post('/:id/unpublish', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const quiz = await unpublishQuiz(id);

    return c.json(quizDetailResponseSchema.parse({ quiz }), 200);
  })

  /** Method/path fallback inside the namespace, matching the parent's behaviour. */
  .all('*', (c) => {
    throw new ApiError(404, 'NOT_FOUND', `No quiz route matches ${c.req.method} ${c.req.path}`);
  });
