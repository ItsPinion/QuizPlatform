import { randomUUID } from 'node:crypto';

import { and, asc, count, eq, ne, sql } from 'drizzle-orm';

import type {
  AdminCategory,
  CategoryDetailResponse,
  CategoryOption,
  UpdateCategoryInput,
} from '@quiz/shared/quiz';
import { findCategoryByName, uniqueSlug } from '@quiz/shared/quiz';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';

const { categories, questions, quizzes } = schema;

/** Trim and collapse internal whitespace, preserving the admin's casing. */
export function cleanCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** All category rows — the comparison set for "does this name already exist". */
export async function categoryRows(): Promise<{ id: string; name: string; slug: string }[]> {
  return db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories);
}

/** True when the driver reports one of the category unique indexes rejecting a write. */
export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint failed|sqlite_constraint_unique/i.test(message);
}

/**
 * Resolve the category a quiz should belong to.
 *
 * `categoryId` is used as-is (after an existence check). `categoryName` is
 * matched case-insensitively against the existing categories, and only created
 * when nothing matches — so "javascript" binds to "JavaScript" instead of
 * producing a second category. Creation happens in the same request as the
 * quiz, so abandoning the form leaves nothing behind.
 */
export async function resolveCategoryId(input: {
  categoryId?: string;
  categoryName?: string;
}): Promise<string> {
  if (input.categoryId) {
    await assertCategoryExists(input.categoryId);
    return input.categoryId;
  }

  const name = cleanCategoryName(input.categoryName ?? '');
  if (!name) {
    throw new ApiError(422, 'CATEGORY_REQUIRED', 'Choose a category or type a new one.');
  }

  const rows = await categoryRows();
  const existing = findCategoryByName(name, rows);
  if (existing) return existing.id;

  return insertCategory(
    name,
    rows.map((row) => row.slug),
  );
}

/** Insert a category, adopting the winner's row if two requests race on one name. */
async function insertCategory(name: string, takenSlugs: string[]): Promise<string> {
  const id = randomUUID();

  try {
    await db.insert(categories).values({ id, name, slug: uniqueSlug(name, takenSlugs) });
  } catch (error) {
    // Two requests may resolve the same new name at once; the case-insensitive
    // unique index makes one of them lose, and that loser just adopts the winner.
    if (!isUniqueViolation(error)) throw error;

    const winner = findCategoryByName(name, await categoryRows());
    if (!winner) throw error;

    return winner.id;
  }

  return id;
}

/** A quiz must point at a real category; the foreign key alone would surface as a 500. */
export async function assertCategoryExists(categoryId: string): Promise<void> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!row) {
    throw new ApiError(422, 'CATEGORY_NOT_FOUND', 'The selected category does not exist.');
  }
}

export async function listCategories(): Promise<CategoryOption[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      quizCount: count(quizzes.id),
    })
    .from(categories)
    .leftJoin(quizzes, eq(quizzes.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    quizCount: Number(row.quizCount ?? 0),
  }));
}

/**
 * Create a category from the console, or return the one that already matches.
 *
 * Idempotent by name: "react" against an existing "React" is a 200 with that
 * category and `created: false`, never a duplicate.
 */
export async function createCategory(
  name: string,
): Promise<{ category: CategoryOption; created: boolean }> {
  const clean = cleanCategoryName(name);
  const rows = await categoryRows();
  const existing = findCategoryByName(clean, rows);

  if (existing) {
    return {
      category: {
        ...existing,
        description: null,
        quizCount: await countQuizzes(existing.id),
      },
      created: false,
    };
  }

  const id = randomUUID();
  const slug = uniqueSlug(
    clean,
    rows.map((row) => row.slug),
  );

  try {
    await db.insert(categories).values({ id, name: clean, slug });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // Lost a race with a concurrent create: adopt the winner instead of failing.
    const winner = findCategoryByName(clean, await categoryRows());
    if (!winner) throw error;

    return {
      category: { ...winner, description: null, quizCount: await countQuizzes(winner.id) },
      created: false,
    };
  }

  return { category: { id, name: clean, slug, description: null, quizCount: 0 }, created: true };
}

async function countQuizzes(categoryId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(quizzes)
    .where(eq(quizzes.categoryId, categoryId));

  return Number(row?.value ?? 0);
}

/** One category with its quizzes, for the "view quizzes under category" screen. */
export async function getCategoryDetail(id: string): Promise<CategoryDetailResponse | null> {
  const [row] = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
    })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  if (!row) return null;

  const quizRows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      slug: quizzes.slug,
      status: quizzes.status,
      questionCount: sql<number>`count(distinct ${questions.id})`.mapWith(Number),
    })
    .from(quizzes)
    .leftJoin(questions, eq(questions.quizId, quizzes.id))
    .where(eq(quizzes.categoryId, id))
    .groupBy(quizzes.id)
    .orderBy(asc(quizzes.title));

  return {
    category: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      quizCount: quizRows.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    quizzes: quizRows.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      slug: quiz.slug,
      status: quiz.status,
      questionCount: Number(quiz.questionCount ?? 0),
      attemptCount: 0,
    })),
  };
}

async function requireCategory(id: string): Promise<AdminCategory> {
  const detail = await getCategoryDetail(id);

  if (!detail) {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'No category with that id exists.');
  }

  return detail.category;
}

/**
 * Rename and/or re-describe a category.
 *
 * Renaming keeps the slug, and is refused when another category already answers
 * to that name in any casing — `409 CATEGORY_EXISTS` rather than a 500 from the
 * unique index.
 */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<AdminCategory> {
  const existing = await requireCategory(id);
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = cleanCategoryName(input.name);

    const clashes = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(sql`lower(${categories.name}) = lower(${name})`, ne(categories.id, id)))
      .limit(1);

    if (clashes.length > 0) {
      throw new ApiError(409, 'CATEGORY_EXISTS', `A category named "${name}" already exists.`);
    }

    if (name !== existing.name) patch.name = name;
  }

  if (input.description !== undefined) patch.description = input.description;

  if (Object.keys(patch).length === 0) return existing;

  await db.update(categories).set(patch).where(eq(categories.id, id));

  return requireCategory(id);
}

/**
 * Delete a category.
 *
 * Refused while quizzes are filed under it (`409 CATEGORY_HAS_QUIZZES`): the
 * message names the count and suggests moving or deleting the quizzes, so the
 * admin makes that decision explicitly instead of losing content to a cascade.
 */
export async function deleteCategory(id: string): Promise<void> {
  await requireCategory(id);

  const quizCount = await countQuizzes(id);

  if (quizCount > 0) {
    throw new ApiError(
      409,
      'CATEGORY_HAS_QUIZZES',
      `This category still has ${quizCount} quiz${quizCount === 1 ? '' : 'zes'}. Move or delete them first.`,
    );
  }

  await db.delete(categories).where(eq(categories.id, id));
}
