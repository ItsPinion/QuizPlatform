import { randomUUID } from 'node:crypto';

import { and, asc, count, desc, eq, like, sql } from 'drizzle-orm';

import type {
  AdminQuiz,
  CategoryOption,
  CreateQuizInput,
  QuizListQuery,
  QuizListResponse,
  UpdateQuizInput,
} from '@quiz/shared/quiz';
import { uniqueSlug } from '@quiz/shared/quiz';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';

const { attempts, categories, questions, quizzes } = schema;

/**
 * Quiz rows carry two aggregates, and both joins fan out — counting the joined
 * ids would multiply them, so every count is `distinct`.
 */
const quizSelection = {
  id: quizzes.id,
  title: quizzes.title,
  slug: quizzes.slug,
  description: quizzes.description,
  categoryId: quizzes.categoryId,
  categoryName: categories.name,
  difficulty: quizzes.difficulty,
  durationMinutes: quizzes.durationMinutes,
  passingScore: quizzes.passingScore,
  maxAttempts: quizzes.maxAttempts,
  status: quizzes.status,
  thumbnailUrl: quizzes.thumbnailUrl,
  createdAt: quizzes.createdAt,
  updatedAt: quizzes.updatedAt,
  questionCount: sql<number>`count(distinct ${questions.id})`.mapWith(Number),
  attemptCount: sql<number>`count(distinct ${attempts.id})`.mapWith(Number),
} as const;

type RawQuizRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  thumbnailUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  questionCount: number;
  attemptCount: number;
};

function toAdminQuiz(row: RawQuizRow): AdminQuiz {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    difficulty: row.difficulty,
    durationMinutes: row.durationMinutes,
    passingScore: row.passingScore,
    maxAttempts: row.maxAttempts,
    status: row.status,
    thumbnailUrl: row.thumbnailUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    questionCount: Number(row.questionCount ?? 0),
    attemptCount: Number(row.attemptCount ?? 0),
  };
}

/** The list and detail queries differ only in their `WHERE`, so they share a builder. */
function quizQuery() {
  return db
    .select(quizSelection)
    .from(quizzes)
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .leftJoin(questions, eq(questions.quizId, quizzes.id))
    .leftJoin(attempts, eq(attempts.quizId, quizzes.id));
}

function filtersFor(query: QuizListQuery) {
  const clauses = [];

  if (query.search) {
    clauses.push(like(quizzes.title, `%${query.search}%`));
  }
  if (query.status) clauses.push(eq(quizzes.status, query.status));
  if (query.categoryId) clauses.push(eq(quizzes.categoryId, query.categoryId));
  if (query.difficulty) clauses.push(eq(quizzes.difficulty, query.difficulty));

  return clauses.length > 0 ? and(...clauses) : undefined;
}

function orderFor(sort: QuizListQuery['sort']) {
  switch (sort) {
    case 'oldest':
      return asc(quizzes.createdAt);
    case 'title':
      return asc(quizzes.title);
    case 'questions':
      return desc(sql`count(distinct ${questions.id})`);
    default:
      return desc(quizzes.createdAt);
  }
}

export async function listQuizzes(query: QuizListQuery): Promise<QuizListResponse> {
  const where = filtersFor(query);

  const [rows, [totals]] = await Promise.all([
    quizQuery()
      .where(where)
      .groupBy(quizzes.id)
      .orderBy(orderFor(query.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(quizzes).where(where),
  ]);

  const total = Number(totals?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    quizzes: rows.map((row) => toAdminQuiz(row as RawQuizRow)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
    filters: {
      search: query.search ?? null,
      status: query.status ?? null,
      categoryId: query.categoryId ?? null,
      difficulty: query.difficulty ?? null,
      sort: query.sort,
    },
  };
}

export async function getQuizById(id: string): Promise<AdminQuiz | null> {
  const [row] = await quizQuery().where(eq(quizzes.id, id)).groupBy(quizzes.id).limit(1);
  return row ? toAdminQuiz(row as RawQuizRow) : null;
}

async function requireQuiz(id: string): Promise<AdminQuiz> {
  const quiz = await getQuizById(id);
  if (!quiz) throw new ApiError(404, 'QUIZ_NOT_FOUND', 'No quiz with that id exists.');
  return quiz;
}

/** A quiz must point at a real category; the foreign key alone would surface as a 500. */
async function assertCategoryExists(categoryId: string): Promise<void> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!row) {
    throw new ApiError(422, 'CATEGORY_NOT_FOUND', 'The selected category does not exist.');
  }
}

async function takenSlugs(excludeId?: string): Promise<string[]> {
  const rows = await db.select({ id: quizzes.id, slug: quizzes.slug }).from(quizzes);
  return rows.filter((row) => row.id !== excludeId).map((row) => row.slug);
}

export async function createQuiz(input: CreateQuizInput): Promise<AdminQuiz> {
  await assertCategoryExists(input.categoryId);

  const slug = uniqueSlug(input.title, await takenSlugs());
  const id = randomUUID();

  await db.insert(quizzes).values({
    id,
    title: input.title,
    slug,
    description: input.description ?? null,
    categoryId: input.categoryId,
    difficulty: input.difficulty,
    durationMinutes: input.durationMinutes,
    passingScore: input.passingScore,
    maxAttempts: input.maxAttempts,
    // New quizzes always start as a draft; publishing is its own guarded action.
    status: 'DRAFT',
    thumbnailUrl: input.thumbnailUrl ?? null,
    createdBy: null,
  });

  return requireQuiz(id);
}

export async function updateQuiz(id: string, input: UpdateQuizInput): Promise<AdminQuiz> {
  const existing = await requireQuiz(id);

  if (input.categoryId && input.categoryId !== existing.categoryId) {
    await assertCategoryExists(input.categoryId);
  }

  const patch: Record<string, unknown> = {};

  for (const key of [
    'title',
    'description',
    'categoryId',
    'difficulty',
    'durationMinutes',
    'passingScore',
    'maxAttempts',
    'thumbnailUrl',
  ] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  // The slug is intentionally stable: renaming a quiz must not break links that
  // students or the console already hold.
  if (Object.keys(patch).length > 0) {
    await db.update(quizzes).set(patch).where(eq(quizzes.id, id));
  }

  return requireQuiz(id);
}

/**
 * Deleting removes the quiz, its questions and options by cascade. Once a
 * student has attempted it, the quiz is history — unpublish instead of erasing
 * someone's results.
 */
export async function deleteQuiz(id: string): Promise<void> {
  const quiz = await requireQuiz(id);

  if (quiz.attemptCount > 0) {
    throw new ApiError(
      409,
      'QUIZ_HAS_ATTEMPTS',
      `This quiz has ${quiz.attemptCount} attempt${quiz.attemptCount === 1 ? '' : 's'} and cannot be deleted. Unpublish it instead.`,
    );
  }

  await db.delete(quizzes).where(eq(quizzes.id, id));
}

/**
 * Publish / republish.
 *
 * Idempotent: publishing an already-published quiz is a 200, because the caller's
 * intent ("be published") already holds. The only precondition is that there is
 * something to take.
 */
export async function publishQuiz(id: string): Promise<AdminQuiz> {
  const quiz = await requireQuiz(id);

  if (quiz.questionCount === 0) {
    throw new ApiError(
      409,
      'QUIZ_HAS_NO_QUESTIONS',
      'Add at least one question before publishing this quiz.',
    );
  }

  if (quiz.status !== 'PUBLISHED') {
    await db.update(quizzes).set({ status: 'PUBLISHED' }).where(eq(quizzes.id, id));
  }

  return requireQuiz(id);
}

/** Unpublishing something that is not live is a state error, not a no-op. */
export async function unpublishQuiz(id: string): Promise<AdminQuiz> {
  const quiz = await requireQuiz(id);

  if (quiz.status !== 'PUBLISHED') {
    throw new ApiError(409, 'QUIZ_NOT_PUBLISHED', 'Only a published quiz can be unpublished.');
  }

  await db.update(quizzes).set({ status: 'UNPUBLISHED' }).where(eq(quizzes.id, id));

  return requireQuiz(id);
}

export async function listCategories(): Promise<CategoryOption[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
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
    quizCount: Number(row.quizCount ?? 0),
  }));
}
