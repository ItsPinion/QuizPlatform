import { describe, expect, it } from 'vitest';

import {
  adminUserSchema,
  dashboardStatsSchema,
  updateUserSchema,
  userListQuerySchema,
  userListResponseSchema,
} from './admin';

describe('userListQuerySchema', () => {
  it('defaults to page 1, 10 per page, newest first', () => {
    expect(userListQuerySchema.parse({})).toEqual({
      sort: 'newest',
      page: 1,
      pageSize: 10,
    });
  });

  it('coerces numeric query strings', () => {
    const parsed = userListQuerySchema.parse({ page: '3', pageSize: '25' });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(25);
  });

  it('trims the search term and keeps it optional', () => {
    expect(userListQuerySchema.parse({ search: '  priya  ' }).search).toBe('priya');
    expect(userListQuerySchema.parse({}).search).toBeUndefined();
  });

  it('rejects a page size above the maximum', () => {
    expect(() => userListQuerySchema.parse({ pageSize: '999' })).toThrow();
  });

  it('rejects non-numeric and zero pages', () => {
    expect(() => userListQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => userListQuerySchema.parse({ page: 'abc' })).toThrow();
  });

  it('rejects an unknown role, status or sort', () => {
    expect(() => userListQuerySchema.parse({ role: 'TEACHER' })).toThrow();
    expect(() => userListQuerySchema.parse({ status: 'PENDING' })).toThrow();
    expect(() => userListQuerySchema.parse({ sort: 'random' })).toThrow();
  });

  it('strips unknown query parameters', () => {
    const parsed = userListQuerySchema.parse({ page: '2', drop: 'table' });
    expect(parsed).not.toHaveProperty('drop');
  });
});

describe('updateUserSchema', () => {
  it('accepts a role, a status, or both', () => {
    expect(updateUserSchema.parse({ role: 'ADMIN' })).toEqual({ role: 'ADMIN' });
    expect(updateUserSchema.parse({ status: 'INACTIVE' })).toEqual({ status: 'INACTIVE' });
    expect(updateUserSchema.parse({ role: 'STUDENT', status: 'ACTIVE' })).toEqual({
      role: 'STUDENT',
      status: 'ACTIVE',
    });
  });

  it('rejects an empty body instead of treating it as a no-op', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Provide role or status to update');
    }
  });

  it('rejects fields the dashboard must not change', () => {
    const parsed = updateUserSchema.parse({ role: 'ADMIN', email: 'hijack@quiz.dev' });
    expect(parsed).not.toHaveProperty('email');
  });

  it('rejects invalid enum values', () => {
    expect(() => updateUserSchema.parse({ role: 'SUPERUSER' })).toThrow();
    expect(() => updateUserSchema.parse({ status: 'DELETED' })).toThrow();
  });
});

describe('adminUserSchema', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Priya Sharma',
    email: 'priya@quiz.dev',
    role: 'STUDENT',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    attempts: 4,
    completedAttempts: 3,
    bestPercentage: 88.5,
    lastAttemptAt: '2026-01-05T00:00:00.000Z',
  };

  it('accepts a full row', () => {
    expect(adminUserSchema.parse(user)).toEqual(user);
  });

  it('accepts a user who never attempted a quiz', () => {
    const parsed = adminUserSchema.parse({
      ...user,
      attempts: 0,
      completedAttempts: 0,
      bestPercentage: null,
      lastAttemptAt: null,
    });
    expect(parsed.bestPercentage).toBeNull();
  });

  it('carries no credential field', () => {
    const shape = Object.keys(adminUserSchema.shape);
    expect(shape).not.toContain('passwordHash');
    expect(shape).not.toContain('password');
  });
});

describe('userListResponseSchema', () => {
  it('requires pagination and filter echoes', () => {
    const result = userListResponseSchema.safeParse({
      users: [],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
      filters: { search: null, role: null, status: null, sort: 'newest' },
    });

    expect(result.success).toBe(true);
    expect(userListResponseSchema.safeParse({ users: [] }).success).toBe(false);
  });
});

describe('dashboardStatsSchema', () => {
  const stats = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    users: { total: 4, active: 4, inactive: 0, admins: 1, students: 3, joinedLast7Days: 1 },
    content: {
      categories: 10,
      quizzes: 10,
      published: 7,
      drafts: 2,
      unpublished: 1,
      questions: 47,
      options: 188,
    },
    attempts: {
      total: 14,
      inProgress: 2,
      passed: 8,
      failed: 3,
      expired: 1,
      learners: 3,
      averagePercentage: 66.7,
      passRate: 66.7,
    },
    recentUsers: [],
    recentAttempts: [],
  };

  it('accepts a well-formed payload', () => {
    expect(dashboardStatsSchema.parse(stats).users.total).toBe(4);
  });

  it('rejects an unknown attempt status in recent activity', () => {
    const broken = {
      ...stats,
      recentAttempts: [
        {
          id: 'abc',
          userName: 'Rahul',
          quizTitle: 'HTML',
          status: 'CHEATED',
          percentage: 10,
          startedAt: stats.generatedAt,
        },
      ],
    };

    expect(dashboardStatsSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a payload missing a section', () => {
    const { users: _users, ...rest } = stats;
    expect(dashboardStatsSchema.safeParse(rest).success).toBe(false);
  });
});
