import { Hono } from 'hono';

import { APP_VERSION } from '../lib/env';

/**
 * Discovery endpoint: what this API exposes today.
 *
 * Every day of the build plan has shipped, so `roadmap` is empty. It stays in the
 * payload because clients already read it, and the `deployment` block points at
 * the rules and the runbook instead.
 */
export const metaRoutes = new Hono().get('/', (c) =>
  c.json(
    {
      name: 'Quiz Platform API',
      version: APP_VERSION,
      status: 'feature complete',
      docs: {
        'GET /api/health': 'Liveness probe',
        'GET /api/health/db': 'Database readiness probe with row counts',
        'GET /api/auth/me': 'Current session user (requires the session cookie)',
        'POST /api/auth/register': 'Create a STUDENT account and sign in',
        'POST /api/auth/login': 'Exchange email + password for a session cookie',
        'POST /api/auth/logout': 'Clear the session cookie',
        'GET /api/admin/access': 'ADMIN-only scope descriptor (role guard)',
        'GET /api/admin/stats': 'Dashboard aggregates for the admin console',
        'GET /api/admin/analytics': 'Platform analytics: timeline, pass/fail, popularity',
        'GET /api/admin/system': 'Deployment self-report: config checks, database, limits',
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
        'GET /api/leaderboard': 'Overall and per-category rankings (average, best, completed)',
        'GET /api/meta': 'This document',
      },
      security: {
        rateLimit: 'auth routes: per-address and per-account failure buckets',
        originGuard: 'state-changing requests must come from an allowed origin',
        bodyLimit: 'oversized payloads are refused before parsing',
        session: 'HS256 JWT in an httpOnly cookie, scoped by issuer and audience',
        cache: 'every response is no-store',
        docs: 'docs/security.md',
      },
      deployment: {
        gate: 'GET /api/admin/system evaluates the eight environment rules',
        check: 'bun run deploy:check — the same rules locally, live probes with --url',
        containers: 'Dockerfile targets: api (port 3001) and web (port 3000)',
        migrate: 'drizzle-kit migrate is a release step, never a request path',
        docs: 'docs/deployment.md',
      },
      // Kept at the top level: clients already read it, and an empty list says
      // "feature complete" more clearly than removing the field.
      roadmap: [],
    },
    200,
  ),
);
