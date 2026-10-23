import { idSchema } from '@quiz/shared';
import {
  adminCategorySchema,
  categoryDetailResponseSchema,
  categoryListResponseSchema,
  categoryOptionSchema,
  createCategorySchema,
  deleteCategoryResponseSchema,
  updateCategorySchema,
} from '@quiz/shared/quiz';
import { Hono } from 'hono';

import {
  createCategory,
  deleteCategory,
  getCategoryDetail,
  listCategories,
  updateCategory,
} from '../lib/admin-categories';
import { ApiError, jsonBody } from '../lib/errors';
import type { AppEnv } from '../lib/types';

/**
 * Category management, mounted at `/api/admin/categories`.
 *
 * Day 5 could only list and find-or-create (the quiz form needed a category
 * while typing). Day 6 completes the CRUD: a category has its own screen, can
 * be renamed, re-described, and deleted — but only while nothing is filed under
 * it, so removing content is never a side effect of removing a label.
 *
 * The ADMIN guard is inherited from the parent router.
 */
export const adminCategoryRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const categories = await listCategories();
    return c.json(categoryListResponseSchema.parse({ categories }), 200);
  })

  /**
   * Create-or-pick: naming an existing category (any casing) returns it with
   * `created: false`, so the console can offer "type a name" without ever
   * producing "React" and "react" side by side.
   */
  .post('/', jsonBody(createCategorySchema), async (c) => {
    const { category, created } = await createCategory(c.req.valid('json').name);

    return c.json({ category: categoryOptionSchema.parse(category), created }, created ? 201 : 200);
  })

  .get('/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const detail = await getCategoryDetail(id);

    if (!detail) {
      throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'No category with that id exists.');
    }

    return c.json(categoryDetailResponseSchema.parse(detail), 200);
  })

  .patch('/:id', jsonBody(updateCategorySchema), async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    const category = await updateCategory(id, c.req.valid('json'));

    return c.json({ category: adminCategorySchema.parse(category) }, 200);
  })

  .delete('/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id'));
    await deleteCategory(id);

    return c.json(deleteCategoryResponseSchema.parse({ success: true, id }), 200);
  })

  .all('*', (c) => {
    throw new ApiError(404, 'NOT_FOUND', `No category route matches ${c.req.method} ${c.req.path}`);
  });
