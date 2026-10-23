/**
 * Quiz management contracts (Day 5).
 *
 * The admin quiz screens and the API share these schemas: inputs are validated
 * once, on the server, and the web app's form renders the same rules. Output
 * shapes are parsed before they leave the API so a missing aggregate is a server
 * error rather than an `undefined` in the UI.
 */
import { z } from 'zod';

import { difficultySchema, quizStatusSchema } from './index';

/* -------------------------------------------------------------------------- */
/*  Slug                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Turn a title into a URL-safe slug: lowercase, accents stripped, one dash per
 * run of punctuation, no leading/trailing dash, max 180 characters.
 *
 * Slugs are derived on the server — the client never sends one, so it cannot
 * pick something that collides with an existing quiz.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180)
    .replace(/-+$/g, '');
}

/**
 * Pick a free slug for a title.
 *
 * `existing` is the set of slugs already taken by *other* quizzes (the quiz
 * being edited is excluded), so renaming a quiz never collides with itself.
 */
export function uniqueSlug(title: string, existing: Iterable<string>): string {
  const base = slugify(title) || 'quiz';
  const taken = new Set(existing);

  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${base}-${Date.now()}`;
}

/* -------------------------------------------------------------------------- */
/*  Inputs                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Clearing a text field sends `''` (or omits the key), and both mean "no value"
 * — never an invalid URL or a stored empty string.
 */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => (value == null || value === '' ? null : value));

const optionalThumbnail = z
  .union([z.literal(''), z.string().trim().url('Enter a valid URL').max(500)], {
    error: 'Enter a valid URL',
  })
  .nullish()
  .transform((value) => (value == null || value === '' ? null : value));

/* Field-level validators, shared by create and update so the two can never
   disagree about what a title or a duration is. */
const titleField = z
  .string()
  .trim()
  .min(3, 'Title must be at least 3 characters')
  .max(160, 'Title must be at most 160 characters');

const categoryField = z.string().uuid('Choose a category');

/**
 * Categories are matched case-insensitively and created on the fly.
 *
 * The name is stored as the admin typed it ("Data Structures"), but comparison —
 * in the combobox and in the API — goes through `normalizeCategoryName`, so
 * "data structures", "Data  Structures" and "Data Structures" are one category.
 */
export const categoryNameSchema = z
  .string()
  .trim()
  .min(2, 'Category name must be at least 2 characters')
  .max(80, 'Category name must be at most 80 characters')
  // Store one space where the admin typed three: the display name is the name.
  .transform((value) => value.replace(/\s+/g, ' '));

export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Find the category a typed name refers to, ignoring case and extra whitespace.
 * Used by the API before creating anything, and by the combobox to decide
 * whether it should offer "create" or "use existing".
 */
export function findCategoryByName<T extends { name: string }>(
  name: string,
  categories: readonly T[],
): T | undefined {
  const needle = normalizeCategoryName(name);
  if (!needle) return undefined;

  return categories.find((category) => normalizeCategoryName(category.name) === needle);
}

export const createCategorySchema = z.object({ name: categoryNameSchema });
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

const durationField = z.coerce
  .number()
  .int('Use whole minutes')
  .min(1, 'Duration must be at least 1 minute')
  .max(180, 'Duration must be at most 180 minutes');

const passingScoreField = z.coerce
  .number()
  .int('Use a whole percentage')
  .min(0, 'Passing score cannot be negative')
  .max(100, 'Passing score cannot exceed 100');

const maxAttemptsField = z.coerce
  .number()
  .int('Use a whole number')
  .min(1, 'Allow at least one attempt')
  .max(10, 'At most 10 attempts');

const descriptionField = optionalText(2000, 'Description must be at most 2000 characters');

/**
 * A quiz belongs to exactly one category, named one of two ways:
 *
 * - `categoryId` — the caller picked an existing category;
 * - `categoryName` — the admin typed a name. The API resolves it
 *   case-insensitively and creates the category only if it is genuinely new, in
 *   the same request. Nothing is created for a quiz that never gets saved.
 */
export const quizContentSchema = z
  .object({
    title: titleField,
    description: descriptionField,
    categoryId: categoryField.optional(),
    categoryName: categoryNameSchema.optional(),
    difficulty: difficultySchema.default('MEDIUM'),
    durationMinutes: durationField.default(20),
    passingScore: passingScoreField.default(60),
    maxAttempts: maxAttemptsField.default(2),
    thumbnailUrl: optionalThumbnail,
  })
  .refine((value) => !(value.categoryId && value.categoryName), {
    message: 'Send either categoryId or categoryName, not both',
    path: ['categoryName'],
  })
  .refine((value) => Boolean(value.categoryId ?? value.categoryName), {
    message: 'Choose a category or type a new one',
    path: ['categoryName'],
  });

export const createQuizSchema = quizContentSchema;
/** Output type — what the API hands to the query layer. */
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
/** Input type — what a form may send (defaults and blanks included). */
export type CreateQuizFormValues = z.input<typeof createQuizSchema>;

/**
 * `PATCH` accepts any subset.
 *
 * The fields are declared without their create-time defaults on purpose: a
 * partial object must not silently reset a duration back to 20 just because the
 * key was absent. An empty body is a validation error, not a no-op — the same
 * rule the Day 4 user PATCH follows.
 */
export const updateQuizSchema = z
  .object({
    title: titleField.optional(),
    description: descriptionField.optional(),
    categoryId: categoryField.optional(),
    categoryName: categoryNameSchema.optional(),
    difficulty: difficultySchema.optional(),
    durationMinutes: durationField.optional(),
    passingScore: passingScoreField.optional(),
    maxAttempts: maxAttemptsField.optional(),
    thumbnailUrl: optionalThumbnail.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  })
  .refine((value) => !(value.categoryId && value.categoryName), {
    message: 'Send either categoryId or categoryName, not both',
    path: ['categoryName'],
  });
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type UpdateQuizFormValues = z.input<typeof updateQuizSchema>;

export const QUIZ_SORTS = ['newest', 'oldest', 'title', 'questions'] as const;
export const quizSortSchema = z.enum(QUIZ_SORTS);
export type QuizSort = z.infer<typeof quizSortSchema>;

export const quizListQuerySchema = z.object({
  search: z.string().trim().max(120, 'Search is too long').optional(),
  status: quizStatusSchema.optional(),
  categoryId: z.string().uuid('Invalid category id').optional(),
  difficulty: difficultySchema.optional(),
  sort: quizSortSchema.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type QuizListQuery = z.infer<typeof quizListQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Outputs                                                                   */
/* -------------------------------------------------------------------------- */

/** A quiz row as the console sees it: content plus the aggregates it needs. */
export const adminQuizSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  categoryId: z.string(),
  categoryName: z.string(),
  difficulty: difficultySchema,
  durationMinutes: z.number(),
  passingScore: z.number(),
  maxAttempts: z.number(),
  status: quizStatusSchema,
  thumbnailUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  questionCount: z.number(),
  attemptCount: z.number(),
});
export type AdminQuiz = z.infer<typeof adminQuizSchema>;

export const categoryOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  quizCount: z.number(),
});
export type CategoryOption = z.infer<typeof categoryOptionSchema>;

export const quizListResponseSchema = z.object({
  quizzes: z.array(adminQuizSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  filters: z.object({
    search: z.string().nullable(),
    status: z.string().nullable(),
    categoryId: z.string().nullable(),
    difficulty: z.string().nullable(),
    sort: quizSortSchema,
  }),
});
export type QuizListResponse = z.infer<typeof quizListResponseSchema>;

export const quizDetailResponseSchema = z.object({ quiz: adminQuizSchema });
export type QuizDetailResponse = z.infer<typeof quizDetailResponseSchema>;

export const categoryListResponseSchema = z.object({ categories: z.array(categoryOptionSchema) });
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;

export const deleteQuizResponseSchema = z.object({ success: z.literal(true), id: z.string() });
export type DeleteQuizResponse = z.infer<typeof deleteQuizResponseSchema>;

/* -------------------------------------------------------------------------- */
/*  Lifecycle rules (shared so the UI can explain what the API will decide)    */
/* -------------------------------------------------------------------------- */

/** Publishing needs at least one question; nothing else is blocked. */
export function canPublish(quiz: Pick<AdminQuiz, 'questionCount'>): boolean {
  return quiz.questionCount > 0;
}

/**
 * A quiz with attempts is part of student history, so it cannot be deleted —
 * unpublish it instead. Deleting also removes its questions (cascade), which is
 * why the UI asks for confirmation even when the rule allows it.
 */
export function canDelete(quiz: Pick<AdminQuiz, 'attemptCount'>): boolean {
  return quiz.attemptCount === 0;
}
