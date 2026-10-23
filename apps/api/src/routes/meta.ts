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
        'GET /api/student/access': 'STUDENT-only scope descriptor (role guard)',
        'GET /api/meta': 'This document',
      },
      roadmap: [
        { day: 5, area: 'quizzes', endpoints: ['CRUD + publish/unpublish'] },
        { day: 6, area: 'questions', endpoints: ['CRUD + options'] },
        { day: 8, area: 'attempts', endpoints: ['start', 'submit', 'backend scoring'] },
        { day: 11, area: 'analytics', endpoints: ['GET /api/admin/analytics'] },
        { day: 12, area: 'leaderboard', endpoints: ['GET /api/leaderboard'] },
      ],
    },
    200,
  ),
);
