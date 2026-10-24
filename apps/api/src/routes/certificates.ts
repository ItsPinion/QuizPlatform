import { verifyQuerySchema } from '@quiz/shared/certificate';
import { Hono } from 'hono';

import { certificateForCode } from '../lib/certificates';
import { ApiError } from '../lib/errors';
import type { AppEnv } from '../lib/types';

/**
 * Public certificate verification — no session, by design.
 *
 * The whole value of a certificate is that somebody who was not here can check
 * it. A recruiter with a link should not need an account on a quiz platform, so
 * this route answers what the printed document already says and nothing more:
 * no email address, no user id, no list endpoint, no way to search.
 *
 * `GET /api/certificates/verify/:code` is the same shape the spec asks for under
 * `/api/certificates/verify/:code`.
 */
export const certificateRoutes = new Hono<AppEnv>().get('/verify/:code', async (c) => {
  // Validated through the shared schema so an absurd code is a clean 400 rather
  // than a wildcard lookup.
  const { code } = verifyQuerySchema.parse({ code: c.req.param('code') });

  const certificate = await certificateForCode(code);

  if (!certificate) {
    throw new ApiError(
      404,
      'CERTIFICATE_NOT_FOUND',
      'No certificate matches that code. Check the characters and try again.',
    );
  }

  return c.json({ certificate }, 200);
});
