import type { AuthUser } from '@quiz/shared/auth';
import type { RequestIdVariables } from 'hono/request-id';

import type { SessionClaims } from './auth';

/**
 * Typed Hono environment shared by every router.
 *
 * `requireAuth` fills `user` and `claims`, so downstream handlers read them
 * from `c.get(...)` without casts.
 */
export interface AppEnv {
  Variables: RequestIdVariables & {
    user: AuthUser;
    claims: SessionClaims;
  };
}
