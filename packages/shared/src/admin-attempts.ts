/**
 * Every attempt, on one screen.
 *
 * The student sees their own history; the admin sees the platform's. Same rows,
 * different questions: who took what, how they did, and which paper is
 * struggling. A detail view answers the rest — the answers themselves, in order,
 * with the key — because "view individual student results" and "view quiz
 * performance" are the same list read from two directions.
 */
import { z } from 'zod';

import { attemptStatusSchema } from './index';

/** One row of the admin attempt table. */
export const adminAttemptSchema = z.object({
  id: z.string(),
  quizId: z.string(),
  quizTitle: z.string(),
  categoryName: z.string(),
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  status: attemptStatusSchema,
  percentage: z.number(),
  score: z.number(),
  totalMarks: z.number(),
  correctAnswers: z.number(),
  incorrectAnswers: z.number(),
  unanswered: z.number(),
  timeTakenSeconds: z.number(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  /** True when the clock finished it rather than the student. */
  autoSubmitted: z.boolean(),
});
export type AdminAttempt = z.infer<typeof adminAttemptSchema>;

export const ADMIN_ATTEMPT_SORTS = ['newest', 'oldest', 'score', 'duration'] as const;
export const adminAttemptSortSchema = z.enum(ADMIN_ATTEMPT_SORTS);
export type AdminAttemptSort = z.infer<typeof adminAttemptSortSchema>;

/** Status filter: one status, or `ALL`. */
export const ADMIN_ATTEMPT_STATUSES = ['ALL', 'IN_PROGRESS', 'PASSED', 'FAILED'] as const;
export const adminAttemptStatusFilterSchema = z.enum(ADMIN_ATTEMPT_STATUSES);
export type AdminAttemptStatusFilter = z.infer<typeof adminAttemptStatusFilterSchema>;

export const adminAttemptQuerySchema = z.object({
  search: z.string().trim().max(120, 'Search is too long').optional(),
  quizId: z.string().uuid('Invalid quiz id').optional(),
  userId: z.string().uuid('Invalid user id').optional(),
  status: adminAttemptStatusFilterSchema.default('ALL'),
  sort: adminAttemptSortSchema.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminAttemptQuery = z.infer<typeof adminAttemptQuerySchema>;

/**
 * Totals for the filtered set, not the whole platform.
 *
 * The summary under the filters has to describe what is on screen — "12
 * attempts, 58% average" for the filtered rows — otherwise a filter looks
 * broken.
 */
export const adminAttemptSummarySchema = z.object({
  attempts: z.number(),
  graded: z.number(),
  passed: z.number(),
  failed: z.number(),
  averagePercentage: z.number(),
  participants: z.number(),
  quizzes: z.number(),
});
export type AdminAttemptSummary = z.infer<typeof adminAttemptSummarySchema>;

export const adminAttemptListResponseSchema = z.object({
  attempts: z.array(adminAttemptSchema),
  summary: adminAttemptSummarySchema,
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
    quizId: z.string().nullable(),
    userId: z.string().nullable(),
    status: adminAttemptStatusFilterSchema,
    sort: adminAttemptSortSchema,
  }),
});
export type AdminAttemptListResponse = z.infer<typeof adminAttemptListResponseSchema>;

/** One answered question in the admin's view of a paper. */
export const adminAttemptAnswerSchema = z.object({
  questionId: z.string(),
  questionText: z.string(),
  position: z.number(),
  marks: z.number(),
  explanation: z.string().nullable(),
  options: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      isCorrect: z.boolean(),
    }),
  ),
  selectedOptionId: z.string().nullable(),
  /** Null when unanswered — the same rule the review screen uses. */
  isCorrect: z.boolean().nullable(),
});
export type AdminAttemptAnswer = z.infer<typeof adminAttemptAnswerSchema>;

export const adminAttemptDetailResponseSchema = z.object({
  attempt: adminAttemptSchema,
  quiz: z.object({
    id: z.string(),
    title: z.string(),
    categoryName: z.string(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    passingScore: z.number(),
    negativeMarks: z.number(),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
  }),
  answers: z.array(adminAttemptAnswerSchema),
  /** The penalty taken off this attempt, for the score breakdown. */
  penalty: z.number(),
});
export type AdminAttemptDetailResponse = z.infer<typeof adminAttemptDetailResponseSchema>;

/* -------------------------------------------------------------------------- */
/*  A single student, as the console sees them                                */
/* -------------------------------------------------------------------------- */

export const studentHistoryEntrySchema = z.object({
  id: z.string(),
  quizId: z.string(),
  quizTitle: z.string(),
  categoryName: z.string(),
  status: attemptStatusSchema,
  percentage: z.number(),
  score: z.number(),
  totalMarks: z.number(),
  passed: z.boolean(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const studentProfileSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.enum(['ADMIN', 'STUDENT']),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    createdAt: z.string(),
  }),
  stats: z.object({
    attempts: z.number(),
    completed: z.number(),
    passed: z.number(),
    failed: z.number(),
    inProgress: z.number(),
    averagePercentage: z.number(),
    bestPercentage: z.number().nullable(),
    worstPercentage: z.number().nullable(),
    questionsAnswered: z.number(),
    questionsCorrect: z.number(),
    timeSpentSeconds: z.number(),
    /** Distinct quizzes taken at least once. */
    quizzesAttempted: z.number(),
    certificates: z.number(),
  }),
  /** Every attempt, newest first — the profile's history table. */
  history: z.array(studentHistoryEntrySchema),
  categories: z.array(
    z.object({
      categoryId: z.string(),
      categoryName: z.string(),
      attempts: z.number(),
      averagePercentage: z.number(),
    }),
  ),
});
export type StudentProfile = z.infer<typeof studentProfileSchema>;

export const studentProfileResponseSchema = z.object({ profile: studentProfileSchema });
export type StudentProfileResponse = z.infer<typeof studentProfileResponseSchema>;

export const deleteUserResponseSchema = z.object({
  deleted: z.literal(true),
  id: z.string(),
  /** Attempts and answers removed with the account, for the confirmation toast. */
  removedAttempts: z.number(),
});
export type DeleteUserResponse = z.infer<typeof deleteUserResponseSchema>;
