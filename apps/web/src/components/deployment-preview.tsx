import type { CheckStatus, DeploymentVerdict } from '@quiz/shared/deployment';
import { Check, Container, Rocket, Terminal, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  STATUS_GLYPHS,
  STATUS_LABELS,
  statusTone,
  VERDICT_LABELS,
  verdictTone,
} from '@/lib/deployment-params';
import { cn } from '@/lib/utils';

/**
 * Day 14 on the landing page: the deployment gate, as it actually reports.
 *
 * The eight checks below are the ones `evaluateEnvironment` runs, in the order it
 * runs them; the output blocks are the real shape of `bun run deploy:check`, not
 * a mock-up of a different tool. Nothing here is a promise — it is what the repo
 * prints today.
 */

interface CheckRow {
  label: string;
  status: CheckStatus;
  detail: string;
}

const CHECKS: CheckRow[] = [
  { label: 'Database URL', status: 'pass', detail: 'Turso Cloud URL configured.' },
  { label: 'Database token', status: 'pass', detail: 'Auth token is present.' },
  { label: 'Session secret', status: 'pass', detail: 'A 48-character secret is configured.' },
  { label: 'Web origin', status: 'pass', detail: 'https://quiz.example.com is trusted.' },
  {
    label: 'API proxy target',
    status: 'pass',
    detail: 'The web app proxies /api/* to http://quiz-api:3001.',
  },
  { label: 'Runtime mode', status: 'pass', detail: 'NODE_ENV=production: Secure cookies on.' },
  { label: 'Sign-in rate limit', status: 'pass', detail: '10 failed sign-ins per address.' },
  { label: 'Request body cap', status: 'pass', detail: 'Bodies above 64 KB are refused.' },
];

const LIVE_CHECKS: Array<[string, string]> = [
  ['API liveness', '200 · v0.1.0'],
  ['API readiness + database', '200 · turso · 41 ms'],
  ['Session guard', '401 UNAUTHENTICATED without a cookie'],
  ['Hardening headers', 'nosniff · no-store · request id'],
  ['Error envelope', '404 NOT_FOUND'],
  ['Web app reachable', '200'],
  ['Content-Security-Policy', 'default-src self · no eval'],
  ['Web → API proxy', '/api/health answers through the web origin'],
];

const ORDER: Array<[string, string]> = [
  ['env', 'Fill in the two Turso values, a 48-character JWT_SECRET and WEB_ORIGIN.'],
  ['migrate', 'bun run db:migrate — the schema is versioned, never created by hand.'],
  ['seed', 'bun run db:seed, once, only if you want the demo accounts.'],
  ['verify', 'bun run deploy:check --url … then sign in and submit one real attempt.'],
];

const SMOKE: string[] = [
  'The landing page renders and the console signs in as the seeded admin.',
  'A student enrols, answers, submits — and the score is computed on the server.',
  'Re-submitting after the deadline is refused, not clamped.',
  'A second browser context cannot reach the first one’s attempt by id.',
  'The cookie is Secure, httpOnly, SameSite=Lax and gone after logout.',
  'The health screen reports the same verdict a fresh deploy:check does.',
];

const READY: DeploymentVerdict = 'ready';

export function DeploymentPreview() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        {/* ---------------------------- the checks --------------------------- */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[12.5px]">Eight checks, one verdict</CardTitle>
              <Badge variant="outline" className="font-mono text-[10px]">
                packages/shared/src/deployment.ts
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className={cn('rounded-lg border px-3 py-2', verdictTone(READY))}>
              <div className="text-[12.5px] font-semibold">{VERDICT_LABELS[READY]}</div>
              <p className="mt-0.5 text-[11px] opacity-80">
                8 of 8 checks pass · a <span className="font-mono">file:</span> database or a
                missing secret blocks production, and warns everywhere else.
              </p>
            </div>

            <ul className="divide-border/50 divide-y">
              {CHECKS.map((entry) => (
                <li key={entry.label} className="flex items-start gap-2.5 py-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-px grid size-4 shrink-0 place-items-center rounded-full border font-mono text-[9px] font-bold',
                      statusTone(entry.status),
                    )}
                  >
                    {STATUS_GLYPHS[entry.status]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-medium">{entry.label}</span>
                      <span className="text-muted-foreground/60 font-mono text-[9.5px] uppercase">
                        {STATUS_LABELS[entry.status]}
                      </span>
                    </div>
                    <p className="text-muted-foreground truncate text-[11px]" title={entry.detail}>
                      {entry.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* --------------------------- the commands -------------------------- */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-1.5 text-[12.5px]">
                  <Terminal className="text-muted-foreground size-3.5" />
                  Before the build
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  bun run deploy:check
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="border-border/60 bg-background/60 overflow-x-auto rounded-lg border p-3 font-mono text-[10.5px] leading-[1.7]">
                <code>
                  <span className="text-muted-foreground">$</span> bun run deploy:check{'\n'}
                  <span className="text-success">✓</span> Database URL Turso Cloud URL configured.
                  {'\n'}
                  <span className="text-success">✓</span> Session secret 48-character secret.
                  {'\n'}
                  <span className="text-warning">!</span> Web origin defaults to localhost.{'\n'}
                  {'\n'}
                  <span className="text-muted-foreground">7 passed · 1 warning · 0 failures</span>
                  {'\n'}
                  <span className="text-warning">!</span> Attention: review the warnings above.
                </code>
              </pre>
              <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                Reads <span className="font-mono">.env.local</span>, then{' '}
                <span className="font-mono">.env</span>, then the process. Exits non-zero on a
                failure, so it can gate a build — warnings never block one.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-1.5 text-[12.5px]">
                  <Rocket className="text-muted-foreground size-3.5" />
                  After the deploy
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  --url https://…
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {LIVE_CHECKS.slice(0, 4).map(([label, detail]) => (
                <div key={label} className="flex items-baseline gap-2 text-[11px]">
                  <span className="text-success font-mono text-[10px]">✓</span>
                  <span className="w-[9.5rem] shrink-0 font-medium">{label}</span>
                  <span className="text-muted-foreground truncate font-mono text-[10px]">
                    {detail}
                  </span>
                </div>
              ))}
              <p className="text-muted-foreground pt-1 text-[11px] leading-relaxed">
                Eight live probes, including the CSP, the web→API proxy and — with{' '}
                <span className="font-mono">--admin email:password</span> — the server&apos;s own
                self-report. A local file database on a deployed API counts as a failure.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ------------------------- order and smoke test ------------------------ */}
      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-[12.5px]">
              <Container className="text-muted-foreground size-3.5" />
              Deploy order
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {ORDER.map(([step, detail], index) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="border-border/70 bg-background/60 text-muted-foreground mt-px grid size-5 shrink-0 place-items-center rounded-md border font-mono text-[9.5px]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] font-medium">{step}</span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground border-border/50 mt-3 border-t pt-2 text-[10.5px] leading-relaxed">
              One Dockerfile, two runtimes: <span className="font-mono">--target api</span> and{' '}
              <span className="font-mono">--target web</span>. The proxy target is baked at build
              time, so <span className="font-mono">API_INTERNAL_URL</span> is a build arg.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[12.5px]">Production smoke test, by hand</CardTitle>
              <Badge variant="outline" className="font-mono text-[10px]">
                docs/deployment.md
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {SMOKE.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="text-success mt-0.5 size-3 shrink-0" />
                  <span className="text-[11px] leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground border-border/50 mt-3 flex items-start gap-1.5 border-t pt-2 text-[10.5px] leading-relaxed">
              <TriangleAlert className="text-warning mt-0.5 size-3 shrink-0" />
              <span>
                The API runs migrations, never the web app; two instances must not race the same
                schema. Run <span className="font-mono">db:migrate</span> as a release step, once.
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground px-1 text-[10.5px] leading-relaxed">
        Status glyphs and tones come from{' '}
        <span className="font-mono">apps/web/src/lib/deployment-params.ts</span> — the same helpers
        the operator console uses, so the landing page cannot drift from the screen. The full
        runbook, rollback and environment matrix live in{' '}
        <span className="font-mono">docs/deployment.md</span>.
      </p>
    </div>
  );
}
