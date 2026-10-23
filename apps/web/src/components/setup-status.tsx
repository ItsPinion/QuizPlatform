'use client';

import type { DatabaseStatus, Health } from '@quiz/shared';
import { CircleAlert, Clock3, RefreshCw, Wifi } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { client } from '@/lib/api';
import { cn } from '@/lib/utils';

interface LoadError {
  code: string;
  message: string;
  hint?: string;
}

type Loadable<T> =
  { state: 'loading' } | { state: 'ready'; data: T } | { state: 'error'; error: LoadError };

const DB_COUNT_LABELS: { key: keyof DatabaseStatus['counts']; label: string }[] = [
  { key: 'users', label: 'Users' },
  { key: 'categories', label: 'Categories' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'questions', label: 'Questions' },
  { key: 'attempts', label: 'Attempts' },
];

async function loadHealth(): Promise<Health> {
  const res = await client.api.health.$get();
  if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
  return (await res.json()) as Health;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: { hint?: string; reason?: string } };
}

async function loadDatabase(): Promise<DatabaseStatus> {
  const res = await client.api.health.db.$get();
  const body = await res.json();

  if (!res.ok) {
    const error = (body as ErrorEnvelope).error;
    throw new Error(
      JSON.stringify({
        code: error?.code ?? 'DATABASE_ERROR',
        message: error?.message ?? `Database check failed with status ${res.status}`,
        hint: error?.details?.hint,
      } satisfies LoadError),
    );
  }

  return body as DatabaseStatus;
}

/** Errors are tagged as JSON so the card can show the actionable hint. */
function toLoadError(reason: unknown): LoadError {
  if (reason instanceof Error) {
    try {
      const parsed = JSON.parse(reason.message) as LoadError;
      if (parsed && typeof parsed.code === 'string') return parsed;
    } catch {
      // not a tagged error — fall through
    }
    return { code: 'NETWORK_ERROR', message: reason.message };
  }

  return { code: 'UNKNOWN_ERROR', message: 'Unknown error' };
}

function StatusDot({ tone }: { tone: 'loading' | 'ready' | 'error' }) {
  return (
    <span
      className={cn(
        'relative flex size-2 rounded-full',
        tone === 'ready' && 'bg-success',
        tone === 'error' && 'bg-destructive',
        tone === 'loading' && 'bg-warning animate-pulse-dot',
      )}
    >
      <span
        className={cn(
          'absolute inset-0 rounded-full blur-[3px]',
          tone === 'ready' && 'bg-success/70',
          tone === 'error' && 'bg-destructive/70',
          tone === 'loading' && 'bg-warning/70',
        )}
      />
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground truncate text-right font-mono text-[12px]">{value}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-muted h-4 animate-pulse rounded"
          style={{ width: `${90 - i * 14}%` }}
        />
      ))}
    </div>
  );
}

export function SetupStatus() {
  const [health, setHealth] = useState<Loadable<Health>>({ state: 'loading' });
  const [database, setDatabase] = useState<Loadable<DatabaseStatus>>({ state: 'loading' });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setBusy(true);
    setHealth({ state: 'loading' });
    setDatabase({ state: 'loading' });

    const [healthResult, databaseResult] = await Promise.allSettled([loadHealth(), loadDatabase()]);

    setHealth(
      healthResult.status === 'fulfilled'
        ? { state: 'ready', data: healthResult.value }
        : { state: 'error', error: toLoadError(healthResult.reason) },
    );

    setDatabase(
      databaseResult.status === 'fulfilled'
        ? { state: 'ready', data: databaseResult.value }
        : { state: 'error', error: toLoadError(databaseResult.reason) },
    );

    setCheckedAt(new Date());
    setBusy(false);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Wifi className="text-primary size-4" />
            Runtime checks
          </CardTitle>
          <CardDescription>
            Live calls from the browser → Next.js rewrite → Hono API → Drizzle → libSQL, all through
            the typed RPC client.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void check()} disabled={busy}>
          <RefreshCw className={cn(busy && 'animate-spin')} />
          {busy ? 'Checking' : 'Re-check'}
        </Button>
      </CardHeader>

      <CardContent className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------- API ------------------------------- */}
        <div className="border-border/80 bg-background/40 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StatusDot tone={health.state} />
              <span className="text-sm font-medium">API heartbeat</span>
            </div>
            <Badge variant={badgeVariant(health.state)}>
              {health.state === 'ready'
                ? 'Healthy'
                : health.state === 'error'
                  ? 'Unreachable'
                  : 'Checking…'}
            </Badge>
          </div>

          <div className="mt-4 min-h-28">
            {health.state === 'loading' ? <Skeleton /> : null}

            {health.state === 'error' ? (
              <ErrorNote message={health.error.message}>
                Start the API with <code className="font-mono">bun dev</code> and reload.
              </ErrorNote>
            ) : null}

            {health.state === 'ready' ? (
              <div className="space-y-2.5">
                <Row label="Service" value={health.data.service} />
                <Row label="Version" value={health.data.version} />
                <Row label="Runtime" value={health.data.runtime} />
                <Row label="Uptime" value={`${health.data.uptimeSeconds}s`} />
              </div>
            ) : null}
          </div>
        </div>

        {/* ----------------------------- Database ---------------------------- */}
        <div className="border-border/80 bg-background/40 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StatusDot tone={database.state} />
              <span className="text-sm font-medium">Database readiness</span>
            </div>
            {database.state === 'ready' ? (
              <Badge variant={database.data.target === 'turso' ? 'success' : 'warning'}>
                {database.data.target === 'turso' ? 'Turso Cloud' : 'file: URL'}
              </Badge>
            ) : database.state === 'error' ? (
              <Badge
                variant={
                  database.error.code === 'DATABASE_SCHEMA_MISSING' ? 'warning' : 'destructive'
                }
              >
                {database.error.code === 'DATABASE_SCHEMA_MISSING' ? 'No schema' : 'Failed'}
              </Badge>
            ) : (
              <Badge variant="outline">Checking…</Badge>
            )}
          </div>

          <div className="mt-4 min-h-28">
            {database.state === 'loading' ? <Skeleton /> : null}

            {database.state === 'error' ? (
              <ErrorNote message={database.error.message} hint={database.error.hint}>
                {database.error.code === 'DATABASE_SCHEMA_MISSING' ? (
                  <>
                    Apply the migrations with <code className="font-mono">bun run db:migrate</code>,
                    then reload.
                  </>
                ) : (
                  <>
                    Check <code className="font-mono">TURSO_DATABASE_URL</code> and{' '}
                    <code className="font-mono">TURSO_AUTH_TOKEN</code> in{' '}
                    <code className="font-mono">.env</code>.
                  </>
                )}
              </ErrorNote>
            ) : null}

            {database.state === 'ready' ? (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <Row label="Target" value={database.data.urlHint} />
                  <Row
                    label="Latency"
                    value={
                      database.data.latencyMs === null
                        ? '—'
                        : `${database.data.latencyMs.toFixed(2)} ms`
                    }
                  />
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {DB_COUNT_LABELS.map(({ key, label }) => (
                    <div
                      key={key}
                      className="border-border/60 bg-card/60 rounded-md border px-1.5 py-2 text-center"
                    >
                      <div className="font-mono text-sm font-semibold tabular-nums">
                        {database.data.counts[key]}
                      </div>
                      <div className="text-muted-foreground mt-0.5 text-[10px]">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>

      <div className="text-muted-foreground flex items-center gap-2 px-6 text-[11px]">
        <Clock3 className="size-3" />
        {checkedAt ? `Last checked at ${checkedAt.toLocaleTimeString()}` : 'Running first check…'}
      </div>
    </Card>
  );
}

function badgeVariant(state: 'loading' | 'ready' | 'error') {
  if (state === 'ready') return 'success' as const;
  if (state === 'error') return 'destructive' as const;
  return 'outline' as const;
}

function ErrorNote({
  message,
  hint,
  children,
}: {
  message: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-destructive/30 bg-destructive/5 rounded-md border p-3 text-[12px]">
      <div className="text-destructive flex items-start gap-2">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span className="font-medium">{message}</span>
      </div>
      <p className="text-muted-foreground [&_code]:bg-muted mt-2 pl-5 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5">
        {children}
      </p>
    </div>
  );
}
