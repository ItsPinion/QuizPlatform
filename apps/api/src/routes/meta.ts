import { Hono } from 'hono';

import { APP_VERSION } from '../lib/env';

/**
 * Discovery endpoint: what this API exposes today and what the roadmap adds.
 * Handy while the platform is being built day by day.
 */
export const metaRoutes = new Hono().get('/', (c) =>
  c.json(
    {
      name: 'Quiz Platform API',
      version: APP_VERSION,
      status: 'in progress',
      docs: {
        'GET /api/health': 'Liveness probe',
        'GET /api/health/db': 'Database readiness probe with row counts',
        'GET /api/auth/me': 'Current session user (requires the session cookie)',
        'POST /api/auth/register': 'Create a STUDENT account and sign in',
        'POST /api/auth/login': 'Exchange email + password for a session cookie',
        'POST /api/auth/logout': 'Clear the session cookie',
        'GET /api/admin/access': 'ADMIN-only scope descriptor (role guard)',
        'GET /api/admin/stats': 'Dashboard aggregates for the admin console',
        'GET /api/admin/users': 'Paged, filtered user directory',
        'GET /api/admin/users/:id': 'One user with attempt statistics',
        'PATCH /api/admin/users/:id': 'Change a user role or status (self-protection included)',
        'GET /api/admin/categories': 'Category list with quiz counts (Day 6 adds mutations)',
        'GET /api/admin/quizzes': 'Paged, filtered quiz directory for the console',
        'POST /api/admin/quizzes': 'Create a quiz (always starts as DRAFT)',
        'GET /api/admin/quizzes/:id': 'One quiz with question and attempt counts',
        'PATCH /api/admin/quizzes/:id': 'Edit a quiz; the slug stays stable',
        'DELETE /api/admin/quizzes/:id': 'Delete a quiz that has no attempts',
        'POST /api/admin/quizzes/:id/publish': 'Publish (needs at least one question)',
        'POST /api/admin/quizzes/:id/unpublish': 'Take a published quiz offline',
        'GET /api/student/access': 'STUDENT-only scope descriptor (role guard)',
        'GET /api/meta': 'This document',
      },
      roadmap: [
        { day: 6, area: 'categories & questions', endpoints: ['CRUD + options'] },
        { day: 8, area: 'attempts', endpoints: ['start', 'submit', 'backend scoring'] },
        { day: 11, area: 'analytics', endpoints: ['GET /api/admin/analytics'] },
        { day: 12, area: 'leaderboard', endpoints: ['GET /api/leaderboard'] },
      ],
    },
    200,
  ),
);
