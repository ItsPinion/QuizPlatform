import { landingPayloadSchema } from '@quiz/shared/landing';
import { Hono } from 'hono';

import { buildLandingPayload, emptyLandingPayload } from '../lib/landing';

/**
 * The landing page's data, public and read-only.
 *
 * This is the one unauthenticated endpoint that reads the content tables, and it
 * is deliberately narrow: counts, ranges over the published catalogue, one
 * question without its key and one graded paper without its student. Anything
 * that needs a session stays behind the admin or student namespace.
 *
 * `no-store` comes from the global middleware, so a refresh always shows the
 * current numbers rather than a cached snapshot from an hour ago.
 */
export const landingRoutes = new Hono().get('/', async (c) => {
  try {
    return c.json(landingPayloadSchema.parse(await buildLandingPayload()), 200);
  } catch (error) {
    // An unconfigured or unreachable database is a fact about this deployment,
    // not a server error: the page renders its empty states and says why.
    console.error('[landing] could not read the database:', error);

    return c.json(landingPayloadSchema.parse(emptyLandingPayload(error)), 200);
  }
});
