import { Boxes, Database, Server, SquareCode } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface StackItem {
  icon: LucideIcon;
  name: string;
  role: string;
  description: string;
  meta: string;
  accent: string;
}

const stack: StackItem[] = [
  {
    icon: Boxes,
    name: 'Turborepo',
    role: 'Monorepo orchestration',
    description:
      'pnpm workspaces with cached build, lint and typecheck pipelines. One `pnpm dev` boots both apps.',
    meta: 'turbo.json · apps/* · packages/*',
    accent: 'from-violet-500/25',
  },
  {
    icon: SquareCode,
    name: 'Next.js 16',
    role: 'Web application',
    description:
      'App Router with React 19, Tailwind v4 and shadcn/ui primitives. Server components by default.',
    meta: 'apps/web · :3000',
    accent: 'from-sky-500/25',
  },
  {
    icon: Server,
    name: 'Hono 4',
    role: 'Typed API with RPC',
    description:
      'Route schemas are exported as `AppType`, so the web app calls the API through `hc<AppType>` with full type-safety — no codegen.',
    meta: 'apps/api · :3001',
    accent: 'from-emerald-500/25',
  },
  {
    icon: Database,
    name: 'Drizzle + Turso',
    role: 'Database layer',
    description:
      'Typed libSQL schema for users, categories, quizzes, questions, options, attempts and answers. Migrations are checked in.',
    meta: 'packages/db · migrations/',
    accent: 'from-amber-500/25',
  },
];

export function StackGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stack.map((item) => (
        <Card key={item.name} className="group overflow-hidden">
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${item.accent} to-transparent opacity-60`}
          />
          <CardHeader className="relative">
            <div className="border-border/80 bg-background/60 text-primary mb-3 grid size-9 place-items-center rounded-lg border">
              <item.icon className="size-4" />
            </div>
            <CardTitle>{item.name}</CardTitle>
            <CardDescription>{item.role}</CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-1 flex-col gap-4">
            <p className="text-muted-foreground text-[13px] leading-relaxed">{item.description}</p>
            <Badge variant="secondary" className="mt-auto font-mono text-[10.5px] tracking-tight">
              {item.meta}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
