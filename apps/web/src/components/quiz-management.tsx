import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  FileText,
  Lock,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const ROWS = [
  {
    title: 'HTML Fundamentals',
    category: 'HTML',
    status: 'PUBLISHED',
    questions: 8,
    attempts: 6,
    duration: '15 min',
  },
  {
    title: 'JavaScript Fundamentals',
    category: 'JavaScript',
    status: 'DRAFT',
    questions: 0,
    attempts: 0,
    duration: '20 min',
  },
  {
    title: 'React Hooks Deep Dive',
    category: 'React',
    status: 'UNPUBLISHED',
    questions: 6,
    attempts: 4,
    duration: '25 min',
  },
];

const STATUS_TONE: Record<string, 'success' | 'warning' | 'outline'> = {
  PUBLISHED: 'success',
  DRAFT: 'warning',
  UNPUBLISHED: 'outline',
};

const CAPABILITIES = [
  {
    icon: FileText,
    title: 'Content, not identifiers',
    body: 'The client sends a title and settings; the server derives the slug and keeps it stable, so renaming a quiz never breaks a link someone already holds.',
  },
  {
    icon: CircleCheck,
    title: 'Publishing is its own action',
    body: 'POST /:id/publish refuses a quiz with no questions (409 QUIZ_HAS_NO_QUESTIONS) and is idempotent; unpublishing something that is not live is a 409, not a silent no-op.',
  },
  {
    icon: Trash2,
    title: 'History is protected',
    body: 'A quiz with attempts cannot be deleted (409 QUIZ_HAS_ATTEMPTS) — unpublish it instead. The UI explains both rules before the button is even clicked.',
  },
];

/** Landing-page preview of Day 5; the live screens live under /admin/quizzes. */
export function QuizManagement() {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-border/70 bg-muted/20 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <span className="bg-warning/20 text-warning inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10.5px]">
            <Lock className="size-3" /> ADMIN
          </span>
          <span className="text-muted-foreground font-mono text-[11px]">
            /api/admin/quizzes · /admin/quizzes
          </span>
        </div>

        <CardContent className="space-y-4 py-4">
          {/* lifecycle */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="border-warning/30 bg-warning/10 text-warning inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono">
              <CircleDashed className="size-3" /> DRAFT
            </span>
            <ArrowRight className="text-muted-foreground size-3" />
            <span className="border-success/30 bg-success/10 text-success inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono">
              <CircleCheck className="size-3" /> PUBLISHED
            </span>
            <ArrowRight className="text-muted-foreground size-3" />
            <span className="border-border text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono">
              <CircleSlash className="size-3" /> UNPUBLISHED
            </span>
            <span className="text-muted-foreground/80 ml-auto font-mono text-[10px]">
              students only ever see PUBLISHED
            </span>
          </div>

          <div className="border-border/60 overflow-hidden rounded-lg border">
            <table className="w-full min-w-[560px] text-[11.5px]">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground border-border/60 border-b text-left text-[9.5px] tracking-wider uppercase">
                  <th className="px-3 py-1.5 font-medium">Quiz</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Questions</th>
                  <th className="px-2 py-1.5 font-medium">Attempts</th>
                  <th className="px-3 py-1.5 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-border/50 divide-y">
                {ROWS.map((row) => (
                  <tr key={row.title}>
                    <td className="px-3 py-2">
                      <span className="font-medium">{row.title}</span>
                      <span className="text-muted-foreground ml-1.5 text-[10.5px]">
                        {row.category}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant={STATUS_TONE[row.status]} className="text-[9.5px]">
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 tabular-nums">{row.questions}</td>
                    <td className="px-2 py-2 tabular-nums">{row.attempts}</td>
                    <td className="text-muted-foreground px-3 py-2 text-right">{row.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-muted-foreground grid gap-1.5 text-[11px] sm:grid-cols-2">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="text-success size-3.5" />
              <span className="font-mono">POST /:id/publish</span> → 409 without questions
            </p>
            <p className="flex items-center gap-1.5">
              <Trash2 className="text-destructive size-3.5" />
              <span className="font-mono">DELETE /:id</span> → 409 with attempts
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {CAPABILITIES.map((item) => (
          <div key={item.title} className="border-border/70 bg-background/40 rounded-xl border p-4">
            <item.icon className="text-primary size-4" />
            <h3 className="mt-2.5 text-[13px] font-medium">{item.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>

      <Card className="py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-[12px]">
            Ten seeded quizzes across ten categories are ready to edit, publish and unpublish.
          </p>
          <Link href="/admin/quizzes" className={cn(buttonVariants({ size: 'sm' }))}>
            Open /admin/quizzes
            <ArrowRight />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
