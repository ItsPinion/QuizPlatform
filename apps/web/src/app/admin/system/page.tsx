import type { SystemStatus } from '@quiz/shared/deployment';

import { BuildBadge } from '@/components/build-badge';
import { PageHeader } from '@/components/cinema/page-header';
import { summaryLabel } from '@quiz/shared/deployment';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  Server,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import {
  actionableChecks,
  countsLabel,
  hostLabel,
  latencyLabel,
  runtimeLabel,
  statusGlyphTone,
  statusTone,
  STATUS_GLYPHS,
  STATUS_LABELS,
  verdictTone,
  VERDICT_LABELS,
} from '@/lib/deployment-params';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata = { title: 'System — Admin console' };

/** The manual steps a machine cannot check for you. */
const PRODUCTION_TESTING = [
  'Sign in as a student, take a quiz end to end, and confirm the score on both the result and the leaderboard.',
  'Sign in as the administrator and open every console screen once.',
  'Leave a quiz running past its deadline, then reload — the attempt should settle itself.',
  'Type the wrong password ten times: the eleventh attempt should answer 429 with Retry-After.',
  'Reload any page and check the console for CSP violations; there should be none.',
  'Sign out, then re-send a saved cookie with curl — it must not resolve to a user.',
];

export default async function AdminSystemPage() {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/system');
  if (!decision.allowed) redirect(decision.redirectTo);

  let status: SystemStatus | null = null;

  try {
    const res = await (await serverApi()).api.admin.system.$get();
    if (res.ok) status = await res.json();
  } catch {
    status = null;
  }

  if (status === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          label="Admin console · operations"
          title="System"
          aside={
            <Badge variant="warning" className="gap-1.5">
              <ShieldCheck />
              ADMIN
            </Badge>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">The system status is unavailable</CardTitle>
            <CardDescription>
              The web app could not reach the API. Nothing here is cached — an operations screen
              that answers from memory would lie exactly when it matters.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/admin" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Back to the overview
            </Link>
            <Link
              href="/api/health/db"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'font-mono text-[11px]',
              )}
            >
              GET /api/health/db
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const attention = actionableChecks(status.summary.checks);
  const { service, database, settings, summary } = status;

  return (
    <div className="space-y-7">
      <PageHeader
        label="Admin console · operations"
        title="System"
        description={
          <>
            What this process is, what it is connected to, and whether its configuration is fit to
            serve traffic — the same rules{' '}
            <code className="rounded bg-white/8 px-1 py-0.5 font-mono text-[12px]">
              bun run deploy:check
            </code>{' '}
            applies from a shell.
          </>
        }
        aside={
          <>
            <Badge variant="outline" className="gap-1.5">
              <ShieldCheck />
              ADMIN
            </Badge>
            <BuildBadge>Day 14 · deployment</BuildBadge>
          </>
        }
      />

      <div className="space-y-8">
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3',
            verdictTone(summary.verdict),
          )}
        >
          <div className="flex items-center gap-2">
            <Gauge className="size-4" />
            <span className="text-[13px] font-medium">{VERDICT_LABELS[summary.verdict]}</span>
          </div>
          <span className="font-mono text-[11px]">{summaryLabel(summary)}</span>
        </div>
      </div>

      <section aria-label="Service" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-1 py-4">
          <CardHeader className="pb-0">
            <CardTitle className="cine-label flex items-center gap-1.5 text-[9px] text-gray-400">
              <Server className="size-3.5" />
              Build
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-[13px]">v{service.version}</div>
            <div className="text-muted-foreground text-[10.5px]">{service.runtime}</div>
          </CardContent>
        </Card>

        <Card className="gap-1 py-4">
          <CardHeader className="pb-0">
            <CardTitle className="cine-label flex items-center gap-1.5 text-[9px] text-gray-400">
              <Activity className="size-3.5" />
              Process
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-[13px]">
              {service.nodeEnv} · {service.runtimeMode}
            </div>
            <div className="text-muted-foreground text-[10.5px]">
              demo surface {service.demoFeatures ? 'on' : 'off'} ·{' '}
              {runtimeLabel(service.memoryMb, service.uptimeSeconds)}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-1 py-4">
          <CardHeader className="pb-0">
            <CardTitle className="cine-label flex items-center gap-1.5 text-[9px] text-gray-400">
              <Database className="size-3.5" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-[13px]">{database.target}</div>
            <div className="text-muted-foreground truncate text-[10.5px]" title={database.urlHint}>
              {database.urlHint} · {latencyLabel(database.latencyMs)}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-1 py-4">
          <CardHeader className="pb-0">
            <CardTitle className="cine-label flex items-center gap-1.5 text-[9px] text-gray-400">
              <ShieldCheck className="size-3.5" />
              Guardrails
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-[13px]">
              {settings.authRateLimitMax > 0
                ? `${settings.authRateLimitMax} / ${settings.authRateLimitWindowSeconds}s`
                : 'off'}
            </div>
            <div className="text-muted-foreground text-[10.5px]">
              {Math.round(settings.maxBodyBytes / 1024)} KB body cap ·{' '}
              {Math.round(settings.sessionTtlSeconds / 86_400)}d sessions
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TerminalSquare className="text-primary size-4" />
                Configuration checks
              </CardTitle>
              <span className="text-muted-foreground font-mono text-[10.5px]">
                {attention.length === 0 ? 'nothing to fix' : `${attention.length} to review`}
              </span>
            </div>
            <CardDescription className="text-[11.5px]">
              Secrets are measured, never printed: presence and length only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {summary.checks.map((entry) => (
                <li
                  key={entry.id}
                  className={cn('rounded-lg border px-3 py-2', statusTone(entry.status))}
                >
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-[1px] font-mono text-[11px] leading-4',
                        statusGlyphTone(entry.status),
                      )}
                    >
                      {STATUS_GLYPHS[entry.status]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-foreground text-[12px] font-medium">
                          {entry.label}
                        </span>
                        <span className="text-muted-foreground text-[10px] uppercase">
                          {STATUS_LABELS[entry.status]}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-snug">
                        {entry.detail}
                      </p>
                      {entry.hint ? (
                        <p className="text-muted-foreground/80 mt-0.5 text-[10.5px] leading-snug">
                          {entry.hint}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Connected to</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Database</span>
                <span className="font-mono text-[11px]">
                  {database.connected ? 'connected' : 'unreachable'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Rows</span>
                <span className="truncate text-right font-mono text-[11px]">
                  {countsLabel(database.counts)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">API proxy</span>
                <span className="font-mono text-[11px]">{hostLabel(settings.apiInternalUrl)}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Trusted origins</span>
                <span className="truncate text-right font-mono text-[11px]">
                  {settings.trustedOrigins.join(', ')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Demo logins</span>
                <span className="font-mono text-[11px]">
                  {settings.demoAccounts ? 'published' : 'off'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="text-success size-4" />
                Production testing
              </CardTitle>
              <CardDescription className="text-[11.5px]">
                The part no script can sign off on.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="text-muted-foreground space-y-1.5 text-[11px] leading-snug">
                {PRODUCTION_TESTING.map((step, index) => (
                  <li key={step} className="flex gap-2">
                    <span className="text-muted-foreground/60 font-mono text-[10px]">
                      {index + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="text-muted-foreground size-4" />
            Deploy runbook
          </CardTitle>
          <CardDescription className="text-[11.5px]">
            The same checklist in the repository: environment matrix, migrations, rollback and the
            one command that verifies a deployment from the outside.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <code className="bg-muted rounded px-2 py-1 font-mono text-[11px]">
            bun run deploy:check --url https://your-deployment
          </code>
          <Link
            href="/admin/analytics"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'ml-auto text-[11px]')}
          >
            Analytics
            <ArrowRight />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
