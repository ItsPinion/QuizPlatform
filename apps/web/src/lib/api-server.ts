import type { AppType } from '@quiz/api';
import { SESSION_COOKIE } from '@quiz/shared/auth';
import { hc } from 'hono/client';
import { cookies } from 'next/headers';

/**
 * Server-side, cookie-forwarding Hono RPC client.
 *
 * Admin pages run on the server, but the API stays the only component that
 * authorises: the page forwards the httpOnly cookie and renders whatever the
 * guarded endpoint returns. `cache: 'no-store'` keeps per-user data out of any
 * shared cache.
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

export async function serverApi() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  return hc<AppType>(API_INTERNAL_URL, {
    headers: (): Record<string, string> => (token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
    init: { cache: 'no-store' },
  });
}
