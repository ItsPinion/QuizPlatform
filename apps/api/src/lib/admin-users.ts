import { and, asc, count, desc, eq, like, or, sql } from 'drizzle-orm';

import type {
  AdminUser,
  UserListQuery,
  UserListResponse,
  UpdateUserInput,
  UserSort,
} from '@quiz/shared/admin';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';

const { attempts, users } = schema;

/** Column set + attempt aggregates shared by the list and the detail routes. */
const userSelection = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
  attempts: count(attempts.id),
  completedAttempts:
    sql<number>`coalesce(sum(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then 1 else 0 end), 0)`.mapWith(
      Number,
    ),
  bestPercentage: sql<
    number | null
  >`max(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then ${attempts.percentage} end)`.mapWith(
    Number,
  ),
  averagePercentage: sql<
    number | null
  >`avg(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then ${attempts.percentage} end)`.mapWith(
    Number,
  ),
  lastAttemptAt: sql<number | null>`max(${attempts.startedAt})`.mapWith(Number),
} as const;

type RawUserRow = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STUDENT';
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  attempts: number;
  completedAttempts: number;
  bestPercentage: number | null;
  averagePercentage: number | null;
  lastAttemptAt: number | null;
};

function toAdminUser(row: RawUserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    attempts: Number(row.attempts ?? 0),
    completedAttempts: Number(row.completedAttempts ?? 0),
    bestPercentage: row.bestPercentage === null ? null : Number(row.bestPercentage),
    // `avg()` returns a float; the directory shows one decimal, so round here
    // rather than in three components.
    averagePercentage:
      row.averagePercentage === null ? null : Math.round(Number(row.averagePercentage) * 10) / 10,
    lastAttemptAt:
      row.lastAttemptAt === null ? null : new Date(Number(row.lastAttemptAt)).toISOString(),
  };
}

/** Sort key → ORDER BY, including the aggregate for the "most active" sort. */
function orderFor(sort: UserSort) {
  switch (sort) {
    case 'oldest':
      return asc(users.createdAt);
    case 'name':
      return asc(users.name);
    case 'attempts':
      return desc(sql`count(${attempts.id})`);
    default:
      return desc(users.createdAt);
  }
}

function filtersFor(query: UserListQuery) {
  const clauses = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    const match = or(like(users.name, pattern), like(users.email, pattern));
    if (match) clauses.push(match);
  }

  if (query.role) clauses.push(eq(users.role, query.role));
  if (query.status) clauses.push(eq(users.status, query.status));

  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listUsers(query: UserListQuery): Promise<UserListResponse> {
  const where = filtersFor(query);

  const [rows, [totals]] = await Promise.all([
    db
      .select(userSelection)
      .from(users)
      .leftJoin(attempts, eq(attempts.userId, users.id))
      .where(where)
      .groupBy(users.id)
      .orderBy(orderFor(query.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(users).where(where),
  ]);

  const total = Number(totals?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    users: rows.map((row) => toAdminUser(row as RawUserRow)),
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
      role: query.role ?? null,
      status: query.status ?? null,
      sort: query.sort,
    },
  };
}

export async function getUserById(id: string): Promise<AdminUser | null> {
  const [row] = await db
    .select(userSelection)
    .from(users)
    .leftJoin(attempts, eq(attempts.userId, users.id))
    .where(eq(users.id, id))
    .groupBy(users.id)
    .limit(1);

  return row ? toAdminUser(row as RawUserRow) : null;
}

/**
 * Apply a role/status change.
 *
 * One rule protects the platform from locking itself out: an administrator
 * cannot demote or deactivate the account they are signed in with. Because
 * every caller of this route is an active admin, that single rule *is* the
 * "at least one admin must remain" invariant — any other admin can still be
 * demoted, and the admin doing it stays.
 *
 * It is a 409, not a 403: the request is well formed and the caller is
 * allowed; it is the resulting state that is refused.
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<AdminUser> {
  const [target] = await db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!target) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'No user with that id exists.');
  }

  const nextRole = input.role ?? target.role;
  const nextStatus = input.status ?? target.status;
  const losesAdmin = target.role === 'ADMIN' && (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE');

  if (target.id === actorId && losesAdmin) {
    throw new ApiError(
      409,
      'SELF_LOCKOUT',
      'You cannot demote or deactivate the account you are signed in with.',
    );
  }

  if (nextRole !== target.role || nextStatus !== target.status) {
    await db.update(users).set({ role: nextRole, status: nextStatus }).where(eq(users.id, id));
  }

  const updated = await getUserById(id);
  if (!updated) throw new ApiError(404, 'USER_NOT_FOUND', 'No user with that id exists.');

  return updated;
}

/**
 * Delete an account.
 *
 * Attempts, answers and certificates go with it — the schema cascades, which is
 * the right default: a deleted student's results are not something to keep in a
 * half-state. The one refusal is the caller's own account, for the same reason
 * the last bullet in `updateUser` exists: the console must not be able to
 * delete the only door into itself.
 *
 * The count is returned so the confirmation can say what went with it.
 */
export async function deleteUser(
  id: string,
  actorId: string,
): Promise<{ deleted: true; id: string; removedAttempts: number }> {
  if (id === actorId) {
    throw new ApiError(409, 'SELF_DELETE', 'You cannot delete the account you are signed in with.');
  }

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);

  if (!target) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'No user with that id exists.');
  }

  const [counted] = await db
    .select({ value: count() })
    .from(attempts)
    .where(eq(attempts.userId, id));

  await db.delete(users).where(eq(users.id, id));

  return { deleted: true, id, removedAttempts: Number(counted?.value ?? 0) };
}

/**
 * Activate / deactivate, as its own call.
 *
 * Delegates to `updateUser` so the self-lockout rule cannot be bypassed by using
 * the narrower endpoint.
 */
export async function setUserStatus(
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
  actorId: string,
): Promise<AdminUser> {
  return updateUser(id, { status }, actorId);
}
