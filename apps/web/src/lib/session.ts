import type { AppType } from '@quiz/api';
import type { AuthSession } from '@quiz/shared/auth';
import { SESSION_COOKIE } from '@quiz/shared/auth';
import { hc } from 'hono/client';
import { cookies } from 'next/headers';

/**
 * Server-side session lookup.
 *
 * The cookie is httpOnly, so browser code cannot read it — pages read it in a
 * server component and forward it to the API, which stays the only place that
 * verifies the JWT. Nothing about the token is exposed to the client.
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

export async function getSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  try {
    const client = hc<AppType>(API_INTERNAL_URL, {
      headers: () => ({ cookie: `${SESSION_COOKIE}=${token}` }),
      // Sessions are per-request; never serve a cached page for them.
      init: { cache: 'no-store' },
    });

    const res = await client.api.auth.me.$get();

    if (!res.ok) return null;

    return (await res.json()) as AuthSession;
  } catch {
    // API unreachable (or not configured yet) — treat the visitor as signed out
    // rather than crashing the page.
    return null;
  }
}
