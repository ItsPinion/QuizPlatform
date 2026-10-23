'use client';

import type { AuthUser } from '@quiz/shared/auth';
import { useEffect, useState } from 'react';

import { client } from '@/lib/api';

/**
 * One session lookup for the whole header.
 *
 * The cookie is httpOnly, so "am I signed in?" can only be answered by the API.
 * Before this hook there were two components asking — the nav and the session
 * controls — which meant two requests on every page and two chances for them to
 * disagree for a frame. This keeps one module-level snapshot, one in-flight
 * request, and a subscriber list, so the hook is cheap to use anywhere.
 */

export type SessionState =
  { status: 'loading' } | { status: 'guest' } | { status: 'authenticated'; user: AuthUser };

let snapshot: SessionState = { status: 'loading' };
let inFlight: Promise<void> | null = null;

const listeners = new Set<(state: SessionState) => void>();

function publish(next: SessionState) {
  snapshot = next;

  for (const listener of listeners) listener(next);
}

async function fetchSession(force = false): Promise<void> {
  if (inFlight && !force) return inFlight;

  inFlight = (async () => {
    try {
      const res = await client.api.auth.me.$get();

      if (res.ok) {
        const body = await res.json();
        publish({ status: 'authenticated', user: body.user });
        return;
      }

      publish({ status: 'guest' });
    } catch {
      // API unreachable (for example while the database is not configured yet).
      publish({ status: 'guest' });
    }
  })();

  return inFlight;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(snapshot);

  useEffect(() => {
    listeners.add(setState);

    // React to a change that happened between render and effect, then ask once.
    setState(snapshot);
    if (snapshot.status === 'loading') void fetchSession();

    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}

/** Sign out through the API and tell every subscriber at once. */
export async function signOutEverywhere(): Promise<void> {
  try {
    await client.api.auth.logout.$post();
  } finally {
    publish({ status: 'guest' });
    inFlight = Promise.resolve();
  }
}

/** After a login or register: forget the cached "guest" so the next read is real. */
export function forgetSession(): void {
  publish({ status: 'loading' });
  inFlight = null;
}
