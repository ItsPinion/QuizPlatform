import {
  ArrowUpDown,
  Check,
  FolderTree,
  History,
  ListChecks,
  Lock,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { text: 'JSON.stringify()', correct: false },
  { text: 'JSON.parse()', correct: true },
  { text: 'JSON.convert()', correct: false },
  { text: 'JSON.object()', correct: false },
];

const CATEGORIES = [
  { name: 'JavaScript', quizzes: 3 },
  { name: 'Python', quizzes: 2 },
  { name: 'Database', quizzes: 1 },
  { name: 'Machine Learning', quizzes: 0 },
];

const CAPABILITIES = [
  {
    icon: ListChecks,
    title: 'One correct answer, by construction',
    body: 'A question is an ordered option set plus the index of the right one. The schema rejects fewer than two options, more than six, duplicates and an index that points nowhere — zero or two correct answers cannot be stored.',
  },
  {
    icon: History,
    title: 'Answers are history',
    body: 'Once a student has answered, the question can no longer be deleted (409 QUESTION_HAS_ANSWERS) and an option they picked cannot be removed. Edits update rows in place, so the ids past answers point at stay alive.',
  },
  {
    icon: ArrowUpDown,
    title: 'Order is data, not a date',
    body: 'Positions are compacted after every delete and rewritten on reorder, so the sequence students see is exactly the one the admin saved — no ties, no gaps, no relying on insertion time.',
  },
];

/** Landing-page preview of Day 6; the live screens are /admin/categories and a quiz's edit page. */
export function QuestionManagement() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <div className="border-border/70 bg-muted/20 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <span className="bg-warning/20 text-warning inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10.5px]">
              <Lock className="size-3" /> ADMIN
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              /api/admin/quizzes/:id/questions
            </span>
            <Badge variant="outline" className="ml-auto text-[9.5px]">
              question 1 of 4
            </Badge>
          </div>

          <CardContent className="space-y-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13.5px] leading-snug font-medium">
                Which method converts a JSON string into a JavaScript object?
              </p>
              <span className="text-muted-foreground shrink-0 font-mono text-[10.5px]">
                3 marks
              </span>
            </div>

            <ul className="grid gap-1.5 sm:grid-cols-2">
              {OPTIONS.map((option, index) => (
                <li
                  key={option.text}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]',
                    option.correct
                      ? 'border-success/40 bg-success/10'
                      : 'border-border/60 text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-full border font-mono text-[9px]',
                      option.correct
                        ? 'border-success bg-success/20 text-success'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className={cn('flex-1', option.correct && 'text-foreground')}>
                    {option.text}
                  </span>
                  {option.correct ? <Check className="text-success size-3.5" /> : null}
                </li>
              ))}
            </ul>

            <p className="border-border/60 text-muted-foreground rounded-md border border-dashed px-2.5 py-1.5 text-[11.5px]">
              <span className="text-foreground font-medium">Explanation:</span> JSON.parse() turns a
              string into an object; JSON.stringify() goes the other way.
            </p>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="text-success size-3.5" />
                <span className="font-mono">POST</span> → 201 at the end of the list
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ArrowUpDown className="text-primary size-3.5" />
                <span className="font-mono">PATCH /order</span> → whole new sequence
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="text-destructive size-3.5" />
                <span className="font-mono">DELETE</span> → 409 once answered
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FolderTree className="text-primary size-4" />
              Categories
            </CardTitle>
            <CardDescription className="text-[12px]">
              Full CRUD at{' '}
              <code className="bg-muted rounded px-1 font-mono">/admin/categories</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="space-y-1">
              {CATEGORIES.map((category) => (
                <li
                  key={category.name}
                  className="border-border/60 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[12px]"
                >
                  <span className={cn(category.quizzes === 0 && 'text-muted-foreground')}>
                    {category.name}
                  </span>
                  {category.quizzes > 0 ? (
                    <span className="text-muted-foreground font-mono text-[10.5px]">
                      {category.quizzes} quizzes
                    </span>
                  ) : (
                    <span className="text-success font-mono text-[10px]">deletable</span>
                  )}
                </li>
              ))}
            </ul>

            <p className="text-muted-foreground text-[11.5px] leading-relaxed">
              Renaming keeps the slug. Deleting a category that still holds quizzes answers{' '}
              <code className="bg-muted rounded px-1 font-mono">409 CATEGORY_HAS_QUIZZES</code> —
              the console disables the button and says how many.
            </p>
          </CardContent>
        </Card>
      </div>

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
            A quiz publishes the moment its first question exists — and a published quiz can never
            be left with none.
          </p>
          <Link
            href="/admin/categories"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <FolderTree />
            Manage categories
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
