import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Cookie,
  Database,
  GitBranch,
  KeyRound,
  FolderTree,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Radio,
  ServerCog,
  ShieldCheck,
  TerminalSquare,
  Timer,
  Trophy,
} from 'lucide-react';

import { AccessAreas } from '@/components/access-areas';
import { AdminAnalyticsPreview } from '@/components/admin-analytics-preview';
import { DeploymentPreview } from '@/components/deployment-preview';
import { LeaderboardPreview } from '@/components/leaderboard-preview';
import { AdminConsole } from '@/components/admin-console';
import { QuestionManagement } from '@/components/question-management';
import { QuizManagement } from '@/components/quiz-management';
import { PlatformBento } from '@/components/platform-bento';
import { Roadmap } from '@/components/roadmap';
import { SecurityPosture } from '@/components/security-posture';
import { SectionHeading } from '@/components/section-heading';
import { AnswerReviewPreview } from '@/components/answer-review-preview';
import { StudentDashboardPreview } from '@/components/student-dashboard-preview';
import { StudentQuizInterface } from '@/components/student-quiz-interface';
import { SubmissionScoring } from '@/components/submission-scoring';
import { SetupStatus } from '@/components/setup-status';
import { SiteHeader } from '@/components/site-header';
import { StackGrid } from '@/components/stack-grid';
import { WorkspaceTree } from '@/components/workspace-tree';
import { Badge } from '@/components/ui/badge';
import { BentoCard } from '@/components/ui/bento';
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
  { prompt: true, text: 'curl -b jar.txt -X POST /api/admin/quizzes' },
  { text: '201 ▸ DRAFT · slug derived from title', tone: 'ok' },
  { text: 'publish ▸ 409 · QUIZ_HAS_NO_QUESTIONS', tone: 'muted' },
  { prompt: true, text: 'curl -b jar.txt -X POST …/questions' },
  { text: '201 ▸ 4 options · 1 correct · 3 marks', tone: 'ok' },
  { prompt: true, text: 'curl -b jar.txt -X POST /api/student/quizzes/:id/start' },
  { text: '201 ▸ IN_PROGRESS · expiresAt +20m', tone: 'ok' },
  { text: 'answer ▸ 200 · saved · isCorrect: null', tone: 'muted' },
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
                Milestone · Day 14 of 14 complete
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
                areas are separated by role guards on both sides, the admin console reports live
                statistics, quizzes can be created, edited, published and retired — and students can
                take them: a server-timed attempt, a server-graded submission, a result you can
                learn from, a dashboard that turns those rows into averages, a score trend and
                category strengths — and it is ready to leave the machine: one Dockerfile, two
                runtimes, a deployment gate that refuses an unsafe configuration and a health screen
                that says what the process is actually connected to.
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

        {/* ----------------------------- platform ----------------------------- */}
        <section id="platform" className="mx-auto w-full max-w-6xl px-5 pt-16 pb-4 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="Platform map"
              title="The whole product, in one grid"
              description="Six surfaces, one session and one typed contract behind them. Every number on a card is a fact about this repository — point at one and it answers."
            />
            <p className="text-muted-foreground/80 max-w-[15rem] text-[11px] leading-relaxed">
              Spotlight, border glow and a three-degree tilt. No animation on touch, and none at all
              if your system asks for reduced motion.
            </p>
          </div>
          <div className="mt-8">
            <PlatformBento />
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

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {HIGHLIGHTS.map((item, index) => (
                <BentoCard
                  key={item.title}
                  interactive={false}
                  tone={(['primary', 'sky', 'success'] as const)[index] ?? 'primary'}
                  className="p-4"
                >
                  <item.icon className="text-primary size-4" />
                  <h3 className="mt-3 text-[13px] font-medium">{item.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">
                    {item.body}
                  </p>
                </BentoCard>
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

        {/* ------------------------------ quizzes ------------------------------ */}
        <section id="quizzes" className="border-border/60 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 5 · quiz management"
              title="Create it, shape it, decide when it goes live"
              description="Full CRUD for quizzes behind the same ADMIN guard as the rest of the console, with categories you can pick from a searchable list or type on the spot — and two rules that keep the platform honest: nothing publishes without questions, and nothing with student history gets deleted."
            />
            <div className="mt-8">
              <QuizManagement />
            </div>
          </div>
        </section>

        {/* ------------------------------ questions ---------------------------- */}
        <section id="questions" className="border-border/60 bg-card/20 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 6 · categories & questions"
              title="The part that makes a quiz a quiz"
              description="Quizzes now carry questions: an ordered option set with exactly one correct answer, marks, difficulty and an explanation. Categories became a real CRUD screen — create, rename, delete — and the rules around both are enforced where the data lives, not in the form."
            />
            <div className="mt-8">
              <QuestionManagement />
            </div>
          </div>
        </section>

        {/* ------------------------------ student ----------------------------- */}
        <section id="student" className="border-border/60 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 7 · student quiz interface"
              title="A quiz that is actually being taken"
              description="The catalogue, the rules before you start, and the attempt itself: one question at a time, direct navigation, answers saved as you click, and a countdown the server enforces. The browser is never given the answer key."
            />
            <div className="mt-8">
              <StudentQuizInterface />
            </div>
          </div>
        </section>

        {/* ---------------------------- submission ---------------------------- */}
        <section id="submission" className="border-border/60 bg-card/20 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 8 · submission & scoring"
              title="The paper becomes a result"
              description="Submit, or let the countdown do it: the server grades the saved answers against the answer key and stores marks, correct / incorrect / unanswered counts, a percentage, pass or fail, and the time taken. Nothing about the score comes from the browser."
            />
            <div className="mt-8">
              <SubmissionScoring />
            </div>
          </div>
        </section>

        {/* ------------------------------- review ----------------------------- */}
        <section id="review" className="border-border/60 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 9 · results & review"
              title="The paper comes back, question by question"
              description="A finished attempt opens up: what was asked, what you picked, what was right, and why. The answer key exists only after submission, and the attempt history lists every paper with its score, its counts and its time."
            />
            <div className="mt-8">
              <AnswerReviewPreview />
            </div>
          </div>
        </section>

        {/* ----------------------------- dashboard ---------------------------- */}
        <section id="dashboard" className="border-border/60 bg-card/20 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 10 · student dashboard"
              title="The numbers behind the scores"
              description="Quizzes attempted, passed, failed, average, highest and questions answered — plus a score trend, a fourteen-day activity chart and a category breakdown. Every figure is an aggregate the API computes from graded attempts, never a number the browser adds up."
            />
            <div className="mt-8">
              <StudentDashboardPreview />
            </div>
          </div>
        </section>

        {/* ----------------------------- analytics ---------------------------- */}
        <section id="analytics" className="border-border/60 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 11 · admin analytics"
              title="The whole platform, in five charts"
              description="Attempts over time, student registrations, the pass/fail split, the most popular quizzes and the most popular categories — plus the student, quiz and attempt statistics behind them. One endpoint, one window (7 / 14 / 30 / 90 days), and every rate with a stated denominator."
            />
            <div className="mt-8">
              <AdminAnalyticsPreview />
            </div>
          </div>
        </section>

        {/* ------------------------------ security ---------------------------- */}
        <section id="security" className="border-border/60 bg-card/20 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 13 · testing & security"
              title="A hostile caller is the default assumption"
              description="Nine areas the spec asks to test, attacked on purpose: forged and foreign-signed tokens, role escalation, another student's paper, a client-set deadline, a score in the body, injection strings, oversized payloads and cross-site writes. Every request also passes a fixed gauntlet before a handler runs."
            />
            <div className="mt-8">
              <SecurityPosture />
            </div>
          </div>
        </section>

        {/* ---------------------------- leaderboard --------------------------- */}
        <section id="leaderboard" className="border-border/60 bg-card/20 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 12 · leaderboard"
              title="A rank that is the same for everybody"
              description="Overall and per-category boards, ranked by average score, best score or quizzes completed, over all time, this month or this week. Ties share a rank, only finished attempts count, and the caller always sees their own position even when they are off the visible page."
            />
            <div className="mt-8">
              <LeaderboardPreview />
            </div>
          </div>
        </section>

        {/* ----------------------------- deployment --------------------------- */}
        <section id="deployment" className="border-border/60 w-full border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <SectionHeading
              eyebrow="Day 14 · deployment & docs"
              title="Shipping is a check, not a hope"
              description="Eight rules over the environment decide whether this process may serve traffic: a Turso URL and token, a secret long enough to sign with, a trusted origin, a known proxy target, production mode, and limits inside their bounds. The same rules run before a build, over the wire after a deploy, and on the admin health screen — one implementation, three places to read it."
            />
            <div className="mt-8">
              <DeploymentPreview />
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
              title="Fourteen days, all of them shipped"
              description="The spec's build schedule, tracked in the repo. Day 14 takes it off the laptop: a deployment gate over the environment, a health screen that reports what the process is really connected to, a production smoke test, and the runbook that covers migrate, roll back and verify. Day 13 is still the floor it stands on — rate limits, a CSRF origin guard, a body cap, scoped JWTs and a CSP on every page."
            />
            <div className="mt-8">
              <Roadmap />
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutDashboard className="text-primary size-4" />
                  Shipped in Days 2–14
                </CardTitle>
                <CardDescription>
                  Everything below is covered by the test suite and live on this deployment.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground grid gap-3 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
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
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <ListChecks className="text-success size-3.5" />
                    Quiz management
                  </div>
                  Create, edit and delete quizzes, derive slugs on the server, and publish or
                  unpublish only when the rules allow it.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <FolderTree className="text-success size-3.5" />
                    Categories &amp; questions
                  </div>
                  Category CRUD with case-insensitive names, plus multiple choice questions that
                  carry options, marks, difficulty and one correct answer.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <Timer className="text-success size-3.5" />
                    Student quiz interface
                  </div>
                  Published-only catalogue, pre-flight rules, and a timed attempt that saves every
                  answer and resumes after a refresh without spending a try.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <Gauge className="text-success size-3.5" />
                    Submission &amp; scoring
                  </div>
                  Manual or automatic submission, one idempotent grader, and a stored result: marks,
                  counts, percentage, pass/fail and time taken.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <ListChecks className="text-success size-3.5" />
                    Results &amp; review
                  </div>
                  The answer key and explanations, unlocked only after submission, plus an attempt
                  history you can filter by status and sort by score.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <Gauge className="text-success size-3.5" />
                    Student dashboard
                  </div>
                  The spec&apos;s six statistics in one round trip, with a score trend, per-category
                  averages and a fortnight of activity.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <Radio className="text-success size-3.5" />
                    Admin analytics
                  </div>
                  Attempts and registrations over time, the pass/fail split, and the quizzes and
                  categories people actually sit — over a window you choose.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <Trophy className="text-success size-3.5" />
                    Leaderboard
                  </div>
                  Overall and per-category rankings by average, best score or quizzes completed,
                  with competition ranking, rolling weekly and monthly boards, and your own row
                  pinned.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="text-success size-3.5" />
                    Hardening
                  </div>
                  Rate-limited sign-ins that cannot lock the owner out, a same-origin guard on every
                  write, scoped JWTs, a body-size cap and a CSP — each one covered by an attack
                  test.
                </div>
                <div className="border-border/60 bg-background/40 rounded-lg border p-3.5">
                  <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <ServerCog className="text-success size-3.5" />
                    Deployment gate
                  </div>
                  Eight environment rules become one verdict, reported before a build, over the wire
                  after a deploy and on{' '}
                  <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
                    /admin/system
                  </code>{' '}
                  — with a Dockerfile and a runbook behind it.
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
