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
      status: 'scaffolded',
      docs: {
        'GET /api/health': 'Liveness probe',
        'GET /api/health/db': 'Database readiness probe with row counts',
        'GET /api/meta': 'This document',
      },
      roadmap: [
        {
          day: 2,
          area: 'auth',
          endpoints: [
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/auth/logout',
            'GET /api/auth/me',
          ],
        },
        { day: 3, area: 'authorization', endpoints: ['role-based middleware for ADMIN / STUDENT'] },
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
