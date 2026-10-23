import { createMiddleware } from 'hono/factory';

import { isAllowedOrigin } from '../lib/env';
import { ApiError } from '../lib/errors';
import type { AppEnv } from '../lib/types';

/**
 * Reject state-changing requests that a foreign page is trying to make.
 *
 * The session cookie is `SameSite=Lax`, which already keeps the browser from
 * attaching it to a cross-site POST. This is the belt to that braces: if a
 * request carries an `Origin` header and that origin is not ours, it is refused
 * before any handler runs. That covers the cases `SameSite` cannot — an older
 * browser, a `SameSite=None` regression, or a future non-cookie auth scheme.
 *
 * Deliberate exemptions:
 * - **Safe methods** (`GET`, `HEAD`, `OPTIONS`) change nothing, so they pass.
 * - **Requests with no `Origin`** are not browser cross-site requests at all
 *   (curl, the e2e suite, a server-to-server call). Blocking them would break
 *   scripting without adding protection, because a browser always sends
 *   `Origin` on a cross-origin `POST`.
 * - **Logout** is exempt: it clears a cookie, and refusing it would let a stale
 *   cross-site request keep a victim signed in. Ending a session is never an
 *   attack worth blocking.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/api/auth/logout']);

export const requireSameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();

  if (SAFE_METHODS.has(method) || EXEMPT_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  const origin = c.req.header('origin');

  // No Origin → not a cross-site browser request. See the note above.
  if (origin === undefined) {
    await next();
    return;
  }

  if (!isAllowedOrigin(origin)) {
    throw new ApiError(
      403,
      'CROSS_ORIGIN_BLOCKED',
      'This request came from a site that is not allowed to use the API.',
    );
  }

  await next();
});
