import type { AppType } from '@quiz/api';
import { hc } from 'hono/client';

/**
 * Fully-typed Hono RPC client.
 *
 * Browser requests use a relative base so they hit the Next.js `/api/*` rewrite
 * on the same origin (keep auth cookies first-party). Server-side code can set
 * NEXT_PUBLIC_API_BASE_URL to talk to the API directly.
 */
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export const client = hc<AppType>(baseUrl);

export type ApiClient = typeof client;
