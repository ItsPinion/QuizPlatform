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
        'GET /api/admin/categories': 'Category list with quiz counts',
        'POST /api/admin/categories': 'Create a category, or return the matching one (201 / 200)',
        'GET /api/admin/categories/:id': 'One category and the quizzes filed under it',
        'PATCH /api/admin/categories/:id': 'Rename / re-describe; the slug stays stable',
        'DELETE /api/admin/categories/:id': 'Delete a category that has no quizzes',
        'GET /api/admin/quizzes': 'Paged, filtered quiz directory for the console',
        'POST /api/admin/quizzes': 'Create a quiz (always starts as DRAFT)',
        'GET /api/admin/quizzes/:id': 'One quiz with question and attempt counts',
        'PATCH /api/admin/quizzes/:id': 'Edit a quiz; the slug stays stable',
        'DELETE /api/admin/quizzes/:id': 'Delete a quiz that has no attempts',
        'POST /api/admin/quizzes/:id/publish': 'Publish (needs at least one question)',
        'POST /api/admin/quizzes/:id/unpublish': 'Take a published quiz offline',
        'GET /api/admin/quizzes/:id/questions': "A quiz's questions with options and answer counts",
        'POST /api/admin/quizzes/:id/questions': 'Author a question (2-6 options, one correct)',
        'PATCH /api/admin/quizzes/:id/questions/order': 'Reorder the whole question list',
        'GET /api/admin/questions/:id': 'One question',
        'PUT /api/admin/questions/:id': 'Replace a question and reconcile its options',
        'DELETE /api/admin/questions/:id': 'Delete an unanswered question',
        'GET /api/student/access': 'STUDENT-only scope descriptor (role guard)',
        'GET /api/student/categories': 'Categories that have at least one published quiz',
        'GET /api/student/quizzes': 'Published quiz catalogue with the caller’s attempt state',
        'GET /api/student/quizzes/:id': 'One published quiz + whether it can be started',
        'POST /api/student/quizzes/:id/start': 'Start an attempt, or resume the one in flight',
        'GET /api/student/dashboard': 'Statistics, trend, category breakdown and activity',
        'GET /api/student/attempts': 'Paged attempt history with scores and counts',
        'GET /api/student/attempts/:id': 'Questions and saved answers, with no answer key',
        'GET /api/student/attempts/:id/review': 'The answer key, only once the attempt is finished',
        'PUT /api/student/attempts/:id/answers/:questionId': 'Save or clear one answer',
        'POST /api/student/attempts/:id/submit': 'Grade the paper (manual or at the deadline)',
        'GET /api/meta': 'This document',
      },
      roadmap: [
        { day: 11, area: 'admin analytics', endpoints: ['GET /api/admin/analytics'] },
        { day: 12, area: 'leaderboard', endpoints: ['GET /api/leaderboard'] },
      ],
    },
    200,
  ),
);
