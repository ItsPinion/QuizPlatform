import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*  Domain enums                                                              */
/* -------------------------------------------------------------------------- */

export const ROLES = ['ADMIN', 'STUDENT'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export const difficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof difficultySchema>;

export const QUIZ_STATUSES = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] as const;
export const quizStatusSchema = z.enum(QUIZ_STATUSES);
export type QuizStatus = z.infer<typeof quizStatusSchema>;

export const ATTEMPT_STATUSES = ['IN_PROGRESS', 'PASSED', 'FAILED', 'EXPIRED'] as const;
export const attemptStatusSchema = z.enum(ATTEMPT_STATUSES);
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;

/* -------------------------------------------------------------------------- */
/*  API envelopes                                                             */
/* -------------------------------------------------------------------------- */

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/* -------------------------------------------------------------------------- */
/*  Health / status                                                          */
/* -------------------------------------------------------------------------- */

export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('quiz-api'),
  version: z.string(),
  runtime: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

export const databaseStatusSchema = z.object({
  connected: z.boolean(),
  target: z.enum(['turso', 'local-file', 'unknown']),
  urlHint: z.string(),
  latencyMs: z.number().nullable(),
  counts: z.object({
    users: z.number(),
    categories: z.number(),
    quizzes: z.number(),
    questions: z.number(),
    attempts: z.number(),
  }),
});
export type DatabaseStatus = z.infer<typeof databaseStatusSchema>;

/* -------------------------------------------------------------------------- */
/*  Validation primitives (reused by Day 2+ auth & CRUD routes)               */
/* -------------------------------------------------------------------------- */

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const idSchema = z.string().uuid('Invalid id');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;
