/**
 * Student quiz-taking contracts (Day 7).
 *
 * Two rules shape this file:
 *
 * 1. **The browser never grades.** The attempt payload sent to a student carries
 *    option text but no `isCorrect` flag and no explanation — there is nothing
 *    to read out of the network tab.
 * 2. **The server owns the clock.** `expiresAt` is set when the attempt starts
 *    and every answer write is checked against it. The countdown in the UI is a
 *    convenience that re-derives from that timestamp, so a refresh (or a
 *    devtools clock change) cannot buy extra time.
 */
import { z } from 'zod';

import { difficultySchema, quizStatusSchema } from './index';

/* -------------------------------------------------------------------------- */
/*  Time                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Whole seconds left before `expiresAt`, never negative.
 *
 * Rounded up: a deadline 400 ms away is still "1 second left", which is what a
 * countdown should show before it hits zero.
 */
export function secondsRemaining(
  expiresAt: string | number | Date,
  now: number = Date.now(),
): number {
  const deadline =
    expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime() || 0;

  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** `14:32` under an hour, `1:04:32` above it — the shape a timer needs. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;

  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/* -------------------------------------------------------------------------- */
/*  Quizzes a student may take                                                */
/* -------------------------------------------------------------------------- */

export const studentQuizSchema = z.object({
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
  questionCount: z.number(),
  totalMarks: z.number(),
  thumbnailUrl: z.string().nullable(),
  /** Every attempt this student has started, finished or not. */
  attemptsUsed: z.number(),
  attemptsRemaining: z.number(),
  /** Best completed percentage, or null when they have never finished one. */
  bestPercentage: z.number().nullable(),
  lastAttemptAt: z.string().nullable(),
  /** Set only while an attempt is still inside its time window. */
  inProgressAttemptId: z.string().nullable(),
});
export type StudentQuiz = z.infer<typeof studentQuizSchema>;

export const STUDENT_QUIZ_SORTS = ['newest', 'title', 'duration'] as const;
export const studentQuizSortSchema = z.enum(STUDENT_QUIZ_SORTS);
export type StudentQuizSort = z.infer<typeof studentQuizSortSchema>;

export const studentQuizListQuerySchema = z.object({
  search: z.string().trim().max(120, 'Search is too long').optional(),
  categoryId: z.string().uuid('Invalid category id').optional(),
  difficulty: difficultySchema.optional(),
  sort: studentQuizSortSchema.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(9),
});
export type StudentQuizListQuery = z.infer<typeof studentQuizListQuerySchema>;

export const studentQuizListResponseSchema = z.object({
  quizzes: z.array(studentQuizSchema),
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
    categoryId: z.string().nullable(),
    difficulty: z.string().nullable(),
    sort: studentQuizSortSchema,
  }),
});
export type StudentQuizListResponse = z.infer<typeof studentQuizListResponseSchema>;

export const studentQuizDetailResponseSchema = z.object({
  quiz: studentQuizSchema,
  /** Decided on the server, so the button and the API cannot disagree. */
  start: z.object({
    allowed: z.boolean(),
    code: z.string().nullable(),
    message: z.string().nullable(),
  }),
});
export type StudentQuizDetailResponse = z.infer<typeof studentQuizDetailResponseSchema>;

/* -------------------------------------------------------------------------- */
/*  Starting an attempt                                                       */
/* -------------------------------------------------------------------------- */

export type StartBlockerCode =
  'QUIZ_NOT_PUBLISHED' | 'QUIZ_HAS_NO_QUESTIONS' | 'ATTEMPTS_EXHAUSTED';

export interface StartDecision {
  allowed: boolean;
  code: StartBlockerCode | null;
  message: string | null;
}

/**
 * Can this student start (or resume) this quiz?
 *
 * A live in-progress attempt always wins: resuming is not a second attempt, so
 * it is allowed even when every attempt has been used. Anything that would take
 * marks away from the student is refused with a reason the UI prints verbatim.
 */
export function startDecision(quiz: {
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  questionCount: number;
  maxAttempts: number;
  attemptsUsed: number;
  inProgressAttemptId: string | null;
}): StartDecision {
  if (quiz.status !== 'PUBLISHED') {
    return {
      allowed: false,
      code: 'QUIZ_NOT_PUBLISHED',
      message: 'This quiz is not published.',
    };
  }

  if (quiz.questionCount === 0) {
    return {
      allowed: false,
      code: 'QUIZ_HAS_NO_QUESTIONS',
      message: 'This quiz has no questions yet.',
    };
  }

  if (quiz.inProgressAttemptId) return { allowed: true, code: null, message: null };

  if (quiz.attemptsUsed >= quiz.maxAttempts) {
    return {
      allowed: false,
      code: 'ATTEMPTS_EXHAUSTED',
      message: `You have used all ${quiz.maxAttempts} attempt${quiz.maxAttempts === 1 ? '' : 's'} for this quiz.`,
    };
  }

  return { allowed: true, code: null, message: null };
}

/* -------------------------------------------------------------------------- */
/*  The attempt itself                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One option as the student sees it: text and position, never correctness.
 */
export const attemptOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  position: z.number(),
});
export type AttemptOption = z.infer<typeof attemptOptionSchema>;

export const attemptQuestionSchema = z.object({
  id: z.string(),
  position: z.number(),
  questionText: z.string(),
  marks: z.number(),
  difficulty: difficultySchema,
  options: z.array(attemptOptionSchema),
});
export type AttemptQuestion = z.infer<typeof attemptQuestionSchema>;

export const attemptAnswerSchema = z.object({
  questionId: z.string(),
  selectedOptionId: z.string().nullable(),
});
export type AttemptAnswer = z.infer<typeof attemptAnswerSchema>;

export const attemptSessionSchema = z.object({
  attempt: z.object({
    id: z.string(),
    status: z.enum(['IN_PROGRESS', 'PASSED', 'FAILED', 'EXPIRED']),
    startedAt: z.string(),
    expiresAt: z.string(),
    /** Server-computed, so the client countdown has an authoritative starting point. */
    secondsRemaining: z.number(),
    expired: z.boolean(),
    /** So the client can correct for clock skew between machines. */
    serverNow: z.string(),
  }),
  quiz: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    durationMinutes: z.number(),
    passingScore: z.number(),
    questionCount: z.number(),
    totalMarks: z.number(),
  }),
  questions: z.array(attemptQuestionSchema),
  answers: z.array(attemptAnswerSchema),
});
export type AttemptSession = z.infer<typeof attemptSessionSchema>;

export const startAttemptResponseSchema = z.object({
  attemptId: z.string(),
  quizId: z.string(),
  /** `true` when an existing live attempt was picked up instead of a new one. */
  resumed: z.boolean(),
  startedAt: z.string(),
  expiresAt: z.string(),
  secondsRemaining: z.number(),
});
export type StartAttemptResponse = z.infer<typeof startAttemptResponseSchema>;

/** `null` clears the answer — choosing nothing is different from not answering. */
export const saveAnswerSchema = z.object({
  optionId: z.string().uuid('Invalid option id').nullable(),
});
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export const saveAnswerResponseSchema = z.object({
  answer: z.object({
    questionId: z.string(),
    selectedOptionId: z.string().nullable(),
  }),
  progress: z.object({
    answered: z.number(),
    unanswered: z.number(),
    total: z.number(),
  }),
});
export type SaveAnswerResponse = z.infer<typeof saveAnswerResponseSchema>;

/* -------------------------------------------------------------------------- */
/*  Progress                                                                  */
/* -------------------------------------------------------------------------- */

export interface AttemptProgress {
  answered: number;
  unanswered: number;
  total: number;
}

/**
 * How much of the attempt is done. Only questions that belong to the attempt
 * count, so a stale answer row can never inflate the number.
 */
export function attemptProgress(
  questions: readonly { id: string }[],
  answers: readonly { questionId: string; selectedOptionId: string | null }[],
): AttemptProgress {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer.selectedOptionId]));

  const answered = questions.filter((question) => {
    const selected = byQuestion.get(question.id);
    return selected != null;
  }).length;

  return {
    answered,
    unanswered: questions.length - answered,
    total: questions.length,
  };
}

/** Status label the student UI shows for an attempt that is still open. */
export function attemptTimerTone(seconds: number): 'normal' | 'warning' | 'critical' {
  if (seconds <= 60) return 'critical';
  if (seconds <= 300) return 'warning';
  return 'normal';
}

/** Used by the catalogue badge. */
export const studentQuizStatusSchema = quizStatusSchema;
