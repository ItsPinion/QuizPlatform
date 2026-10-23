import { FileCode2 } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

const tree = `quizplatform/
├─ apps/
│  ├─ web/            Next.js 16 · App Router · Tailwind v4
│  │  ├─ src/app/              landing, /login, /register, /admin, /student
│  │  ├─ src/app/admin/        layout · overview · users · quizzes · categories
│  │  ├─ src/lib/session.ts    server-side session lookup (cookie → API)
│  │  ├─ src/lib/api-server.ts cookie-forwarding RPC client for pages
│  │  ├─ src/lib/guards.ts     role decision for /admin and /student
│  │  ├─ src/lib/admin-params.ts  filters ⇄ ?search=&role=&page=
│  │  ├─ src/lib/quiz-params.ts   quiz filters, badges, category ranking
│  │  ├─ src/lib/question-params.ts  option reconciliation + form validation
│  │  ├─ src/lib/redirect.ts   validated ?next= (no open redirects)
│  │  ├─ src/components/       admin nav, users table, combobox, question editor
│  │  └─ next.config.ts        /api/* → Hono rewrite
│  └─ api/            Hono 4 · @hono/node-server
│     ├─ src/app.ts            chained routes → AppType
│     ├─ src/routes/           auth · admin · student · health · meta
│     ├─ src/middleware/       requireAuth · requireAdmin · requireStudent
│     ├─ src/lib/admin-stats.ts   dashboard aggregates (one per section)
│     ├─ src/lib/admin-users.ts   directory query + guarded role/status writes
│     ├─ src/lib/admin-quizzes.ts CRUD, derived slugs, publish/delete rules
│     ├─ src/lib/admin-categories.ts  find-or-create, rename, guarded delete
│     ├─ src/lib/admin-questions.ts   options by id, ordering, delete rules
│     ├─ src/routes/admin-quizzes.ts  /api/admin/quizzes (mounted under the guard)
│     ├─ src/lib/auth.ts       JWT signing + session cookies
│     └─ src/lib/              env, jsonBody validator, error envelope
├─ packages/
│  ├─ db/             Drizzle ORM · libSQL / Turso
│  │  ├─ src/schema.ts         7 tables + relations
│  │  ├─ src/seed.ts           rich demo dataset
│  │  ├─ src/__tests__/        schema + seed integrity
│  │  └─ migrations/           drizzle-kit SQL (checked in)
│  ├─ shared/         Zod enums, auth + admin + quiz + question contracts, hashing
│  └─ test-utils/     package-manager-agnostic test helpers
├─ turbo.json         task graph + cache
├─ package.json       Bun workspaces + scripts (pins Bun)
├─ scripts/           end-to-end smoke run (real HTTP)
└─ .env.example       Turso credentials template`;

const highlights = [
  { path: 'turbo.json', note: 'build / dev / test / typecheck pipelines with caching' },
  { path: 'apps/api/src/app.ts', note: 'every route chained so `AppType` is complete' },
  { path: 'apps/api/src/middleware/auth.ts', note: 'session, role, admin and student guards' },
  {
    path: 'apps/api/src/routes/admin.ts',
    note: 'requireAdmin mounted on the router, not handlers',
  },
  { path: 'apps/web/src/lib/guards.ts', note: 'no session → sign in · wrong role → own area' },
  {
    path: 'apps/api/src/lib/admin-users.ts',
    note: 'paged search + the 409 that stops self-lockout',
  },
  {
    path: 'apps/web/src/app/admin/users/page.tsx',
    note: 'server-rendered directory, filters live in the URL',
  },
  { path: 'packages/shared/src/admin.ts', note: 'stats + user contracts, API and UI' },
  {
    path: 'packages/shared/src/quiz.ts',
    note: 'slug derivation + the publish/delete rules, shared',
  },
  {
    path: 'apps/api/src/lib/admin-quizzes.ts',
    note: 'one place for CRUD and the lifecycle guards',
  },
  {
    path: 'packages/shared/src/question.ts',
    note: 'option set + correct index: an invalid question cannot be built',
  },
  {
    path: 'apps/api/src/lib/admin-questions.ts',
    note: 'options reconciled by id, so past answers keep their rows',
  },
  { path: 'apps/web/src/lib/api.ts', note: 'hc<AppType>() — zero codegen RPC' },
  { path: 'packages/db/src/schema.ts', note: 'users → attempts → answers relations' },
  { path: 'packages/shared/src/auth.ts', note: 'login schemas + role permissions, both apps' },
  { path: '.env.example', note: 'Turso URL + token template, never committed' },
];

export function WorkspaceTree() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto py-1">
          <pre className="text-muted-foreground font-mono text-[11.5px] leading-[1.75]">
            <code>{tree}</code>
          </pre>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2.5">
        {highlights.map((item) => (
          <div
            key={item.path}
            className="border-border/70 bg-card/50 flex items-start gap-3 rounded-lg border p-3.5"
          >
            <FileCode2 className="text-primary/80 mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <code className="text-foreground block truncate font-mono text-[12px]">
                {item.path}
              </code>
              <p className="text-muted-foreground mt-0.5 text-[12px] leading-relaxed">
                {item.note}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
