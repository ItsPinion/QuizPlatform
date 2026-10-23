'use client';

import type { LandingPayload } from '@quiz/shared/landing';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The live pill.
 *
 * The first render is the server's own snapshot — the page already knows the
 * database, the counts and the version, because the same payload built the rest
 * of the hero. From there this polls `/api/health/db` once a minute and updates
 * in place, which is what makes the number in the headline move when somebody
 * sits a quiz.
 *
 * If the API stops answering it says `degraded` and keeps the last known
 * snapshot, rather than blanking out or pretending nothing happened.
 */

interface Snapshot {
  target: string;
  counts: { quizzes: number; questions: number } | null;
  latencyMs: number;
}

type State =
  { phase: 'ready'; data: Snapshot } | { phase: 'stale'; data: Snapshot | null; reason: string };

function snapshotOf(payload: LandingPayload | null): Snapshot | null {
  if (!payload) return null;

  return {
    target: payload.database.target,
    counts: payload.counts
      ? { quizzes: payload.counts.publishedQuizzes, questions: payload.counts.questions }
      : null,
    latencyMs: payload.database.latencyMs ?? 0,
  };
}

export function LiveStatus({ payload }: { payload: LandingPayload | null }) {
  const initial = snapshotOf(payload);
  const [state, setState] = useState<State>(
    initial ? { phase: 'ready', data: initial } : { phase: 'stale', data: null, reason: 'pending' },
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/health/db', { cache: 'no-store' });
        const body = (await res.json()) as {
          connected?: boolean;
          target?: string;
          latencyMs?: number;
          counts?: { quizzes: number; questions: number };
          error?: { code?: string };
        };

        if (cancelled) return;

        if (!res.ok || body.connected !== true || !body.counts) {
          setState((current) => ({
            phase: 'stale',
            data: current.data,
            reason: body.error?.code ?? `HTTP ${res.status}`,
          }));
          return;
        }

        setState({
          phase: 'ready',
          data: {
            target: body.target ?? 'unknown',
            counts: { quizzes: body.counts.quizzes, questions: body.counts.questions },
            latencyMs: body.latencyMs ?? 0,
          },
        });
      } catch {
        if (!cancelled) {
          setState((current) => ({ phase: 'stale', data: current.data, reason: 'no answer' }));
        }
      }
    };

    void load();

    const timer = window.setInterval(() => void load(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const live = state.phase === 'ready';

  return (
    <div className="border-border/70 bg-card/60 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-full border px-3 py-1.5 font-mono text-[10.5px]">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            live ? 'bg-success animate-pulse-dot motion-reduce:animate-none' : 'bg-warning',
          )}
        />
        <span className={live ? 'text-success' : 'text-warning'}>
          {live ? 'live' : state.data ? 'stale' : 'connecting'}
        </span>
      </span>

      {state.data ? (
        <span className="text-muted-foreground truncate">
          {state.data.target} · {state.data.counts?.quizzes ?? 0} published ·{' '}
          {state.data.counts?.questions ?? 0} questions · {Math.round(state.data.latencyMs)} ms
        </span>
      ) : (
        <span className="text-muted-foreground truncate">
          {state.phase === 'stale' ? state.reason : 'asking the API'}
        </span>
      )}
    </div>
  );
}
