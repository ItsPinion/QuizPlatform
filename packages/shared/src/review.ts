/**
 * Results, answer review and attempt history (Day 9).
 *
 * Day 8 stored a verdict on the attempt. Day 9 opens the paper back up: for a
 * **finished** attempt only, the API finally returns the answer key — which
 * option was right, which one the student picked, and the explanation — plus a
 * paged history of everything they have ever attempted.
 *
 * The rule that keeps Day 7 honest is unchanged: an attempt that is still
 * running never carries correctness data. `getAttemptReview()` refuses it.
 */
import { z } from 'zod';

import { attemptStatusSchema, difficultySchema } from './index';
import { attemptResultSchema } from './submission';

/* -------------------------------------------------------------------------- */
/*  Verdicts                                                                  */
/* -------------------------------------------------------------------------- */

export const REVIEW_VERDICTS = ['CORRECT', 'INCORRECT', 'UNANSWERED'] as const;
export const reviewVerdictSchema = z.enum(REVIEW_VERDICTS);
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

/**
 * How one question went.
 *
 * Kept as a pure function so the API, the review screen and the tests all agree
 * on the three-way split. A selection that is not the key is *incorrect*; no
 * selection at all is *unanswered* — the two are never merged.
 */
export function reviewVerdict(
  selectedOptionId: string | null,
  correctOptionId: string | null,
): ReviewVerdict {
  if (selectedOptionId == null) return 'UNANSWERED';
  if (correctOptionId != null && selectedOptionId === correctOptionId) return 'CORRECT';
  return 'INCORRECT';
}

/** Marks a question earned: full marks or nothing, per the Day 8 grader. */
export function earnedMarks(verdict: ReviewVerdict, marks: number): number {
  return verdict === 'CORRECT' ? marks : 0;
}

/* -------------------------------------------------------------------------- */
/*  Filters                                                                   */
/* -------------------------------------------------------------------------- */

export const REVIEW_FILTERS = ['all', 'correct', 'incorrect', 'unanswered'] as const;
export const reviewFilterSchema = z.enum(REVIEW_FILTERS);
export type ReviewFilter = z.infer<typeof reviewFilterSchema>;

export function verdictMatchesFilter(verdict: ReviewVerdict, filter: ReviewFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'correct') return verdict === 'CORRECT';
  if (filter === 'incorrect') return verdict === 'INCORRECT';
  return verdict === 'UNANSWERED';
}

/* -------------------------------------------------------------------------- */
/*  The review payload                                                        */
/* -------------------------------------------------------------------------- */

export const reviewOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  position: z.number(),
  /** The key is safe here: this payload only exists for a finished attempt. */
  isCorrect: z.boolean(),
  selected: z.boolean(),
});
export type ReviewOption = z.infer<typeof reviewOptionSchema>;

export const reviewQuestionSchema = z.object({
  id: z.string(),
  position: z.number(),
  questionText: z.string(),
  marks: z.number(),
  difficulty: difficultySchema,
  explanation: z.string().nullable(),
  selectedOptionId: z.string().nullable(),
  correctOptionId: z.string().nullable(),
  verdict: reviewVerdictSchema,
  earnedMarks: z.number(),
  options: z.array(reviewOptionSchema),
});
export type ReviewQuestion = z.infer<typeof reviewQuestionSchema>;

export const attemptReviewSchema = z.object({
  attempt: z.object({
    id: z.string(),
    status: attemptStatusSchema,
    startedAt: z.string(),
    completedAt: z.string(),
    timeTakenSeconds: z.number(),
    autoSubmitted: z.boolean(),
  }),
  quiz: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    categoryName: z.string(),
    difficulty: difficultySchema,
    passingScore: z.number(),
  }),
  result: attemptResultSchema,
  /** Whole paper, in the order it was taken, with the filter counts. */
  questions: z.array(reviewQuestionSchema),
  counts: z.object({
    all: z.number(),
    correct: z.number(),
    incorrect: z.number(),
    unanswered: z.number(),
  }),
});
export type AttemptReview = z.infer<typeof attemptReviewSchema>;

/** Tally used by the review screen and by the API before it serialises. */
export function reviewCounts(questions: readonly { verdict: ReviewVerdict }[]) {
  const counts = { all: questions.length, correct: 0, incorrect: 0, unanswered: 0 };

  for (const question of questions) {
    if (question.verdict === 'CORRECT') counts.correct += 1;
    else if (question.verdict === 'INCORRECT') counts.incorrect += 1;
    else counts.unanswered += 1;
  }

  return counts;
}

/* -------------------------------------------------------------------------- */
/*  Attempt history                                                           */
/* -------------------------------------------------------------------------- */

export const HISTORY_STATUSES = ['PASSED', 'FAILED', 'IN_PROGRESS'] as const;
export const historyStatusSchema = z.enum(HISTORY_STATUSES);
export type HistoryStatus = z.infer<typeof historyStatusSchema>;

export const HISTORY_SORTS = ['newest', 'oldest', 'score'] as const;
export const historySortSchema = z.enum(HISTORY_SORTS);
export type HistorySort = z.infer<typeof historySortSchema>;

export const attemptHistoryQuerySchema = z.object({
  quizId: z.string().uuid('Invalid quiz id').optional(),
  status: historyStatusSchema.optional(),
  sort: historySortSchema.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type AttemptHistoryQuery = z.infer<typeof attemptHistoryQuerySchema>;

export const attemptHistoryItemSchema = z.object({
  id: z.string(),
  quizId: z.string(),
  quizTitle: z.string(),
  quizSlug: z.string(),
  categoryName: z.string(),
  difficulty: difficultySchema,
  status: attemptStatusSchema,
  /** `true` only for PASSED — the history row badge. */
  passed: z.boolean(),
  score: z.number(),
  totalMarks: z.number(),
  percentage: z.number(),
  correctAnswers: z.number(),
  incorrectAnswers: z.number(),
  unanswered: z.number(),
  passingScore: z.number(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  timeTakenSeconds: z.number(),
  /** `false` while the attempt is still open. */
  autoSubmitted: z.boolean(),
  /** Set while the attempt can still be resumed. */
  inProgress: z.boolean(),
});
export type AttemptHistoryItem = z.infer<typeof attemptHistoryItemSchema>;

export const attemptHistoryResponseSchema = z.object({
  attempts: z.array(attemptHistoryItemSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  filters: z.object({
    quizId: z.string().nullable(),
    status: historyStatusSchema.nullable(),
    sort: historySortSchema,
  }),
  /** Attempt state totals for the whole history, independent of the page. */
  totals: z.object({
    attempts: z.number(),
    passed: z.number(),
    failed: z.number(),
    inProgress: z.number(),
    bestPercentage: z.number().nullable(),
  }),
});
export type AttemptHistoryResponse = z.infer<typeof attemptHistoryResponseSchema>;

/** Attempt status as the history row and the review header label it. */
export function historyStatusLabel(item: {
  status: 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'EXPIRED';
}): string {
  switch (item.status) {
    case 'PASSED':
      return 'Passed';
    case 'FAILED':
      return 'Failed';
    case 'EXPIRED':
      return 'Expired';
    default:
      return 'In progress';
  }
}
