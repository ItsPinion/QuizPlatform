import { FileCode2 } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

const tree = `quizplatform/
├─ apps/
│  ├─ web/            Next.js 16 · App Router · Tailwind v4
│  │  ├─ src/app/              landing page, layout, globals.css
│  │  ├─ src/components/ui/    shadcn/ui primitives
│  │  └─ next.config.ts        /api/* → Hono rewrite
│  └─ api/            Hono 4 · @hono/node-server
│     ├─ src/app.ts            chained routes → AppType
│     ├─ src/routes/           health · meta
│     └─ src/lib/              env, error envelope
├─ packages/
│  ├─ db/             Drizzle ORM · libSQL / Turso
│  │  ├─ src/schema.ts         7 tables + relations
│  │  ├─ src/seed.ts           rich demo dataset
│  │  ├─ src/__tests__/        schema + seed integrity
│  │  └─ migrations/           drizzle-kit SQL (checked in)
│  ├─ shared/         Zod enums, API contracts, scrypt hashing
│  └─ test-utils/     package-manager-agnostic test helpers
├─ turbo.json         task graph + cache
├─ package.json       Bun workspaces + scripts
├─ bun.lock           committed lockfile
└─ .env.example       Turso credentials template`;

const highlights = [
  { path: 'turbo.json', note: 'build / dev / test / typecheck pipelines with caching' },
  { path: 'apps/api/src/app.ts', note: 'every route chained so `AppType` is complete' },
  { path: 'apps/web/src/lib/api.ts', note: 'hc<AppType>() — zero codegen RPC' },
  { path: 'packages/db/src/schema.ts', note: 'users → attempts → answers relations' },
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
