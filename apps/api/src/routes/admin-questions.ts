import { idSchema } from '@quiz/shared';
import {
  deleteQuestionResponseSchema,
  questionDetailResponseSchema,
  questionInputSchema,
  questionListResponseSchema,
  questionOrderSchema,
} from '@quiz/shared/question';
import { Hono } from 'hono';

import {
  createQuestion,
  deleteQuestion,
  getQuestion,
  listQuestions,
  replaceQuestion,
  reorderQuestions,
} from '../lib/admin-questions';
import { ApiError, jsonBody } from '../lib/errors';
import type { AppEnv } from '../lib/types';

/**
 * Questions belonging to one quiz, mounted at `/api/admin/quizzes/:quizId/questions`.
 *
 * Creating and reading questions is scoped to the quiz because a question has
 * no life outside one. `order` is declared before `/:questionId` so the literal
 * path wins over the parameter.
 */
export const adminQuizQuestionRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const quizId = idSchema.parse(c.req.param('quizId'));
    return c.json(questionListResponseSchema.parse(await listQuestions(quizId)), 200);
  })

  .post('/', jsonBody(questionInputSchema), async (c) => {
    const quizId = idSchema.parse(c.req.param('quizId'));
    const question = await createQuestion(quizId, c.req.valid('json'));

    return c.json(questionDetailResponseSchema.parse({ question }), 201);
  })

  .patch('/order', jsonBody(questionOrderSchema), async (c) => {
    const quizId = idSchema.parse(c.req.param('quizId'));
    const questions = await reorderQuestions(quizId, c.req.valid('json').ids);

    return c.json({ questions }, 200);
  })

  .all('*', (c) => {
    throw new ApiError(404, 'NOT_FOUND', `No question route matches ${c.req.method} ${c.req.path}`);
  });

/**
 * Question identity routes, mounted at `/api/admin/questions`.
 *
 * `PUT` rather than `PATCH`: a question is replaced as a whole (text, marks and
 * the full option set), because an option set with the correct index removed is
 * not a meaningful partial state.
 */
export const adminQuestionRoutes = new Hono<AppEnv>()
  .get('/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));

    return c.json(questionDetailResponseSchema.parse({ question: await getQuestion(id) }), 200);
  })

  .put('/:id', jsonBody(questionInputSchema), async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const question = await replaceQuestion(id, c.req.valid('json'));

    return c.json(questionDetailResponseSchema.parse({ question }), 200);
  })

  .delete('/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    await deleteQuestion(id);

    return c.json(deleteQuestionResponseSchema.parse({ success: true, id }), 200);
  })

  .all('*', (c) => {
    throw new ApiError(404, 'NOT_FOUND', `No question route matches ${c.req.method} ${c.req.path}`);
  });
