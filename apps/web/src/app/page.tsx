import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Cookie,
  Database,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Radio,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';

import { AccessAreas } from '@/components/access-areas';
import { AdminConsole } from '@/components/admin-console';
import { Roadmap } from '@/components/roadmap';
import { SectionHeading } from '@/components/section-heading';
import { SetupStatus } from '@/components/setup-status';
import { SiteHeader } from '@/components/site-header';
import { StackGrid } from '@/components/stack-grid';
import { WorkspaceTree } from '@/components/workspace-tree';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TERMINAL_LINES: { prompt?: boolean; text: string; tone?: 'muted' | 'accent' | 'ok' }[] = [
  { prompt: true, text: 'bun install' },
  { prompt: true, text: 'bun run db:generate' },
  { prompt: true, text: 'bun run db:migrate' },
  { prompt: true, text: 'bun run db:seed' },
  { prompt: true, text: 'bun dev' },
  { text: '' },
  { text: 'web  ▸ http://localhost:3000', tone: 'accent' },
  { text: 'api  ▸ http://localhost:3001', tone: 'accent' },
  { text: 'db   ▸ Turso Cloud (libsql)', tone: 'muted' },
  { text: 'rpc  ▸ hc<AppType> · 0 codegen', tone: 'ok' },
  { text: '' },
  { prompt: true, text: 'curl -X POST /api/auth/login -c jar.txt' },
  { text: '200 ▸ role STUDENT · httpOnly JWT · 7d', tone: 'accent' },
  { text: 'GET /api/admin/access ▸ 403 · FORBIDDEN', tone: 'muted' },
  { prompt: true, text: 'curl -b jar.txt /api/admin/stats' },
  { text: '200 ▸ 4 users · 10 quizzes · 47 questions', tone: 'ok' },
  { text: 'PATCH /api/admin/users/:id ▸ 409 SELF_LOCKOUT', tone: 'muted' },
];

const HIGHLIGHTS = [
  {
    icon: Radio,
    title: 'One origin, no CORS games',
    body: 'Next rewrites /api/* to the Hono server, so browser requests and httpOnly auth cookies stay first-party.',
  },
  {
    icon: KeyRound,
    title: 'Contracts shared, not duplicated',
    body: 'Zod enums and request/response types live in packages/shared and are imported by both the API and the web app.',
  },
  {
    icon: ShieldCheck,
    title: 'Server owns the truth',
    body: 'The schema already models server-validated attempts, expiry timestamps and grading — never trusted to the browser.',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* ------------------------------- hero ------------------------------- */}
        <section className="border-border/60 relative overflow-hidden border-b">
          <div className="bg-glow pointer-events-none absolute inset-0" />
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />

          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
            <div>
              <Badge className="border-primary/30 bg-primary/10 gap-2 py-1">
                <span className="bg-primary size-1.5 rounded-full" />
                Milestone · Day 4 of 14 complete
              </Badge>

              <h1 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
                A quiz platform,
                <br />
                <span className="from-primary bg-gradient-to-r via-violet-400 to-sky-400 bg-clip-text text-transparent">
                  wired end to end.
                </span>
              </h1>

              <p className="text-muted-foreground mt-5 max-w-xl text-[15px] leading-relaxed">
                Turborepo monorepo with a Next.js 16 web app, a Hono RPC API and a Drizzle schema on
                Turso. Sign-in is real — scrypt hashes, httpOnly JWT cookies — the admin and student
                areas are separated by role guards on both sides, and the admin console now reports
                live statistics and manages accounts.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href="/login" className={cn(buttonVariants({ size: 'lg' }))}>
                  Sign in
                  <ArrowRight />
                </a>
                <a
                  href="#status"
                  className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
                >
                  Check the wiring
                </a>
                <a
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-1 text-[12.5px] transition-colors"
                >
                  <TerminalSquare className="size-3.5" />
                  API health
                  <ArrowUpRight className="size-3" />
                </a>
              </div>

              <div className="text-muted-foreground mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px]">
                {['Turborepo 2.11', 'Next.js 16', 'React 19', 'Hono 4 RPC', 'Drizzle + Turso'].map(
                  (item) => (
                    <span key={item} className="inline-flex items-center gap-1.5">
                      <span className="bg-border size-1 rounded-full" />
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* terminal card */}
            <Card className="border-border/80 shadow-primary/50 overflow-hidden bg-[oklch(0.17_0.016_285)]/90 shadow-[0_40px_120px_-60px]">
              <div className="border-border/70 flex items-center gap-2 border-b px-4 py-3">
                <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
                <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
                <span className="size-2.5 rounded-full bg-[#28c840]/80" />
                <span className="text-muted-foreground ml-2 font-mono text-[11px]">
                  quizplatform — zsh
                </span>
                <span className="text-success ml-auto inline-flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="animate-pulse-dot bg-success size-1.5 rounded-full" />
                  dev
                </span>
              </div>

              <CardContent className="space-y-1.5 py-5 font-mono text-[12px] leading-relaxed">
                {TERMINAL_LINES.map((line, index) => (
                  <div key={index} className="flex gap-2 whitespace-pre-wrap">
                    {line.prompt ? <span className="text-primary">❯</span> : null}
                    <span
                      className={cn(
                        line.tone === 'accent' && 'text-sky-300',
                        line.tone === 'ok' && 'text-emerald-300',
                        line.tone === 'muted' && 'text-muted-foreground',
                        !line.tone && 'text-foreground/90',
                      )}
                    >
                      {line.text || '\u00A0'}
                    </span>
                  </div>
                ))}
              </CardContent>

              <div className="border-border/70 text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-3 text-[11px]">
                <span className="inline-flex items-center gap-1.5">
                  <GitBranch className="size-3" />
                  arena/05fdcff3-quizplatform
                </span>
                <a
                  href="https://github.com/ItsPinion/QuizPlatform"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground inline-flex items-center gap-1"
                >
                  GitHub <ArrowUpRight className="size-3" />
                </a>
              </div>
            </Card>
          </div>
        </section>

        {/* ------------------------------- stack ------------------------------ */}
        <section id="stack" className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <SectionHeading
            eyebrow="Architecture"
            title="Four layers, one typed contract"
            description="Each package has a single responsibility and a shared TypeScript surface. The web app never hand-writes an API call signature."
          />
          <div className="mt-8">
            <StackGrid />
          </div>
        </section>

        {/* ------------------------------- status ----------------------------- */}
        <section id="status" className="border-border/60 bg-card/20 relative border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Verification"
              title="Is everything actually connected?"
              description="These cards are rendered from live responses — the browser calls the Next.js proxy, which forwards to Hono, which queries libSQL through Drizzle."
            />

            <div className="mt-8">
              <SetupStatus />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className="border-border/70 bg-background/40 rounded-xl border p-4"
                >
                  <item.icon className="text-primary size-4" />
                  <h3 className="mt-3 text-[13px] font-medium">{item.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-muted-foreground mt-4 flex flex-wrap items-center gap-2 text-[11.5px]">
              <Database className="size-3.5" />
              Point
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
                DATABASE_URL
              </code>
              at your Turso
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
                libsql://…
              </code>
              URL and add
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
                TURSO_AUTH_TOKEN
              </code>
              — Drizzle Kit applies migrations and the seed script loads demo data straight into the
              cloud database.
            </p>
          </div>
        </section>

        {/* ------------------------------- access ------------------------------ */}
        <section id="access" className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <SectionHeading
            eyebrow="Authorization"
            title="Two doors, one session"
            description="Every /api/admin and /api/student request is authenticated and role-checked before it reaches a handler. The pages behind them are guarded on the server too, so a student never renders the admin shell — and neither side trusts the UI for it."
          />
          <div className="mt-8">
            <AccessAreas />
          </div>
        </section>

        {/* ------------------------------ console ------------------------------ */}
        <section id="console" className="border-border/60 bg-card/20 relative border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 4 · admin console"
              title="Statistics that come from the database, not the browser"
              description="The admin area grew from a role probe into a working console: a dashboard of aggregates and a user directory you can actually operate — with the API as the only decision maker."
            />
            <div className="mt-8">
              <AdminConsole />
            </div>
          </div>
        </section>

        {/* ----------------------------- workspace ---------------------------- */}
        <section id="workspace" className="border-border/60 bg-card/20 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Monorepo"
              title="Where everything lives"
              description="Two apps, two shared packages, and a task graph that only rebuilds what changed."
            />
            <div className="mt-8">
              <WorkspaceTree />
            </div>
          </div>
        </section>

        {/* ------------------------------ roadmap ----------------------------- */}
        <section id="roadmap" className="border-border/60 bg-card/20 border-t">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Two-week plan"
              title="Four days shipped, ten to go"
              description="The spec's build schedule, tracked in the repo. Day 4 adds the admin dashboard shell, aggregate statistics and user management on top of the Day 3 role guards."
            />
            <div className="mt-8">
              <Roadmap />
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutDashboard className="text-primary size-4" />
                  Shipped in Days 2–4
                </CardTitle>
                <CardDescription>
                  Everything below is covered by the test suite and live on this deployment.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground grid gap-3 text-[12.5px] sm:grid-cols-2 lg:grid-cols-4">
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <KeyRound className="text-success size-3.5" />
                    Password auth
                  </div>
                  scrypt with a unique salt per user; unknown emails still run a decoy hash so
                  timing does not leak who exists.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <Cookie className="text-success size-3.5" />
                    Session cookies
                  </div>
                  HS256 JWT in an httpOnly, SameSite=Lax cookie that expires after seven days. The
                  browser never sees the token.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <Check className="text-success size-3.5" />
                    Role areas
                  </div>
                  <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
                    /api/admin
                  </code>
                  and
                  <code className="bg-muted mx-1 rounded px-1 py-0.5 font-mono text-[11px]">
                    /api/student
                  </code>
                  are guarded end to end, and the web pages redirect the wrong role to its own area.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <LayoutDashboard className="text-success size-3.5" />
                    Admin console
                  </div>
                  Six aggregates, newest accounts and attempts, plus a searchable directory where
                  role and status changes are one guarded PATCH away.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-border/60 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-8 text-[12px] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2">
            <span className="bg-primary/15 text-primary grid size-6 place-items-center rounded-md text-[10px] font-bold">
              Q
            </span>
            <span>QuizPlatform · Quiz Management &amp; Online Assessment</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href="/api/meta" target="_blank" rel="noreferrer" className="hover:text-foreground">
              API index
            </a>
            <a
              href="/api/health/db"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              DB probe
            </a>
            <span className="font-mono text-[11px]">Turborepo · Next.js · Hono · Drizzle</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
