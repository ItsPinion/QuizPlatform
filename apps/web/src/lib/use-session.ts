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

/** A server-read session, as the same shape the client produces. */
function fromSeed(seed: AuthUser | null): SessionState {
  return seed ? { status: 'authenticated', user: seed } : { status: 'guest' };
}

/**
 * `seed` is the session the *server* already read for this request.
 *
 * It matters because the server is the only place that can know who is asking
 * before the first paint: without it, a signed-in visitor loads the page and
 * watches the header flip from "Sign in" to their dashboard a tick later.
 *
 * It is a render-time value, never written to the module snapshot during a
 * server render. That distinction is the whole trick — a `.next` server handles
 * many requests in one process, so seeding shared state from the first request
 * would leak that visitor's session into everybody else's HTML.
 */
export function useSession(seed?: AuthUser | null): SessionState {
  const [state, setState] = useState<SessionState>(() =>
    snapshot.status === 'loading' && seed !== undefined ? fromSeed(seed) : snapshot,
  );

  useEffect(() => {
    listeners.add(setState);

    if (snapshot.status === 'loading') {
      // Adopt the server's answer for the other callers on this page, then let
      // the fetch confirm it.
      if (seed !== undefined) publish(fromSeed(seed));
      void fetchSession();
    } else {
      // A change between render and effect — a sign-out in another tab's worth.
      setState(snapshot);
    }

    return () => {
      listeners.delete(setState);
    };
    // The seed is a server answer for one render; re-running on a new one would
    // overwrite a live client state with a stale one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
