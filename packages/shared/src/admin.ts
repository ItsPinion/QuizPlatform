/**
 * Admin console contracts (Day 4).
 *
 * The dashboard and the user-management screens are typed from these schemas:
 * the API parses query strings and bodies with them, and the web app renders
 * the same shapes through Hono RPC. One definition, two consumers.
 */
import { z } from 'zod';

import { roleSchema, userStatusSchema } from './index';

/* -------------------------------------------------------------------------- */
/*  Users                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A user as the admin console sees them: the safe columns plus aggregates the
 * dashboard needs. The password hash is never part of this shape.
 */
export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  status: userStatusSchema,
  createdAt: z.string(),
  /** Total attempts started, including the ones still in progress. */
  attempts: z.number(),
  /** Attempts that were graded (PASSED / FAILED / EXPIRED). */
  completedAttempts: z.number(),
  /** Best scored percentage across completed attempts, null when none. */
  bestPercentage: z.number().nullable(),
  /**
   * Mean percentage across graded attempts, null when none.
   *
   * §6's "Student Information" table asks for both an average and a highest
   * score, and the directory is where a teacher scans them — so the average is
   * part of the row, not something you have to open a profile to find.
   */
  averagePercentage: z.number().nullable(),
  /** Start time of the most recent attempt, null when the user never tried. */
  lastAttemptAt: z.string().nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const USER_SORTS = ['newest', 'oldest', 'name', 'attempts'] as const;
export const userSortSchema = z.enum(USER_SORTS);
export type UserSort = z.infer<typeof userSortSchema>;

/**
 * Query string for `GET /api/admin/users`.
 *
 * Everything is optional so `?` alone is valid; `page`/`pageSize` are coerced
 * because query values arrive as strings.
 */
export const userListQuerySchema = z.object({
  search: z.string().trim().max(120, 'Search is too long').optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  sort: userSortSchema.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userListResponseSchema = z.object({
  users: z.array(adminUserSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  /** Echo of the applied filters, so the UI can render "no results for …". */
  filters: z.object({
    search: z.string().nullable(),
    role: z.enum(['ADMIN', 'STUDENT']).nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).nullable(),
    sort: userSortSchema,
  }),
});
export type UserListResponse = z.infer<typeof userListResponseSchema>;

/**
 * Body of `PATCH /api/admin/users/:id`.
 *
 * At least one field is required — an empty body is a validation error rather
 * than a silent no-op. `passwordHash` and `email` are deliberately absent:
 * changing someone's identity is not a dashboard action.
 */
export const updateUserSchema = z
  .object({
    role: roleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'Provide role or status to update',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * Body of `PATCH /api/admin/users/:id/status`.
 *
 * A one-field route for the switch in the users table: activate / deactivate.
 * Same effect as the `PATCH` above, but its narrower shape means the client
 * cannot accidentally change a role while flipping a switch.
 */
export const userStatusPatchSchema = z.object({ status: userStatusSchema });
export type UserStatusPatch = z.infer<typeof userStatusPatchSchema>;

export const userDetailResponseSchema = z.object({ user: adminUserSchema });
export type UserDetailResponse = z.infer<typeof userDetailResponseSchema>;

/* -------------------------------------------------------------------------- */
/*  Dashboard statistics                                                      */
/* -------------------------------------------------------------------------- */

export const recentAttemptSchema = z.object({
  id: z.string(),
  userName: z.string(),
  quizTitle: z.string(),
  status: z.enum(['IN_PROGRESS', 'PASSED', 'FAILED', 'EXPIRED']),
  percentage: z.number(),
  startedAt: z.string(),
});
export type RecentAttempt = z.infer<typeof recentAttemptSchema>;

export const dashboardStatsSchema = z.object({
  /** ISO timestamp of the moment the numbers were read. */
  generatedAt: z.string(),
  users: z.object({
    total: z.number(),
    active: z.number(),
    inactive: z.number(),
    admins: z.number(),
    students: z.number(),
    joinedLast7Days: z.number(),
  }),
  content: z.object({
    categories: z.number(),
    quizzes: z.number(),
    published: z.number(),
    drafts: z.number(),
    unpublished: z.number(),
    questions: z.number(),
    options: z.number(),
  }),
  attempts: z.object({
    total: z.number(),
    inProgress: z.number(),
    passed: z.number(),
    failed: z.number(),
    expired: z.number(),
    /** Students with at least one attempt. */
    learners: z.number(),
    /** Mean percentage over graded attempts; 0 when there are none. */
    averagePercentage: z.number(),
    /** passed / graded, as a 0–100 percentage, one decimal. */
    passRate: z.number(),
  }),
  /** Five newest accounts — the "who just joined" strip. */
  recentUsers: z.array(
    adminUserSchema.pick({
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    }),
  ),
  /** Five most recent attempts, newest first. */
  recentAttempts: z.array(recentAttemptSchema),
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
