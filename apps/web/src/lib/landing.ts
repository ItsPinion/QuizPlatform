import { landingPayloadSchema, type LandingPayload } from '@quiz/shared/landing';

/**
 * The landing page's only data source.
 *
 * It runs on the server, hits the API directly over the internal network (not
 * through the public rewrite) and validates the response before a single byte of
 * it reaches a component — so a drifting API surfaces as a null here, not as
 * `undefined` in the middle of a card.
 *
 * `no-store` on purpose: the page exists to show what the database says right
 * now. A cached landing page is a page that lies for a minute.
 */

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

export async function fetchLanding(): Promise<LandingPayload | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/landing`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (!res.ok) return null;

    const parsed = landingPayloadSchema.safeParse(await res.json());

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
