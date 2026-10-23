'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The only unscripted element on the page.
 *
 * It asks the API how it is doing through the same proxy the app uses, and
 * prints the answer: the database it is connected to, the rows it can see and
 * the round trip. If the API is down it says so — a landing page that only works
 * when everything is fine is a brochure, not a demo.
 */

interface Snapshot {
  connected: boolean;
  target: string;
  latencyMs: number;
  counts: { users: number; quizzes: number; questions: number } | null;
}

type State =
  { phase: 'loading' } | { phase: 'ready'; data: Snapshot } | { phase: 'down'; message: string };

export function LiveStatus() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/health/db', { cache: 'no-store' });
        const body = (await res.json()) as Partial<Snapshot> & { error?: { code?: string } };

        if (cancelled) return;

        if (!res.ok || body.connected !== true || !body.counts) {
          setState({ phase: 'down', message: body.error?.code ?? `HTTP ${res.status}` });
          return;
        }

        setState({
          phase: 'ready',
          data: {
            connected: true,
            target: body.target ?? 'unknown',
            latencyMs: body.latencyMs ?? 0,
            counts: body.counts,
          },
        });
      } catch {
        if (!cancelled) setState({ phase: 'down', message: 'no answer from the API' });
      }
    };

    void load();

    // One refresh a minute: the numbers move when somebody sits a quiz.
    const timer = window.setInterval(() => void load(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const dot = state.phase === 'ready' ? 'bg-success' : 'bg-warning';

  return (
    <div className="border-border/70 bg-card/60 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-full border px-3 py-1.5 font-mono text-[10.5px]">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            'size-1.5 rounded-full',
            dot,
            state.phase === 'ready' && 'animate-pulse-dot motion-reduce:animate-none',
          )}
          aria-hidden
        />
        <span className={state.phase === 'ready' ? 'text-success' : 'text-warning'}>
          {state.phase === 'ready' ? 'live' : state.phase === 'loading' ? 'connecting' : 'degraded'}
        </span>
      </span>

      {state.phase === 'ready' ? (
        <span className="text-muted-foreground truncate">
          {state.data.target} · {state.data.counts?.quizzes ?? 0} quizzes ·{' '}
          {state.data.counts?.questions ?? 0} questions · {Math.round(state.data.latencyMs)} ms
        </span>
      ) : null}

      {state.phase === 'down' ? (
        <span className="text-muted-foreground truncate">{state.message}</span>
      ) : null}
    </div>
  );
}
